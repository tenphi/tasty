const PREFIX = 'Tasty';

export function warn(...args: unknown[]) {
  console.warn(`${PREFIX}:`, ...args);
}
