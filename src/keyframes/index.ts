/**
 * Keyframes Utilities
 *
 * Optimized utilities for extracting and processing keyframes in styles.
 * Designed for zero overhead when no keyframes are used.
 */

import type { KeyframesSteps } from '../injector/types';
import type { Styles } from '../styles/types';
import { hashString } from '../utils/hash';

// ============================================================================
// Constants
// ============================================================================

const KEYFRAMES_KEY = '@keyframes';

/**
 * Pattern to extract animation names from CSS animation property values.
 * Animation name is typically the first identifier in the shorthand.
 * Handles: "fadeIn 300ms ease-in", "pulse 1s infinite", etc.
 *
 * CSS animation shorthand order (all optional except name):
 * animation: name | duration | timing | delay | iteration | direction | fill-mode | play-state
 *
 * Animation names must:
 * - Start with a letter, underscore, or hyphen (but not a digit or CSS keyword)
 * - Not be CSS keywords: none, initial, inherit, unset, revert
 */
const NON_NAME_KEYWORDS = new Set(
  'none initial inherit unset revert auto normal running paused reverse alternate alternate-reverse forwards backwards both ease linear ease-in ease-out ease-in-out step-start step-end'.split(
    ' ',
  ),
);

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Check if styles object has local @keyframes definition.
 * Fast path: single property lookup.
 */
export function hasLocalKeyframes(styles: Styles): boolean {
  return KEYFRAMES_KEY in styles;
}

/**
 * Extract local @keyframes from styles object.
 * Returns null if no local keyframes (fast path).
 */
export function extractLocalKeyframes(
  styles: Styles,
): Record<string, KeyframesSteps> | null {
  const keyframes = styles[KEYFRAMES_KEY];
  if (!keyframes || typeof keyframes !== 'object') {
    return null;
  }
  return keyframes as Record<string, KeyframesSteps>;
}

/**
 * Merge local and global keyframes.
 * Local keyframes take priority over global.
 * Returns null if no keyframes exist (fast path).
 */
export function mergeKeyframes(
  local: Record<string, KeyframesSteps> | null,
  global: Record<string, KeyframesSteps> | null,
): Record<string, KeyframesSteps> | null {
  if (!local && !global) return null;
  if (!local) return global;
  if (!global) return local;
  // Local overrides global
  return { ...global, ...local };
}

// ============================================================================
// Animation Name Extraction
// ============================================================================

/**
 * Extract animation name from a single animation value.
 * Returns null if no valid name found.
 *
 * Examples:
 * - "fadeIn 300ms ease-in" → "fadeIn"
 * - "1s pulse infinite" → "pulse" (name can be anywhere)
 * - "none" → null (CSS keyword)
 * - "300ms ease-in" → null (no name, just duration/timing)
 */
function extractAnimationNameFromValue(value: string): string | null {
  for (const part of value.trim().split(/\s+/)) {
    const lower = part.toLowerCase();
    if (NON_NAME_KEYWORDS.has(lower)) continue;

    // Skip time values, iteration counts, and timing functions with arguments.
    if (
      part === 'infinite' ||
      /^(?:-?[\d.]+m?s|\d+|(?:cubic-bezier|steps)\()/i.test(part)
    )
      continue;

    // Check if it looks like a valid animation name
    const match = /^([a-zA-Z_-][a-zA-Z0-9_-]*)/.exec(part);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract all animation names from an animation property value.
 * Handles multiple animations separated by commas.
 *
 * Example: "fadeIn 300ms, slideIn 500ms ease-out" → ["fadeIn", "slideIn"]
 */
function collectAnimationNamesFromValue(value: string, names: Set<string>) {
  for (const animation of value.split(',')) {
    const name = extractAnimationNameFromValue(animation);
    if (name) names.add(name);
  }
}

/**
 * Extract animation names from a style value (handles mappings and arrays).
 */
function extractAnimationNamesFromStyleValue(
  value: unknown,
  names: Set<string>,
): void {
  if (typeof value === 'string') {
    collectAnimationNamesFromValue(value, names);
  } else if (Array.isArray(value)) {
    // Responsive array
    for (const v of value) {
      extractAnimationNamesFromStyleValue(v, names);
    }
  } else if (value && typeof value === 'object') {
    // State mapping
    for (const v of Object.values(value)) {
      extractAnimationNamesFromStyleValue(v, names);
    }
  }
}

function collectAnimationNamesFromStyles(
  styles: Styles,
  names: Set<string>,
): void {
  if ('animation' in styles) {
    extractAnimationNamesFromStyleValue(styles.animation, names);
  }

  if ('animationName' in styles) {
    extractAnimationNamesFromStyleValue(styles.animationName, names);
  }

  for (const [key, value] of Object.entries(styles)) {
    if (key === '$' || key === KEYFRAMES_KEY) continue;

    if (
      (key.startsWith('&') || key.startsWith('.') || /^[A-Z]/.test(key)) &&
      value &&
      typeof value === 'object'
    ) {
      collectAnimationNamesFromStyles(value as Styles, names);
    }
  }
}

/**
 * Extract all animation names referenced in styles.
 * Scans 'animation' and 'animationName' properties including in state mappings.
 * Returns empty set if no animation properties found (fast path).
 */
export function extractAnimationNamesFromStyles(styles: Styles): Set<string> {
  const names = new Set<string>();
  collectAnimationNamesFromStyles(styles, names);
  return names;
}

/**
 * The name a local `@keyframes` block is emitted under.
 *
 * Content-addressed, and a pure function of what was authored: the same steps
 * always produce the same name, and different steps under the same authored
 * name cannot collide. That is what lets the server and the client agree —
 * a name handed out by whichever injector happened to see the definition first
 * depends on run order, so the two would disagree on both the animation name
 * and the class that references it.
 */
export function resolveKeyframesName(
  authored: string,
  steps: KeyframesSteps,
): string {
  return `${authored}-${hashString(JSON.stringify(steps))}`;
}

/**
 * The emitted name for every local `@keyframes` in `styles`, by authored name.
 * Pure — the server, the RSC pass and the client all reach the same answer.
 */
export function resolveKeyframesNames(
  used: Record<string, KeyframesSteps>,
): Map<string, string> {
  const names = new Map<string, string>();

  for (const [authored, steps] of Object.entries(used)) {
    names.set(authored, resolveKeyframesName(authored, steps));
  }

  return names;
}

/** Replace local animation names and collect the definitions each rule uses. */
export function replaceAnimationNames(
  declarations: string,
  nameMap: Map<string, string>,
  usedNames: Set<string>,
): string {
  // Fast path: no animation properties
  if (nameMap.size === 0 || !declarations.includes('animation'))
    return declarations;

  const parts = declarations.split(';');
  let modified = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;

    const prop = part.slice(0, colonIdx).trim().toLowerCase();

    if (prop === 'animation' || prop === 'animation-name') {
      const prefix = part.slice(0, colonIdx + 1);
      let value = part.slice(colonIdx + 1);

      for (const original of nameMap.keys()) {
        if (findWord(value, original) !== -1) usedNames.add(original);
      }

      for (const [original, injected] of nameMap) {
        if (original === injected) continue;
        const next = replaceWord(value, original, injected);
        if (next !== value) {
          value = next;
          modified = true;
        }
      }

      parts[i] = prefix + value;
    }
  }

  return modified ? parts.join(';') : declarations;
}

/**
 * Replace a word in a string (word boundary aware, no regex).
 */
function replaceWord(str: string, word: string, replacement: string): string {
  let result = str;
  let idx = 0;

  while ((idx = findWord(result, word, idx)) !== -1) {
    result =
      result.slice(0, idx) + replacement + result.slice(idx + word.length);
    idx += replacement.length;
  }

  return result;
}

function findWord(str: string, word: string, from = 0): number {
  let idx = from;

  while ((idx = str.indexOf(word, idx)) !== -1) {
    const before = idx === 0 ? ' ' : str[idx - 1];
    const end = idx + word.length;
    const after = end === str.length ? ' ' : str[end];

    if (!/[\w-]/.test(before + after)) {
      return idx;
    }
    idx = end;
  }

  return -1;
}

// ============================================================================
// Filter Functions
// ============================================================================

/**
 * Filter keyframes to only those that are actually used.
 * Returns null if no keyframes are used (fast path).
 */
export function filterUsedKeyframes(
  keyframes: Record<string, KeyframesSteps> | null,
  usedNames: Set<string>,
): Record<string, KeyframesSteps> | null {
  if (!keyframes || usedNames.size === 0) return null;

  const used: Record<string, KeyframesSteps> = {};
  let hasAny = false;

  for (const name of usedNames) {
    if (keyframes[name]) {
      used[name] = keyframes[name];
      hasAny = true;
    }
  }

  return hasAny ? used : null;
}
