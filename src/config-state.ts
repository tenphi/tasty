/**
 * Minimal configuration lock state shared by the style engine and the runtime
 * configuration module. Keeping it independent prevents the style pipeline
 * from importing the full injector/configuration graph.
 */

let stylesGenerated = false;

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
