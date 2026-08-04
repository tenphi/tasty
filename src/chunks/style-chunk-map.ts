/**
 * Chunk names, the built-in chunk style lists, and the style→chunk lookup.
 *
 * This is a **leaf module with no imports**. It exists separately from
 * `definitions.ts` for two reasons:
 *
 * 1. The style handler registry (`styles/predefined.ts`) needs to assign chunk
 *    membership for custom handlers. Reaching for `definitions.ts` would create an
 *    import cycle (`definitions` -> `pipeline` -> `styles` -> `predefined`).
 * 2. `STYLE_TO_CHUNK` is populated as a side effect of module load, so it must be
 *    populated by the module that *owns* it. Otherwise an importer that only pulls
 *    in this module would see an empty map and misclassify every style as `misc`.
 *
 * `definitions.ts` re-exports everything here, so existing import paths and the
 * public API surface are unchanged.
 */

export const CHUNK_NAMES = {
  /** Special chunk for styles that cannot be split */
  COMBINED: 'combined',
  SUBCOMPONENTS: 'subcomponents',
  APPEARANCE: 'appearance',
  FONT: 'font',
  DIMENSION: 'dimension',
  DISPLAY: 'display',
  LAYOUT: 'layout',
  POSITION: 'position',
  MISC: 'misc',
} as const;

export type ChunkName = (typeof CHUNK_NAMES)[keyof typeof CHUNK_NAMES];

// ============================================================================
// Built-in Chunk Style Lists
// ============================================================================

/**
 * Appearance chunk - visual styling with independent handlers
 *
 * @public
 */
export const APPEARANCE_CHUNK_STYLES = [
  'fill', // fillStyle (independent)
  'color', // colorStyle (independent)
  'opacity', // independent
  'border', // borderStyle (independent)
  'radius', // radiusStyle (independent)
  'outline', // outlineStyle: outline ↔ outlineOffset
  'outlineOffset', // outlineStyle: outline ↔ outlineOffset
  'shadow', // shadowStyle (independent)
  'fade', // fadeStyle (independent)
] as const;

/**
 * Font chunk - typography styles
 *
 * Handler dependencies (all styles in each handler MUST stay in this chunk):
 * ⚠️ presetStyle: preset, fontSize, lineHeight, letterSpacing, textTransform,
 *    fontWeight, fontStyle, font
 */
/** @public */
export const FONT_CHUNK_STYLES = [
  // All from presetStyle handler - MUST stay together
  'preset',
  'font',
  'fontWeight',
  'fontStyle',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  // Independent text styles grouped for cohesion
  'fontFamily', // independent alias (logical grouping with font styles)
  'textAlign',
  'textDecoration',
  'wordBreak',
  'wordWrap',
  'boldFontWeight',
] as const;

/**
 * Dimension chunk - sizing and spacing
 *
 * Handler dependencies (all styles in each handler MUST stay in this chunk):
 * ⚠️ paddingStyle: padding, paddingTop/Right/Bottom/Left, paddingBlock/Inline
 * ⚠️ marginStyle: margin, marginTop/Right/Bottom/Left, marginBlock/Inline
 * ⚠️ widthStyle: width, minWidth, maxWidth
 * ⚠️ heightStyle: height, minHeight, maxHeight
 */
/** @public */
export const DIMENSION_CHUNK_STYLES = [
  // All from paddingStyle handler - MUST stay together
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingInline',
  // All from marginStyle handler - MUST stay together
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginInline',
  // widthStyle handler - MUST stay together
  'width',
  'minWidth',
  'maxWidth',
  // heightStyle handler - MUST stay together
  'height',
  'minHeight',
  'maxHeight',
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'flex',
] as const;

/**
 * Display chunk - display mode, layout flow, text overflow, and scrollbar
 *
 * Handler dependencies (all styles in each handler MUST stay in this chunk):
 * ⚠️ displayStyle: display, hide, textOverflow, overflow, whiteSpace
 * ⚠️ flowStyle: display, flow
 * ⚠️ gapStyle: display, flow, gap
 * ⚠️ scrollbarStyle: scrollbar, overflow
 */
/** @public */
export const DISPLAY_CHUNK_STYLES = [
  // displayStyle handler
  'display',
  'hide',
  'textOverflow',
  'overflow', // also used by scrollbarStyle
  'whiteSpace',
  // flowStyle handler (requires display)
  'flow',
  // gapStyle handler (requires display, flow)
  'gap',
  // scrollbarStyle handler (requires overflow)
  'scrollbar',
] as const;

/**
 * Layout chunk - flex/grid alignment and grid templates
 *
 * Note: flow and gap are in DISPLAY chunk due to handler dependencies
 * (flowStyle and gapStyle both require 'display' prop).
 */
/** @public */
export const LAYOUT_CHUNK_STYLES = [
  // Alignment styles (all independent handlers)
  'placeItems',
  'placeContent',
  'alignItems',
  'alignContent',
  'justifyItems',
  'justifyContent',
  'align', // placementStyle
  'justify', // placementStyle
  'place', // placementStyle
  'columnGap',
  'rowGap',
  // Grid template styles
  'gridColumns',
  'gridRows',
  'gridTemplate',
  'gridAreas',
  'gridAutoFlow',
  'gridAutoColumns',
  'gridAutoRows',
] as const;

/**
 * Position chunk - element positioning
 *
 * Handler dependencies (all styles in each handler MUST stay in this chunk):
 * ⚠️ insetStyle: inset, insetBlock, insetInline, top, right, bottom, left
 */
/** @public */
export const POSITION_CHUNK_STYLES = [
  'position',
  // All from insetStyle handler - MUST stay together
  'inset',
  'insetBlock',
  'insetInline',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  'gridArea',
  'gridColumn',
  'gridRow',
  'order',
  'placeSelf',
  'alignSelf',
  'justifySelf',
  'transform',
  'transition',
  'animation',
] as const;

// ============================================================================
// Style-to-Chunk Lookup Map (O(1) categorization)
// ============================================================================

/**
 * Map for O(1) style-to-chunk lookup. Seeded with the built-in lists above and
 * extended by {@link assignStyleChunk} when a custom handler declares style names
 * the built-in lists don't know.
 */
export const STYLE_TO_CHUNK = new Map<string, ChunkName>();

/** Built-in assignments, captured so `resetStyleChunks()` can restore them. */
let builtinSnapshot: Map<string, ChunkName> | null = null;

function populateStyleToChunkMap(): void {
  for (const style of APPEARANCE_CHUNK_STYLES) {
    STYLE_TO_CHUNK.set(style, CHUNK_NAMES.APPEARANCE);
  }
  for (const style of FONT_CHUNK_STYLES) {
    STYLE_TO_CHUNK.set(style, CHUNK_NAMES.FONT);
  }
  for (const style of DIMENSION_CHUNK_STYLES) {
    STYLE_TO_CHUNK.set(style, CHUNK_NAMES.DIMENSION);
  }
  for (const style of DISPLAY_CHUNK_STYLES) {
    STYLE_TO_CHUNK.set(style, CHUNK_NAMES.DISPLAY);
  }
  for (const style of LAYOUT_CHUNK_STYLES) {
    STYLE_TO_CHUNK.set(style, CHUNK_NAMES.LAYOUT);
  }
  for (const style of POSITION_CHUNK_STYLES) {
    STYLE_TO_CHUNK.set(style, CHUNK_NAMES.POSITION);
  }
}

// Populate at module load and record the result as the baseline that
// resetStyleChunks() restores.
populateStyleToChunkMap();
builtinSnapshot = new Map(STYLE_TO_CHUNK);

/**
 * Assign a style name to a chunk.
 *
 * Used to keep a custom handler's dependencies in one chunk: chunks are rendered
 * and cached independently, and a chunk's cache key covers only its own style
 * values, so a handler whose `__lookupStyles` straddle two chunks is invoked once
 * per chunk with a subset of its inputs and can emit stale CSS.
 */
export function assignStyleChunk(styleName: string, chunk: ChunkName): void {
  STYLE_TO_CHUNK.set(styleName, chunk);
}

/**
 * Drop custom chunk assignments and restore the built-in baseline.
 *
 * Called by `resetConfig()`. Without this, a custom handler's chunk assignments
 * would leak across tests the same way custom handlers themselves did before
 * `resetHandlers()` existed.
 *
 * @internal
 */
export function resetStyleChunks(): void {
  if (!builtinSnapshot) return;

  STYLE_TO_CHUNK.clear();

  for (const [style, chunk] of builtinSnapshot) {
    STYLE_TO_CHUNK.set(style, chunk);
  }
}
