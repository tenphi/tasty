/**
 * Counter Style Utilities
 *
 * Utilities for extracting and processing CSS @counter-style definitions in styles.
 * Counter-style rules are permanent once injected and do not need cleanup.
 */

import type { CounterStyleDescriptors } from '../injector/types';
import type { Styles } from '../styles/types';

// ============================================================================
// Constants
// ============================================================================

const COUNTER_STYLE_KEY = '@counterStyle';

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Check if styles object has local @counterStyle definition.
 */
export function hasLocalCounterStyle(styles: Styles): boolean {
  return COUNTER_STYLE_KEY in styles;
}

/**
 * Extract local @counterStyle from styles object.
 * Returns null if no local counter styles (fast path).
 */
export function extractLocalCounterStyle(
  styles: Styles,
): Record<string, CounterStyleDescriptors> | null {
  const counterStyle = styles[COUNTER_STYLE_KEY];
  if (!counterStyle || typeof counterStyle !== 'object') {
    return null;
  }
  return counterStyle as Record<string, CounterStyleDescriptors>;
}

// ============================================================================
// CSS Formatting
// ============================================================================

const COUNTER_STYLE_DESCRIPTOR_MAP: Record<string, string> = {
  system: 'system',
  symbols: 'symbols',
  additiveSymbols: 'additive-symbols',
  prefix: 'prefix',
  suffix: 'suffix',
  negative: 'negative',
  range: 'range',
  pad: 'pad',
  fallback: 'fallback',
  speakAs: 'speak-as',
};

/**
 * Format the inner declarations of a @counter-style rule (no wrapper).
 * Used by the injector which needs selector and declarations separately.
 */
export function formatCounterStyleDeclarations(
  descriptors: CounterStyleDescriptors,
): string {
  const parts: string[] = [];

  for (const [key, cssName] of Object.entries(COUNTER_STYLE_DESCRIPTOR_MAP)) {
    const value = descriptors[key as keyof CounterStyleDescriptors];
    if (value !== undefined) {
      parts.push(`${cssName}: ${value};`);
    }
  }

  return parts.join(' ');
}

/**
 * Format a @counter-style rule as CSS.
 */
export function formatCounterStyleRule(
  name: string,
  descriptors: CounterStyleDescriptors,
): string {
  return `@counter-style ${name} { ${formatCounterStyleDeclarations(descriptors)} }`;
}
