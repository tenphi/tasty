import {
  getConfig,
  getConfiguredOverrides,
  getGlobalRecipes,
  isFunctionsPolyfillEnabled,
} from '../config';
import { getGlobalPredefinedStates } from '../states';
import { hashString } from '../utils/hash';
import {
  getGlobalParseFunctions,
  getGlobalParser,
  getGlobalPredefinedTokens,
} from '../utils/styles';

import type { TastyCompilationConfig } from './types';

/**
 * A stable token for an arbitrary configuration value.
 *
 * Function-valued entries (unit handlers, parse functions) cannot be compared
 * by body: a catalog is compiled from an unminified build while the runtime may
 * be reading a minified one, so `toString()` differs for identical behaviour and
 * would reject every production bundle. Their presence and arity are recorded
 * instead, which catches an entry being added, removed or swapped for one of a
 * different shape — not a rewritten body. That gap is documented on
 * `TastyCompilationConfig`.
 */
function token(value: unknown): string {
  if (typeof value === 'function') return `fn/${value.length}`;
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `s/${hashString(value)}`;

  return `j/${hashString(stableStringify(value))}`;
}

/** JSON with object keys sorted, so key order cannot change the token. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/**
 * Entries recorded in `configure()` order, deduped into a comparable map.
 * Later calls win, matching how `configure()` merges them.
 */
function named(
  entries: readonly (readonly [string, unknown])[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, definition] of entries) out[name] = definition;

  return out;
}

function tokenize(
  source: Record<string, unknown> | null | undefined,
  prefix: string,
) {
  const out: Record<string, string> = {};
  if (!source) return out;

  for (const key of Object.keys(source).sort()) {
    out[`${prefix}:${key}`] = token(source[key]);
  }

  return out;
}

/**
 * Snapshot the configuration a precompiled catalog was compiled under.
 *
 * Read at build time into the manifest, and again at runtime once the config
 * locks, so the two can be compared before any lookup trusts the catalog.
 */
export function captureCompilationConfig(): TastyCompilationConfig {
  const config = getConfig();
  const parser = getGlobalParser();
  const overrides = getConfiguredOverrides();

  return {
    scoped: {
      ...tokenize(getGlobalPredefinedStates(), 'state'),
      ...tokenize(parser.getUnits() as Record<string, unknown>, 'unit'),
      ...tokenize(getGlobalRecipes(), 'recipe'),
      // Declarative `$$` CSS functions, read from what the host passed to
      // `configure()` rather than from `getGlobalFunctions()`. With
      // `polyfills.functions` enabled that registry stays empty and only a
      // synthesized closure remains, so rewriting `$$scale` from
      // `2 * $value` to `3 * $value` would keep the same name and arity and
      // compare equal while the expanded CSS changed.
      ...tokenize(named(overrides.functions), 'fn'),
      // Bare-key parse functions, which live in their own registry. Recorded
      // by presence and arity only — see `token()`.
      ...tokenize(getGlobalParseFunctions(), 'parseFn'),
      // `replaceTokens` only. Its values are substituted at parse time and
      // baked into the declaration (`padding: 8px`), so a changed value makes
      // a compiled chunk wrong while its lookup key — a hash of the style
      // source — stays the same.
      //
      // `configure({ tokens })` deliberately does NOT belong here. Those emit
      // `:root` custom properties, which the catalog excludes, and a chunk
      // using `#brand` compiles to `var(--brand-color)` whatever the current
      // value is. The runtime `:root` rule supplies the new value, so the
      // chunk stays correct across a palette change — and fingerprinting them
      // would disable the whole catalog on every theme, which is exactly the
      // dynamic behaviour `docs/precompile.md` promises.
      ...tokenize(getGlobalPredefinedTokens(), 'replaceToken'),
    },
    // Names the host passed to `configure()`, not the live handler registry:
    // that registry is populated lazily as styles are encountered, so it
    // describes which styles have rendered so far rather than configuration.
    exclusive: {
      ...tokenize(named(overrides.handlers), 'handler'),
      ...tokenize(named(overrides.propHandlers), 'propHandler'),
    },
    scalars: {
      // Compare effective behaviour, not the literal setting: the default is
      // enabled, so an omitted value and an explicit `true` are the same thing
      // and must not read as a divergence.
      autoPropertyTypes: String(config.autoPropertyTypes !== false),
      functionsPolyfill: String(isFunctionsPolyfillEnabled()),
    },
  };
}

/**
 * Describe every way `runtime` would compile differently from `compiled`.
 *
 * An empty result means the catalog's CSS is still what this configuration
 * would produce. Names are reported rather than counted so the warning tells
 * the consumer which setting to look at.
 */
export function diffCompilationConfig(
  compiled: TastyCompilationConfig,
  runtime: TastyCompilationConfig,
): string[] {
  const reasons: string[] = [];

  for (const [key, value] of Object.entries(compiled.scalars)) {
    const current = runtime.scalars[key];
    if (current !== value) {
      reasons.push(`${key} changed`);
    }
  }

  // A name the catalog never saw cannot change a chunk it already compiled, so
  // additions are accepted here; a changed or dropped one is not.
  for (const [key, value] of Object.entries(compiled.scoped)) {
    const current = runtime.scoped[key];
    if (current === undefined) {
      reasons.push(`${key} removed`);
    } else if (current !== value) {
      reasons.push(`${key} changed`);
    }
  }

  // These record deviations from Tasty's built-in tables, which `tastyVersion`
  // already pins. A runtime-only entry is therefore an override of a built-in
  // the catalog may have compiled against, so extra keys count too.
  const exclusiveKeys = new Set([
    ...Object.keys(compiled.exclusive),
    ...Object.keys(runtime.exclusive),
  ]);
  for (const key of exclusiveKeys) {
    const before = compiled.exclusive[key];
    const after = runtime.exclusive[key];
    if (before === after) continue;
    reasons.push(
      before === undefined
        ? `${key} added`
        : after === undefined
          ? `${key} removed`
          : `${key} changed`,
    );
  }

  return reasons.sort();
}

export function isCompilationConfigShapeValid(
  value: TastyCompilationConfig | undefined,
): boolean {
  const isTokenMap = (map: unknown) =>
    !!map &&
    typeof map === 'object' &&
    !Array.isArray(map) &&
    Object.values(map as Record<string, unknown>).every(
      (item) => typeof item === 'string',
    );

  return (
    !!value &&
    isTokenMap(value.scoped) &&
    isTokenMap(value.exclusive) &&
    isTokenMap(value.scalars)
  );
}
