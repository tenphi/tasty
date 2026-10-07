/**
 * Check if we're in a development environment at runtime
 * The package build preserves NODE_ENV for the consuming app's bundler.
 * Also checks for TASTY_DEBUG localStorage setting
 */
export function isDevEnv(): boolean {
  // Check localStorage for DEBUG_TASTY setting (browser environment)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const forceTastyDebug = window.localStorage.getItem('TASTY_DEBUG');
      if (
        forceTastyDebug !== null &&
        forceTastyDebug.toLowerCase() === 'true'
      ) {
        return true;
      }
    } catch {
      // localStorage might not be available (private browsing, etc.)
      // Continue with other checks
    }
  }

  // Check NODE_ENV for Node.js environments
  if (typeof process === 'undefined') return false;

  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv !== 'test' && nodeEnv !== 'production';
}
