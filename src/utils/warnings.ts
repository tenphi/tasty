import { isDevEnv } from './is-dev-env';

const PREFIX = '[Tasty]';

/** Warning keys already emitted, so each distinct diagnostic warns once. */
const emittedWarnings = new Set<string>();

export function warn(...args: unknown[]) {
  console.warn(PREFIX, ...args);
}

/** Emit a warning at most once per key. No-op outside development mode. */
export function warnOnceDev(key: string, message: string): void {
  if (emittedWarnings.has(key)) return;
  emittedWarnings.add(key);

  if (!isDevEnv()) return;

  console.warn(`${PREFIX} ${message}`);
}

/** Forget emitted style warnings. Called by `resetConfig()` for test isolation. */
export function resetStyleWarnings(): void {
  emittedWarnings.clear();
}
