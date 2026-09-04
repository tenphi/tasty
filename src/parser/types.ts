export enum Bucket {
  Color,
  Value,
  Mod,
  /**
   * A custom-property reference whose name ends with `-color`, e.g.
   * `$brand-color`. The suffix is the only hint the parser has, so the reference
   * is filed as a color *and* as a value: a color slot finds it, and so does a
   * handler reading `values` — otherwise `padding: '$brand-color'` would find no
   * value and silently emit its default instead.
   */
  ColorValue,
}

/**
 * A part within a group, representing a slash-separated segment.
 * For example, in `'2px solid #red / 4px'`, there are two parts:
 * - Part 0: `2px solid #red`
 * - Part 1: `4px`
 */
export interface StyleDetailsPart {
  mods: string[];
  values: string[];
  colors: string[];
  all: string[];
  output: string;
}

/**
 * A group of style details, representing a comma-separated segment.
 * Contains aggregated values from all parts for backward compatibility,
 * plus the structured `parts` array for handlers that need slash separation.
 */
export interface StyleDetails {
  input: string;
  output: string;
  /** Aggregated mods from all parts (backward compatible) */
  mods: string[];
  /** Aggregated values from all parts (backward compatible) */
  values: string[];
  /** Aggregated colors from all parts (backward compatible) */
  colors: string[];
  /** Aggregated all tokens from all parts (backward compatible) */
  all: string[];
  /** Slash-separated parts within this group */
  parts: StyleDetailsPart[];
}

export interface ProcessedStyle {
  output: string;
  groups: StyleDetails[];
}

export type UnitHandler = (scalar: number) => string;

export interface ParserOptions {
  functions?: Record<string, (parsed: StyleDetails[]) => string>;
  units?: Record<string, string | UnitHandler>;
  cacheSize?: number;
}

export const makeEmptyPart = (): StyleDetailsPart => ({
  mods: [],
  values: [],
  colors: [],
  all: [],
  output: '',
});

export const makeEmptyDetails = (): StyleDetails => ({
  input: '',
  output: '',
  mods: [],
  values: [],
  colors: [],
  all: [],
  parts: [],
});
