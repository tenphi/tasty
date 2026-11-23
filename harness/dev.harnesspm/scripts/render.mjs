/**
 * What `tasty:styles` computes. Every function that reads Tasty takes the
 * Tasty module as its first argument: the tool passes the package's `dist/`
 * build, and `src/harness.test.ts` passes the source, so the tests need no
 * build.
 */

/** CSS units. A number with any other unit in the output stayed raw. */
const CSS_UNITS = new Set([
  'px',
  'em',
  'rem',
  'ex',
  'rex',
  'ch',
  'rch',
  'cap',
  'rcap',
  'ic',
  'ric',
  'lh',
  'rlh',
  'vw',
  'vh',
  'vi',
  'vb',
  'vmin',
  'vmax',
  'svw',
  'svh',
  'svi',
  'svb',
  'svmin',
  'svmax',
  'lvw',
  'lvh',
  'lvi',
  'lvb',
  'lvmin',
  'lvmax',
  'dvw',
  'dvh',
  'dvi',
  'dvb',
  'dvmin',
  'dvmax',
  'cqw',
  'cqh',
  'cqi',
  'cqb',
  'cqmin',
  'cqmax',
  'cm',
  'mm',
  'q',
  'in',
  'pt',
  'pc',
  'deg',
  'grad',
  'rad',
  'turn',
  's',
  'ms',
  'hz',
  'khz',
  'dpi',
  'dpcm',
  'dppx',
  'x',
  'fr',
]);

/** Words in a `preset` value that are modifiers, not preset names. */
const PRESET_MODIFIERS = new Set([
  'strong',
  'bold',
  'italic',
  'icon',
  'tight',
  'normal',
]);

// Tasty shares these configured resources across copies through globalThis.
const CONFIG_TOKENS_KEY = '__tasty_cfg_tokens__';
const CONFIG_PROPERTIES_KEY = '__tasty_cfg_properties__';
const CONFIG_GLOBAL_STYLES_KEY = '__tasty_cfg_global_styles__';

// The core entry point does not expose its default @property definitions.
const DEFAULT_PROPERTIES = [
  '--tasty-second-fill-color',
  '--current-color',
  '--white-color',
  '--black-color',
  '--border-color',
  '--outline-color',
  '--gap',
  '--radius',
  '--border-width',
  '--outline-width',
  '--transition',
  '--sharp-radius',
  '--bold-font-weight',
  '--font-sans-fallback',
  '--font-mono-fallback',
];

/** The parts of the configuration that a setup module changes. */
export function configSummary(t) {
  return {
    units: { ...(t.getGlobalParser().getUnits() ?? {}) },
    states: Object.keys(t.getGlobalPredefinedStates() ?? {}),
    recipes: Object.keys(t.getGlobalRecipes() ?? {}),
    tokens: Object.keys(globalThis[CONFIG_TOKENS_KEY] ?? {}),
  };
}

/**
 * The parts of the configuration that belong to one copy of Tasty. Tokens are
 * left out: Tasty shares them between copies through `globalThis`.
 */
export function configFingerprint(t) {
  const { units, states, recipes } = configSummary(t);
  return { units, states, recipes };
}

/** Whether two `configSummary()` or `configFingerprint()` results differ. */
export function configChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * The CSS Tasty generates for a styles object, through `computeStyles()`:
 * the render core `tasty()` and `useStyles()` share. Recipes are resolved,
 * each style chunk gets its own class, and keyframes get their final names.
 */
export function renderCss(t, styles) {
  const { className, css } = t.computeStyles(styles);
  return {
    classNames: (className ?? '').split(' ').filter(Boolean),
    css: css ?? '',
  };
}

/**
 * Splits CSS text into a tree: `{ prelude, children }` for a block and
 * `{ property, value }` for a declaration. Strings and parentheses are kept
 * whole, so a `;` or `{` inside them does not split.
 */
export function parseCss(css) {
  const root = { prelude: '', children: [] };
  const stack = [root];
  let buffer = '';
  let quote = '';
  let escaped = false;
  let depth = 0;

  const flush = () => {
    const text = buffer.trim();
    buffer = '';
    if (!text) return;
    const colon = text.indexOf(':');
    const node =
      colon > 0
        ? {
            property: text.slice(0, colon).trim(),
            value: text.slice(colon + 1).trim(),
          }
        : { property: '', value: text };
    stack.at(-1).children.push(node);
  };

  for (const char of css) {
    if (quote) {
      buffer += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      buffer += char;
    } else if (char === '(') {
      depth++;
      buffer += char;
    } else if (char === ')') {
      depth = Math.max(0, depth - 1);
      buffer += char;
    } else if (depth > 0) {
      buffer += char;
    } else if (char === '{') {
      const block = { prelude: buffer.trim(), children: [] };
      buffer = '';
      stack.at(-1).children.push(block);
      stack.push(block);
    } else if (char === ';') {
      flush();
    } else if (char === '}') {
      flush();
      if (stack.length > 1) stack.pop();
    } else {
      buffer += char;
    }
  }
  flush();
  return root.children;
}

/** CSS text, one declaration per line, blocks indented. */
export function formatCss(css) {
  const lines = [];
  const write = (nodes, indent) => {
    for (const node of nodes) {
      if ('prelude' in node) {
        if (indent === '' && lines.length > 0) lines.push('');
        lines.push(`${indent}${node.prelude} {`);
        write(node.children, `${indent}  `);
        lines.push(`${indent}}`);
      } else if (node.property) {
        lines.push(`${indent}${node.property}: ${node.value};`);
      } else {
        lines.push(`${indent}${node.value}`);
      }
    }
  };
  write(parseCss(css), '');
  return lines.join('\n');
}

/** Declarations and @property names at any depth. */
function inspectCss(css) {
  const declarations = [];
  const properties = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      if ('prelude' in node) {
        const registration = /^@property\s+(--[\w-]+)$/.exec(node.prelude);
        if (registration) properties.add(registration[1]);
        walk(node.children);
      } else if (node.property) {
        declarations.push(node);
        if (node.property.startsWith('--')) properties.add(node.property);
      }
    }
  };
  walk(parseCss(css));
  return { declarations, properties };
}

/**
 * The string values of one style property in a styles object and its
 * sub-elements, including each value of a state map.
 */
function valuesOf(styles, property) {
  const found = [];
  const collect = (value) => {
    if (typeof value === 'string') found.push(value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const inner of Object.values(value)) collect(inner);
    }
  };
  const walk = (object) => {
    for (const [key, value] of Object.entries(object)) {
      if (key === property) collect(value);
      else if (
        /^[A-Z]/.test(key) &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        walk(value);
      }
    }
  };
  walk(styles);
  return found;
}

function cssNameOf(token, normalize = false) {
  const sigil = token[0];
  if (sigil !== '#' && sigil !== '$') {
    return token.startsWith('--') ? token : `--${token}`;
  }
  const name = token.slice(1);
  // The DSL folds the first letter. Registered CSS properties keep their name.
  const cssName = normalize
    ? name.charAt(0).toLowerCase() + name.slice(1)
    : name;
  return `--${cssName}${sigil === '#' ? '-color' : ''}`;
}

function withoutLiterals(value) {
  return value
    .replace(
      /\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g,
      ' ',
    )
    .replace(/\burl\((?:\\[\s\S]|[^)\\])*\)/gi, ' ');
}

/** Authored DSL references that survive rendering as a var() without a fallback. */
function findTokenIssues(t, styles, tokens, { declarations, properties }) {
  const references = new Set();
  for (const { value } of declarations) {
    for (const [, name] of withoutLiterals(value).matchAll(
      /(?<![\w-])var\(\s*(--[\w-]+)\s*\)/gi,
    )) {
      references.add(name);
    }
  }
  if (references.size === 0) return [];

  const defined = new Set([
    ...DEFAULT_PROPERTIES,
    ...properties,
    ...tokens.map((token) => cssNameOf(token, true)),
    ...Object.keys(globalThis[CONFIG_PROPERTIES_KEY] ?? {}).map((name) =>
      cssNameOf(name),
    ),
  ]);
  const missing = new Map();
  const walk = (value) => {
    if (typeof value === 'string') {
      for (const [token] of withoutLiterals(value).matchAll(
        /(?<![#$\\])[#$][\w-]+/g,
      )) {
        const name = cssNameOf(token, true);
        if (references.has(name) && !defined.has(name))
          missing.set(token, name);
      }
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) walk(child);
    }
  };
  walk(styles);
  if (missing.size === 0) return [];

  for (const [selector, globalStyles] of Object.entries(
    globalThis[CONFIG_GLOBAL_STYLES_KEY] ?? {},
  )) {
    for (const rule of t.renderStyles(globalStyles, selector)) {
      for (const property of inspectCss(rule.declarations).properties) {
        defined.add(property);
      }
    }
  }

  return [...missing]
    .filter(([, name]) => !defined.has(name))
    .map(([token, name]) => {
      const color = token.startsWith('#');
      const known = tokens.filter((key) => key[0] === token[0]).slice(0, 8);
      const example = known.length
        ? ` Known ${color ? 'colors' : 'tokens'} include ${known.join(', ')}.`
        : '';
      return `${color ? 'Color' : 'Token'} "${token}" is not in the loaded config. Its CSS variable var(${name}) needs a value from other CSS.${example}`;
    });
}

/**
 * Values the CSS shows Tasty did not resolve, and names the loaded
 * configuration does not define. Each issue is one sentence that says what to
 * do. Tasty's own warnings are collected by the tool, not here.
 */
export function findIssues(t, styles, css) {
  const issues = [];

  // Once any recipe is configured, Tasty warns about an unknown one itself.
  // With none configured, it drops every recipe silently.
  if (!t.hasGlobalRecipes()) {
    const names = new Set(
      valuesOf(styles, 'recipe')
        .flatMap((value) => value.split(/[\s/]+/))
        .filter((name) => name && name !== 'none'),
    );
    for (const name of names) {
      issues.push(
        `Recipe "${name}" was dropped: no recipes are configured. Load the module that configures recipes with --setup.`,
      );
    }
  }

  const tokens = Object.keys(globalThis[CONFIG_TOKENS_KEY] ?? {});
  const presets = new Set(
    tokens
      .filter((token) => token.endsWith('-font-size'))
      .map((token) => token.slice(1, -'-font-size'.length)),
  );
  // Without typography tokens in the config, presets come from CSS this tool
  // cannot see, so their names are not checked.
  if (presets.size > 0) {
    const missingPresets = new Set();
    for (const value of valuesOf(styles, 'preset')) {
      const name = value
        .split(/[\s/]+/)
        .find((word) => word && !PRESET_MODIFIERS.has(word));
      if (name && name !== 'inherit' && !presets.has(name)) {
        missingPresets.add(name);
      }
    }
    for (const name of missingPresets) {
      issues.push(
        `Preset "${name}" is not in the loaded config, so its font falls back to the default preset. Known presets: ${[...presets].join(', ')}.`,
      );
    }
  }

  const rendered = inspectCss(css);
  if (tokens.length > 0) {
    issues.push(...findTokenIssues(t, styles, tokens, rendered));
  }

  const rawUnits = new Map();
  for (const { property, value } of rendered.declarations) {
    if (property.startsWith('--')) continue;
    for (const match of value.matchAll(
      /(?<![\w#.$-])(-?(?:\d+\.?\d*|\.\d+))([a-zA-Z]+)(?![\w(-])/g,
    )) {
      if (!CSS_UNITS.has(match[2].toLowerCase())) {
        rawUnits.set(`${match[0]} ${property}`, [match[0], match[2], property]);
      }
    }
  }
  for (const [value, unit, property] of rawUnits.values()) {
    issues.push(
      `"${value}" in ${property} reached the CSS unchanged: "${unit}" is not a Tasty or CSS unit. Check the unit, or load the module that configures units with --setup.`,
    );
  }

  return issues;
}

/** How a unit list reads in the tool's header: `x = var(--gap), r = 6px`. */
export function describeUnits(units) {
  return Object.entries(units)
    .map(([name, value]) =>
      typeof value === 'string' ? `${name} = ${value}` : `${name} = (function)`,
    )
    .join(', ');
}
