/** Package version injected by builds; the fallback supports direct source consumers. */
export const TASTY_VERSION =
  typeof __TASTY_VERSION__ === 'string' ? __TASTY_VERSION__ : '3.6.0';
