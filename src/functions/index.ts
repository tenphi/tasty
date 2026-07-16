/**
 * Function Utilities
 *
 * Utilities for extracting and processing CSS @function definitions in styles.
 * Custom functions are permanent once injected and do not need cleanup.
 *
 * Token syntax:
 * - Function name keys use `$$name` (the literal callable `--name`), matching
 *   the call site `$$name(...)`. `$name` and `--name` are also accepted.
 * - Parameters and local variables use `$name` (declared/referenced as a custom
 *   property), exactly like a normal styles object.
 * - `result`, local-variable values, and parameter defaults flow through the
 *   Tasty DSL parser, so units, color tokens, auto-calc, and fallbacks all work.
 */

import type { FunctionDefinition, FunctionParameter } from '../injector/types';
import type { StyleDetails } from '../parser/types';
import type { Styles } from '../styles/types';
import { customFunc, parseStyle } from '../utils/styles';

// ============================================================================
// Constants
// ============================================================================

const FUNCTION_KEY = '@function';

/** Descriptor keys that are not local-variable declarations. */
const RESERVED_KEYS = new Set(['args', 'returns', 'result']);

/**
 * A parse-time function: receives the parsed (comma-separated) argument groups
 * and returns a CSS value string. This is the JS flavor of the unified
 * `functions` config (bare-name keys), distinct from declarative `@function`
 * definitions (`$$`-prefixed keys).
 */
export type ParseFunction = (groups: StyleDetails[]) => string;

/**
 * The unified `functions` map: keys are either bare names (parse functions,
 * value is a function) or `$$name`/`$name`/`--name` (declarative CSS functions,
 * value is a {@link FunctionDefinition} object).
 */
export type FunctionsConfig = Record<
  string,
  FunctionDefinition | ParseFunction
>;

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Check if styles object has a local @function definition.
 */
export function hasLocalFunctions(styles: Styles): boolean {
  return FUNCTION_KEY in styles;
}

/**
 * Extract local @function definitions from a styles object.
 * Returns null if none (fast path).
 */
export function extractLocalFunctions(
  styles: Styles,
): Record<string, FunctionDefinition> | null {
  const functions = styles[FUNCTION_KEY];
  if (!functions || typeof functions !== 'object') {
    return null;
  }
  return functions as Record<string, FunctionDefinition>;
}

// ============================================================================
// Token Parsing
// ============================================================================

/**
 * Parse a function name token into its CSS custom name.
 * Accepts `$$name`, `$name`, `--name`, or bare `name` → `--name`.
 */
export function parseFunctionName(token: string): string {
  if (token.startsWith('$$')) return `--${token.slice(2)}`;
  if (token.startsWith('$')) return `--${token.slice(1)}`;
  if (token.startsWith('--')) return token;
  return `--${token}`;
}

/**
 * Parse a parameter / local-variable name token into its CSS custom name.
 * Accepts `$name`, `--name`, or bare `name` → `--name`.
 */
export function parseParamName(token: string): string {
  if (token.startsWith('$')) return `--${token.slice(1)}`;
  if (token.startsWith('--')) return token;
  return `--${token}`;
}

// ============================================================================
// CSS Formatting
// ============================================================================

/**
 * Format a single parameter (`--name <type>: default`).
 */
function formatParameter(token: string, param: FunctionParameter): string {
  const name = parseParamName(token);

  if (param === true) {
    return name;
  }

  if (typeof param === 'string') {
    return param ? `${name} ${param}` : name;
  }

  let out = name;
  if (param.syntax) {
    out += ` ${param.syntax}`;
  }
  if (param.default !== undefined) {
    out += `: ${parseStyle(param.default).output}`;
  }
  return out;
}

/**
 * Format the function prelude: `@function --name(params) returns <type>`.
 */
export function formatFunctionPrelude(
  name: string,
  args: FunctionDefinition['args'],
  returns?: string,
): string {
  const cssName = parseFunctionName(name);

  let params = '';
  if (Array.isArray(args)) {
    params = args.map((token) => formatParameter(token, true)).join(', ');
  } else if (args) {
    params = Object.entries(args)
      .map(([token, param]) => formatParameter(token, param))
      .join(', ');
  }

  const returnsPart = returns ? ` returns ${returns}` : '';

  return `@function ${cssName}(${params})${returnsPart}`;
}

/**
 * Format the inner declarations of a @function rule (local variables + result).
 */
export function formatFunctionDeclarations(def: FunctionDefinition): string {
  const parts: string[] = [];

  for (const key of Object.keys(def)) {
    if (RESERVED_KEYS.has(key) || !key.startsWith('$')) continue;
    const value = def[key as `$${string}`];
    if (value === undefined) continue;
    parts.push(`${parseParamName(key)}: ${parseStyle(value).output};`);
  }

  parts.push(`result: ${parseStyle(def.result).output};`);

  return parts.join(' ');
}

/**
 * Format a complete @function rule as CSS.
 */
export function formatFunctionRule(
  name: string,
  def: FunctionDefinition,
): string {
  const prelude = formatFunctionPrelude(name, def.args, def.returns);
  return `${prelude} { ${formatFunctionDeclarations(def)} }`;
}

// ============================================================================
// Unified `functions` config: value-type split
// ============================================================================

/** A key is a CSS-function key when it carries the `$`/`--` prefix. */
function isCssFunctionKey(key: string): boolean {
  return key.startsWith('$') || key.startsWith('--');
}

/** Discriminate a unified `functions` entry by its value type. */
function isParseFunction(
  value: FunctionDefinition | ParseFunction,
): value is ParseFunction {
  return typeof value === 'function';
}

export type FunctionMismatch =
  | 'expected-definition' // function value under a `$$` key
  | 'expected-parse-function'; // object value under a bare key

/**
 * Split the unified `functions` map into the two internal registries:
 * - `parseFuncs`: JS parse functions (bare keys).
 * - `functionDefs`: declarative CSS `@function` definitions (`$$` keys).
 *
 * Entries whose key prefix does not match the value type are reported via
 * `onMismatch` and skipped.
 */
export function splitFunctions(
  map: FunctionsConfig,
  onMismatch?: (key: string, kind: FunctionMismatch) => void,
): {
  parseFuncs: Record<string, ParseFunction>;
  functionDefs: Record<string, FunctionDefinition>;
} {
  const parseFuncs: Record<string, ParseFunction> = {};
  const functionDefs: Record<string, FunctionDefinition> = {};

  for (const [key, value] of Object.entries(map)) {
    const cssKey = isCssFunctionKey(key);
    if (isParseFunction(value)) {
      if (cssKey) {
        onMismatch?.(key, 'expected-definition');
        continue;
      }
      parseFuncs[key] = value;
    } else {
      if (!cssKey) {
        onMismatch?.(key, 'expected-parse-function');
        continue;
      }
      functionDefs[key] = value;
    }
  }

  return { parseFuncs, functionDefs };
}

// ============================================================================
// Polyfill: compile a declarative @function into a parse-function closure
// ============================================================================

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const paramBareName = (token: string): string => parseParamName(token).slice(2);

/**
 * Rewrite `var(--name)` references for declared parameter/local names to a
 * collision-resistant, function-scoped prefix. This guarantees that later
 * value substitution only ever targets the function's own variables and can
 * never accidentally match a real element-level `var(--name)` introduced by an
 * argument value (e.g. the `--gap` used by Tasty units). Blanket prefix — no
 * exact-collision detection.
 */
function prefixDeclaredVars(
  template: string,
  declared: string[],
  prefixOf: (bare: string) => string,
): string {
  let out = template;
  for (const bare of declared) {
    const re = new RegExp(`var\\(\\s*--${escapeRegExp(bare)}(?![\\w-])`, 'g');
    out = out.replace(re, `var(--${prefixOf(bare)}`);
  }
  return out;
}

/**
 * Replace the prefixed `var(--<prefixed>)` / `var(--<prefixed>, fallback)`
 * references with their mapped values, iterating so that local variables that
 * reference parameters (or other locals) resolve fully.
 */
function substituteVars(
  template: string,
  valueMap: Map<string, string>,
): string {
  let out = template;
  for (let iter = 0; iter < 30; iter++) {
    let changed = false;
    for (const [name, value] of valueMap) {
      const re = new RegExp(
        `var\\(\\s*--${escapeRegExp(name)}\\s*(?:,[^)]*)?\\)`,
        'g',
      );
      const next = out.replace(re, () => {
        changed = true;
        return value;
      });
      out = next;
    }
    if (!changed) break;
  }
  return out;
}

/** Function names currently being expanded, to guard against recursion cycles. */
const inProgress = new Set<string>();

/**
 * Compile a declarative `@function` definition into a parse-function closure
 * that fully inlines the call into plain CSS (the `@function` polyfill).
 *
 * Parameters and local variables are substituted directly with their values,
 * so no function-internal custom properties are emitted (collisions are
 * structurally impossible). Self/mutually-recursive functions are not expanded:
 * the cycle guard bails and the call is left untouched.
 */
export function compileFunctionClosure(
  name: string,
  def: FunctionDefinition,
): ParseFunction {
  const cssName = parseFunctionName(name);
  // Function-scoped, collision-resistant prefix for this function's variables.
  const prefixOf = (bare: string): string => `tf-${cssName.slice(2)}-${bare}`;

  const params: { prefixed: string; default?: string }[] = [];
  if (Array.isArray(def.args)) {
    for (const token of def.args) {
      params.push({ prefixed: prefixOf(paramBareName(token)) });
    }
  } else if (def.args) {
    for (const [token, param] of Object.entries(def.args)) {
      let dflt: string | undefined;
      if (param && typeof param === 'object' && param.default !== undefined) {
        dflt = parseStyle(param.default).output;
      }
      params.push({ prefixed: prefixOf(paramBareName(token)), default: dflt });
    }
  }

  const localKeys = Object.keys(def).filter(
    (key) => !RESERVED_KEYS.has(key) && key.startsWith('$'),
  );

  const declared = [
    ...(Array.isArray(def.args)
      ? def.args.map(paramBareName)
      : def.args
        ? Object.keys(def.args).map(paramBareName)
        : []),
    ...localKeys.map(paramBareName),
  ];

  // Built lazily on first call so that nested function calls referenced by the
  // result are resolved against the fully-populated registry.
  let built = false;
  let resultTemplate = '';
  const localTemplates: { prefixed: string; value: string }[] = [];

  const build = () => {
    built = true;
    resultTemplate = prefixDeclaredVars(
      parseStyle(def.result).output,
      declared,
      prefixOf,
    );
    for (const key of localKeys) {
      const value = def[key as `$${string}`];
      if (value === undefined) continue;
      localTemplates.push({
        prefixed: prefixOf(paramBareName(key)),
        value: prefixDeclaredVars(parseStyle(value).output, declared, prefixOf),
      });
    }
  };

  return (groups: StyleDetails[]): string => {
    if (inProgress.has(cssName)) return '';
    inProgress.add(cssName);
    try {
      if (!built) build();

      const valueMap = new Map<string, string>();
      params.forEach((param, index) => {
        const arg = groups[index]?.output?.trim();
        valueMap.set(param.prefixed, arg || param.default || '');
      });
      for (const local of localTemplates) {
        valueMap.set(local.prefixed, local.value);
      }

      return substituteVars(resultTemplate, valueMap);
    } finally {
      inProgress.delete(cssName);
    }
  };
}

/** CSS function name -> serialized definition, to dedupe polyfill registration. */
const registeredFunctionDefs = new Map<string, string>();

/**
 * Register a declarative `@function` as a parse-function closure so the parser
 * inlines its call sites. Deduplicated by name + definition; a later, different
 * definition of the same name overrides the previous one (local wins).
 */
export function registerFunctionPolyfill(
  name: string,
  definition: FunctionDefinition,
): void {
  const cssName = parseFunctionName(name);
  const serialized = JSON.stringify(definition);
  if (registeredFunctionDefs.get(cssName) === serialized) return;
  registeredFunctionDefs.set(cssName, serialized);
  customFunc(cssName, compileFunctionClosure(name, definition));
}

/** Register all local `@function` definitions from a styles object (polyfill). */
export function registerLocalFunctionPolyfills(styles: Styles): void {
  const local = extractLocalFunctions(styles);
  if (!local) return;
  for (const [name, definition] of Object.entries(local)) {
    registerFunctionPolyfill(name, definition);
  }
}

/** Clear polyfill registration bookkeeping (used by resetConfig in tests). */
export function resetFunctionPolyfills(): void {
  registeredFunctionDefs.clear();
}
