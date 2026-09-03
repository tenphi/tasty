/**
 * Minimal configuration state shared by the style engine, zero-runtime
 * extractor, and runtime configuration module. Keeping it independent
 * prevents pure rendering code from importing the full injector graph.
 */

let stylesGenerated = false;
let globalPolyfills: { functions?: boolean } | null = null;

const GTKEY_POLYFILLS = '__tasty_cfg_polyfills__';

export function hasStylesGenerated(): boolean {
  return stylesGenerated;
}

/** Mark the lock and report whether this call changed it. */
export function markStylesGeneratedState(): boolean {
  if (stylesGenerated) return false;
  stylesGenerated = true;
  return true;
}

export function resetStylesGeneratedState(): void {
  stylesGenerated = false;
}

/** Whether the CSS `@function` inline-expansion polyfill is enabled. */
export function isFunctionsPolyfillEnabled(): boolean {
  const shared = (globalThis as Record<string, unknown>)[GTKEY_POLYFILLS] as
    { functions?: boolean } | undefined;
  return (globalPolyfills ?? shared)?.functions === true;
}

export function setGlobalPolyfillsState(polyfills: {
  functions?: boolean;
}): void {
  globalPolyfills = { ...(globalPolyfills ?? {}), ...polyfills };
  (globalThis as Record<string, unknown>)[GTKEY_POLYFILLS] = globalPolyfills;
}

export function resetGlobalPolyfillsState(): void {
  globalPolyfills = null;
  delete (globalThis as Record<string, unknown>)[GTKEY_POLYFILLS];
}
