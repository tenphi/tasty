/**
 * tasty:styles — prints the CSS Tasty generates for a styles object, with the
 * app's configuration loaded first, and flags values that stayed unresolved.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  configChanged,
  configSummary,
  describeUnits,
  findIssues,
  formatCss,
  renderCss,
} from './render.mjs';

const USAGE = `Usage: npx harnesspm run tasty:styles '<styles JSON>' [--setup <module>]... [--json]

Prints the CSS Tasty generates for a styles object, as tasty() and useStyles()
render it: recipes resolved, one class per style chunk, and every state as a
selector or an at-rule. To see what a state key becomes, put it in a state map.

<styles JSON>  the styles object as JSON, such as '{"fill":"#surface","padding":"2x"}'.
               Use - to read it from stdin.
--setup        a module that configures Tasty, imported before rendering: one that
               calls configure() when imported, or one that default-exports a
               configure() object, such as a tasty-zero.config.ts. A file path, or
               a path inside a package, such as @acme/ui/dist/setup.js. Repeat it
               for several modules. TypeScript needs Node 22.18 or later.
--json         print the result as JSON

Without --setup, the CSS uses Tasty's defaults (x = 8px, r = 6px, ...) and none
of the app's units, presets, recipes or state aliases.`;

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BUILD = join(PACKAGE_ROOT, 'dist/core/index.js');
const projectDir = process.env.HARNESSPM_PROJECT_DIR || process.cwd();

function fail(message) {
  console.error(`tasty: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = { setup: [] };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-' || !arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s);
    if (key === 'json' || key === 'help') options[key] = true;
    else if (key === 'setup') {
      const value = inline ?? argv[++i];
      if (value === undefined) fail('--setup needs a module');
      options.setup.push(value);
    } else fail(`unknown option --${key}`);
  }
  return { options, positional };
}

const { options, positional } = parseArgs(process.argv.slice(2));
if (options.help || positional.length !== 1) {
  console.log(USAGE);
  process.exit(options.help ? 0 : 2);
}

const source = positional[0] === '-' ? readFileSync(0, 'utf8') : positional[0];
let styles;
try {
  styles = JSON.parse(source);
} catch (error) {
  fail(
    `the styles must be JSON, with keys and strings in double quotes: ${error instanceof Error ? error.message : error}`,
  );
}
if (!styles || typeof styles !== 'object' || Array.isArray(styles)) {
  fail('the styles must be a JSON object');
}

if (!existsSync(BUILD)) {
  fail(
    `cannot find the Tasty build at ${BUILD}. In the Tasty repository, run \`pnpm build\` first.`,
  );
}

// Tasty warns only in development, and the warnings are part of the answer.
process.env.NODE_ENV = 'development';

// Tasty reports problems with console.warn, also while a setup module is
// imported, so collect them from the start.
const tastyWarnings = [];
const warn = console.warn;
console.warn = (...args) => tastyWarnings.push(args.map(String).join(' '));

const t = await import(pathToFileURL(BUILD).href);
const version = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
).version;

const before = configSummary(t);
const loaded = [];
for (const spec of options.setup) {
  const file = resolveSetup(spec);
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (error) {
    console.warn = warn;
    fail(`cannot import --setup ${spec}: ${importHint(file, error)}`);
  }
  const config = mod.default;
  if (config && Object.getPrototypeOf(config) === Object.prototype) {
    try {
      t.configure(config);
    } catch (error) {
      console.warn = warn;
      fail(
        `configure() rejected the default export of ${spec}: ${error instanceof Error ? error.message : error}`,
      );
    }
    loaded.push({ module: spec, configured: 'default export' });
  } else {
    loaded.push({ module: spec, configured: 'on import' });
  }
}
const config = configSummary(t);

const warnings = [];
if (loaded.length === 0) {
  const candidates = findSetupCandidates(projectDir);
  warnings.push(
    candidates.length > 0
      ? `No --setup: this is the CSS for Tasty's defaults, not the app's config. These files configure Tasty: ${candidates.join(', ')}. Run again with --setup <file>.`
      : "No --setup: this is the CSS for Tasty's defaults. No file in this project calls configure() from @tenphi/tasty. If the app configures Tasty elsewhere, such as in a UI library, pass that module with --setup.",
  );
} else if (!configChanged(before, config)) {
  warnings.push(
    `The --setup modules did not change the configuration of the Tasty copy this tool uses (${relative(projectDir, PACKAGE_ROOT) || '.'}). They may configure another copy of @tenphi/tasty, or call configure() only inside a function.`,
  );
}

let result;
try {
  result = renderCss(t, styles);
} catch (error) {
  console.warn = warn;
  fail(
    `Tasty could not render these styles: ${error instanceof Error ? error.message : error}`,
  );
}
warnings.push(...findIssues(t, styles, result.css));
console.warn = warn;
warnings.push(
  ...new Set(tastyWarnings.map((w) => w.trim().replace(/\s*\n\s*/g, ' '))),
);

if (options.json) {
  console.log(
    JSON.stringify(
      {
        tasty: { version, path: relative(projectDir, PACKAGE_ROOT) || '.' },
        setup: loaded,
        config,
        classNames: result.classNames,
        css: result.css,
        warnings,
      },
      null,
      2,
    ),
  );
} else {
  console.log(render());
}

function render() {
  const out = [];
  const setup =
    loaded.length > 0
      ? `setup ${loaded.map((l) => l.module).join(', ')}`
      : 'no setup, Tasty defaults';
  out.push(`Tasty ${version}, ${setup}`);
  const parts = [`units ${describeUnits(config.units)}`];
  if (config.states.length > 0) parts.push(`states ${list(config.states)}`);
  if (config.recipes.length > 0) parts.push(`recipes ${list(config.recipes)}`);
  out.push(`Config: ${parts.join('; ')}`);
  if (result.classNames.length > 0) {
    out.push(
      `Classes: ${result.classNames.join(' ')} (one per style chunk, doubled in selectors as at runtime)`,
    );
  }
  out.push('', result.css ? formatCss(result.css) : '(no CSS)');
  if (warnings.length > 0) {
    out.push('', 'Warnings:', ...warnings.map((w) => `- ${w}`));
  }
  return out.join('\n');
}

function list(names) {
  return names.length <= 8
    ? names.join(', ')
    : `${names.slice(0, 8).join(', ')} and ${names.length - 8} more`;
}

/** A file path, or a path inside a package installed in the project. */
function resolveSetup(spec) {
  if (
    /(^|\/)tasty\.config\.[cm]?[jt]s$|(^|\/)tasty\.config\.json$/.test(spec)
  ) {
    fail(
      `${spec} only lists names for the ESLint plugin and the editor. Pass the module that calls configure(), or one that default-exports its config.`,
    );
  }
  const asPath = resolve(spec);
  if (spec.startsWith('.') || isAbsolute(spec) || existsSync(asPath)) {
    if (!existsSync(asPath)) fail(`cannot find --setup ${spec}`);
    return asPath;
  }
  try {
    return createRequire(join(projectDir, 'package.json')).resolve(spec);
  } catch {
    // A path the package's exports do not list, such as a file in its dist/.
  }
  for (let dir = projectDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', spec);
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) break;
  }
  return fail(`cannot resolve --setup ${spec} from ${projectDir}`);
}

function importHint(file, error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' ? error.code : undefined;
  if (code === 'ERR_UNKNOWN_FILE_EXTENSION') {
    return `${message}. Node cannot import this file type. Pass a module without JSX, a built .js file, or a .ts file on Node 22.18 or later.`;
  }
  if (code === 'ERR_MODULE_NOT_FOUND' && /\.[cm]?tsx?$/.test(file)) {
    return `${message}. Node needs full file extensions in relative imports, and does not read tsconfig paths.`;
  }
  return message;
}

/** Up to five project files that import Tasty and configure it. */
function findSetupCandidates(root) {
  const SKIP = new Set([
    'node_modules',
    'dist',
    'build',
    'out',
    'coverage',
    'storybook-static',
  ]);
  const found = [];
  let budget = 5000;
  const walk = (dir, depth) => {
    if (depth > 6 || found.length >= 5) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= 5 || --budget < 0) return;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIP.has(entry.name)) {
          walk(path, depth + 1);
        }
      } else if (
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        !/\.(test|spec|stories|d)\.[cm]?[jt]sx?$/.test(entry.name) &&
        !/^tasty\.config\./.test(entry.name)
      ) {
        try {
          if (statSync(path).size > 256 * 1024) continue;
          const text = readFileSync(path, 'utf8');
          if (
            /['"]@tenphi\/tasty(\/[\w/-]*)?['"]/.test(text) &&
            /\b(configure|setGlobalPredefinedStates)\s*\(/.test(text)
          ) {
            found.push(relative(root, path));
          } else if (/^tasty[\w.-]*\.config\.[cm]?[jt]s$/.test(entry.name)) {
            found.push(relative(root, path));
          }
        } catch {
          // Unreadable files are not candidates.
        }
      }
    }
  };
  walk(root, 0);
  return found;
}
