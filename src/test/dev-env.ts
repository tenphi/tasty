/**
 * Dev-mode toggles for tests.
 *
 * `isDevEnv()` (`src/utils/is-dev-env.ts`) has two inputs: the `TASTY_DEBUG`
 * localStorage flag, and `process.env.NODE_ENV`. A real browser has no
 * `process` global, so `vi.stubEnv('NODE_ENV', 'development')` cannot reach it
 * there — the localStorage flag is the only switch that works in the
 * environment users actually ship to, which is why tests use it.
 */

const FLAG = 'TASTY_DEBUG';

/** Turn on Tasty's dev-only `console.warn` diagnostics. */
export function enableDevWarnings(): void {
  localStorage.setItem(FLAG, 'true');
}

/** Restore the default (warnings off). Safe to call when never enabled. */
export function disableDevWarnings(): void {
  localStorage.removeItem(FLAG);
}
