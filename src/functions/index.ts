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
import type { Styles } from '../styles/types';
import { parseStyle } from '../utils/styles';

// ============================================================================
// Constants
// ============================================================================

const FUNCTION_KEY = '@function';

/** Descriptor keys that are not local-variable declarations. */
const RESERVED_KEYS = new Set(['args', 'returns', 'result']);

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
