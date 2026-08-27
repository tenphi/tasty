/**
 * Public API surface snapshot.
 *
 * Guards every subpath declared in `package.json` `exports` against accidental
 * additions, removals, and renames. The snapshot lives in
 * `src/__snapshots__/public-api.md` and is meant to be read in a PR diff: a
 * rename shows up as an adjacent `-`/`+` pair, a removal as a lone `-`. Any
 * diff in that file must be reflected in a changeset.
 *
 * Exports are enumerated with the TypeScript compiler API rather than a runtime
 * `import()` so that **types are covered too** (they vanish at runtime) and so
 * that no module is actually evaluated — several entry points are declared
 * side-effectful (`ssr/index`, `ssr/next`, `ssr/astro-client`) and others pull
 * Babel or Next.js (`zero/babel`, `zero/next`).
 *
 * A small runtime cross-check is layered on top for the two entry points that
 * are safe to import, so a value silently becoming type-only is still caught.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import ts from 'typescript';

const REPO_ROOT = resolve(__dirname, '..');

/** `.d.ts` output path -> source file, e.g. `./dist/ssr/astro.d.ts` -> `src/ssr/astro.ts`. */
function distTypesToSource(distPath: string): string {
  const rel = distPath.replace(/^\.\//, '').replace(/^dist\//, '');

  return `src/${rel.replace(/\.d\.ts$/, '.ts')}`;
}

interface Subpath {
  /** Import specifier, e.g. `@tenphi/tasty/core`. */
  specifier: string;
  /** Repo-relative source file. */
  source: string;
}

/**
 * Derive the subpath list from `package.json` so a new export cannot be added
 * without this snapshot noticing.
 *
 * `./tasty.config` is excluded: it points straight at `tasty.config.ts`, a user
 * config helper rather than an API surface. Its presence is asserted separately.
 */
function readSubpaths(): { subpaths: Subpath[]; hasTastyConfig: boolean } {
  const pkg = JSON.parse(
    readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'),
  ) as {
    name: string;
    exports: Record<string, { types?: string } | string>;
  };

  const subpaths: Subpath[] = [];
  let hasTastyConfig = false;

  for (const [key, value] of Object.entries(pkg.exports)) {
    if (key === './tasty.config') {
      hasTastyConfig = true;
      continue;
    }

    if (typeof value === 'string' || !value.types) {
      throw new Error(
        `[public-api] Export "${key}" has no "types" entry; cannot map it to a source file.`,
      );
    }

    subpaths.push({
      specifier: key === '.' ? pkg.name : `${pkg.name}${key.slice(1)}`,
      source: distTypesToSource(value.types),
    });
  }

  return { subpaths, hasTastyConfig };
}

type ExportKind = 'value' | 'type' | 'value+type';

interface ExportEntry {
  name: string;
  kind: ExportKind;
}

/**
 * Classify a symbol as value / type / both, following alias chains so
 * `export { x } from './y'` is classified by what `x` actually is.
 */
function classify(symbol: ts.Symbol, checker: ts.TypeChecker): ExportKind {
  let resolved = symbol;

  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      resolved = checker.getAliasedSymbol(symbol);
    } catch {
      // Unresolvable alias (e.g. a missing module); fall back to the alias itself.
    }
  }

  const isValue = (resolved.flags & ts.SymbolFlags.Value) !== 0;
  const isType = (resolved.flags & ts.SymbolFlags.Type) !== 0;

  if (isValue && isType) return 'value+type';
  if (isType) return 'type';

  return 'value';
}

function createProgram(rootNames: string[]): ts.Program {
  const configPath = resolve(REPO_ROOT, 'tsconfig.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(
      `[public-api] Failed to read tsconfig.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, ' ')}`,
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath),
  );

  return ts.createProgram({
    rootNames,
    options: { ...parsed.options, noEmit: true },
  });
}

function collectExports(subpaths: Subpath[]): Map<string, ExportEntry[]> {
  const program = createProgram(
    subpaths.map(({ source }) => resolve(REPO_ROOT, source)),
  );
  const checker = program.getTypeChecker();
  const result = new Map<string, ExportEntry[]>();

  for (const { specifier, source } of subpaths) {
    const sourceFile = program.getSourceFile(resolve(REPO_ROOT, source));

    if (!sourceFile) {
      throw new Error(`[public-api] Source file not found: ${source}`);
    }

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

    // A module with no exports has no symbol at all (e.g. `ssr/astro-client`,
    // which exists purely for its side effects).
    const entries: ExportEntry[] = moduleSymbol
      ? checker
          .getExportsOfModule(moduleSymbol)
          .map((symbol) => ({
            name: symbol.getName(),
            kind: classify(symbol, checker),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    result.set(specifier, entries);
  }

  return result;
}

function formatSnapshot(exportsBySubpath: Map<string, ExportEntry[]>): string {
  const lines: string[] = [
    '# Public API surface',
    '',
    '<!-- Generated by src/public-api.test.ts. Do not edit by hand. -->',
    '',
    'Every export of every `package.json` subpath, grouped by import specifier.',
    'A diff here is a public API change and must be reflected in a changeset.',
    '',
  ];

  for (const [specifier, entries] of exportsBySubpath) {
    lines.push(`## ${specifier}`, '');

    if (entries.length === 0) {
      lines.push('_(no exports — side effects only)_', '');
      continue;
    }

    for (const { name, kind } of entries) {
      lines.push(`${kind.padEnd(10)} ${name}`);
    }

    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

describe('public API surface', () => {
  const { subpaths, hasTastyConfig } = readSubpaths();
  const exportsBySubpath = collectExports(subpaths);

  it('matches the recorded snapshot', async () => {
    await expect(formatSnapshot(exportsBySubpath)).toMatchFileSnapshot(
      resolve(__dirname, '__snapshots__/public-api.md'),
    );
  });

  it('exports ./tasty.config for the ESLint plugin and VS Code extension', () => {
    expect(hasTastyConfig).toBe(true);
  });

  // Cross-check the two entry points that are safe to evaluate. The compiler
  // pass above cannot tell a value that was accidentally turned into a
  // type-only export from one that still exists at runtime.
  //
  // The generous timeout is for the dynamic import: it transforms the whole
  // entry point, which overruns the 5s default whenever the browser project is
  // competing for the same cores.
  describe.each([
    ['@tenphi/tasty', () => import('./index')],
    ['@tenphi/tasty/core', () => import('./core/index')],
  ])('%s runtime exports', (specifier, load) => {
    it('match the value-flagged names from the compiler pass', async () => {
      const expected = (exportsBySubpath.get(specifier) ?? [])
        .filter(({ kind }) => kind !== 'type')
        .map(({ name }) => name)
        .sort();

      const actual = Object.keys(await load()).sort();

      expect(actual).toEqual(expected);
    }, 30_000);
  });
});
