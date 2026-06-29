import { getGlobalInjector } from '../config';
import { formatFunctionRule, parseFunctionName } from '../functions';
import type { FunctionDefinition } from '../injector/types';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';

export type { FunctionDefinition };

export interface UseFunctionOptions {
  /** Shadow root or document to inject into. */
  root?: Document | ShadowRoot;
}

/**
 * Register a CSS @function (custom function).
 *
 * @function rules are global and persistent once defined. The hook ensures the
 * function is only registered once per root (deduplicated by function name).
 *
 * Accepts tasty token syntax for the function name:
 * - `$$name` → defines `--name` (matches the call site `$$name(...)`)
 * - `$name` / `--name` → also accepted
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
 *
 * @param name - The function name token (`$$name`, `$name`, or `--name`)
 * @param definition - Function definition (args, returns, result, local vars)
 *
 * @example
 * ```tsx
 * function Box() {
 *   useFunction('$$negative', { args: ['$value'], result: '(-1 * $value)' });
 *   return <div style={{ marginTop: '--negative(10px)' }} />;
 * }
 * ```
 */
export function useFunction(
  name: string,
  definition: FunctionDefinition,
  options?: UseFunctionOptions,
): void {
  if (!name) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Tasty] useFunction: function name is required`);
    }
    return;
  }

  const target = getStyleTarget();

  if (target.mode === 'ssr') {
    target.collector.collectInternals();

    const css = formatFunctionRule(name, definition);
    if (css) {
      target.collector.collectFunction(parseFunctionName(name), css);
    }
    return;
  }

  if (target.mode === 'rsc') {
    const css = formatFunctionRule(name, definition);
    if (css) {
      pushRSCCSS(target.cache, `__func:${parseFunctionName(name)}`, css);
    }
    return;
  }

  getGlobalInjector().func(name, definition, { root: options?.root });
}
