import {
  assignStyleChunk,
  CHUNK_NAMES,
  STYLE_TO_CHUNK,
} from '../chunks/style-chunk-map';
import type { ChunkName } from '../chunks/style-chunk-map';
import { isDevEnv } from '../utils/is-dev-env';
import type {
  AnyStyleHandler,
  RawStyleHandler,
  StyleHandler,
  StyleHandlerDefinition,
} from '../utils/styles';

import { borderStyle } from './border';
import { blockSizeStyle } from './blockSize';
import { colorStyle } from './color';
import { createStyle } from './createStyle';
import { displayStyle } from './display';
import { fadeStyle } from './fade';
import { fillStyle, svgFillStyle } from './fill';
import { flowStyle } from './flow';
import { gapStyle } from './gap';
import { heightStyle } from './height';
import { insetStyle } from './inset';
import { inlineSizeStyle } from './inlineSize';
import { logicalStyleHandlers } from './logical';
import { marginStyle } from './margin';
import { outlineStyle } from './outline';
import { paddingStyle } from './padding';
import { placementStyle } from './placement';
import { presetStyle } from './preset';
import { radiusStyle } from './radius';
import { scrollMarginStyle } from './scrollMargin';
import { scrollPaddingStyle } from './scrollPadding';
import { scrollbarStyle } from './scrollbar';
import { shadowStyle } from './shadow';
import { transitionStyle } from './transition';
import { widthStyle } from './width';

const devMode = isDevEnv();

/**
 * Dev-mode check evaluated per call rather than at module load.
 *
 * `isDevEnv()` reports `false` for `NODE_ENV=test`, so a module-load capture makes
 * a warning impossible to assert in a test. Only used on paths that already know
 * something is wrong, so the extra call is never on the hot path.
 */
function inDevMode(): boolean {
  return isDevEnv();
}

const _numberConverter = (val: string | number | boolean | undefined) => {
  if (typeof val === 'number') {
    return `${val}px`;
  }

  return val;
};
/**
 * Read a grid track count, or `undefined` when the value isn't one.
 *
 * Plain digit strings count: every value inside a state map arrives as a
 * string, so `gridColumns: { '': '2', '@media(w < 600px)': '1' }` would
 * otherwise emit `grid-template-columns: 2` — invalid CSS that browsers drop
 * silently.
 *
 * Zero and negatives yield `undefined`. Zero already produced an empty value,
 * and a negative number used to throw inside `String.repeat`.
 */
function trackCount(
  val: string | number | boolean | undefined,
): number | undefined {
  const count =
    typeof val === 'number'
      ? val
      : typeof val === 'string' && /^\d+$/.test(val.trim())
        ? Number(val.trim())
        : NaN;

  return Number.isFinite(count) && count >= 1 ? Math.floor(count) : undefined;
}

const columnsConverter = (val: string | number | boolean | undefined) => {
  const count = trackCount(val);

  return count === undefined
    ? undefined
    : 'minmax(1px, 1fr) '.repeat(count).trim();
};
const rowsConverter = (val: string | number | boolean | undefined) => {
  const count = trackCount(val);

  return count === undefined ? undefined : 'auto '.repeat(count).trim();
};

type StyleHandlerMap = Record<string, AnyStyleHandler[]>;

const STYLE_HANDLER_MAP: StyleHandlerMap = {};

function addStyleHandler(name: string, handler: AnyStyleHandler): void {
  (STYLE_HANDLER_MAP[name] ??= []).push(handler);
}

// Store initial handler state for reset functionality
let initialHandlerMapSnapshot: StyleHandlerMap | null = null;

/**
 * Capture a snapshot of the current STYLE_HANDLER_MAP.
 * Called after predefine() to preserve built-in handler state.
 */
function captureInitialHandlerState(): void {
  initialHandlerMapSnapshot = {};
  for (const key of Object.keys(STYLE_HANDLER_MAP)) {
    // Shallow copy the array - handlers themselves are immutable
    initialHandlerMapSnapshot[key] = [...STYLE_HANDLER_MAP[key]];
  }
}

/**
 * Reset STYLE_HANDLER_MAP to the initial built-in state.
 * Called by resetConfig() to restore handlers after tests.
 */
export function resetHandlers(): void {
  if (!initialHandlerMapSnapshot) {
    // predefine() hasn't been called yet, nothing to reset
    return;
  }

  // Clear current map
  for (const key of Object.keys(STYLE_HANDLER_MAP)) {
    delete STYLE_HANDLER_MAP[key];
  }

  // Restore initial state
  for (const key of Object.keys(initialHandlerMapSnapshot)) {
    STYLE_HANDLER_MAP[key] = [...initialHandlerMapSnapshot[key]];
  }
}

function defineCustomStyle(handler: AnyStyleHandler): void {
  for (const name of handler.__lookupStyles) {
    addStyleHandler(name, handler);
  }
}

type ConverterHandler = (
  s: string | boolean | number | undefined,
) => string | undefined;

function defineStyleAlias(
  styleName: string,
  cssStyleName?: string,
  converter?: ConverterHandler,
) {
  addStyleHandler(styleName, createStyle(styleName, cssStyleName, converter));
}

export function predefine() {
  // Style aliases
  defineStyleAlias('gridAreas', 'grid-template-areas');
  defineStyleAlias('gridColumns', 'grid-template-columns', columnsConverter);
  defineStyleAlias('gridRows', 'grid-template-rows', rowsConverter);
  defineStyleAlias(
    'gridTemplate',
    'grid-template',
    (val: string | boolean | number | undefined) => {
      if (typeof val !== 'string') return;

      // Each side converts independently, and a side that isn't a track count
      // (`auto`, `1fr`, an areas string) is kept verbatim.
      return val
        .split('/')
        .map((s, i) => (i ? columnsConverter : rowsConverter)(s) ?? s)
        .join('/');
    },
  );
  // Note: outlineOffset is now handled by outlineStyle

  [
    displayStyle,
    transitionStyle,
    fillStyle,
    svgFillStyle,
    widthStyle,
    marginStyle,
    gapStyle,
    flowStyle,
    colorStyle,
    heightStyle,
    radiusStyle,
    borderStyle,
    shadowStyle,
    paddingStyle,
    placementStyle,
    presetStyle,
    scrollMarginStyle,
    outlineStyle,
    scrollbarStyle,
    fadeStyle,
    insetStyle,
    blockSizeStyle,
    inlineSizeStyle,
    scrollPaddingStyle,
    ...Object.values(logicalStyleHandlers),
  ].forEach((handler) => defineCustomStyle(handler));

  // Capture initial state after all built-in handlers are registered
  captureInitialHandlerState();

  return STYLE_HANDLER_MAP;
}

// ============================================================================
// Handler Registration API (for configure())
// ============================================================================

/**
 * Normalize a handler definition to a StyleHandler with __lookupStyles.
 * - Function only: lookup styles inferred from key name
 * - [string, fn]: single lookup style
 * - [string[], fn]: multiple lookup styles
 */
export function normalizeHandlerDefinition(
  keyName: string,
  definition: StyleHandlerDefinition,
): StyleHandler {
  let handler: RawStyleHandler;
  let lookupStyles: string[];

  if (typeof definition === 'function') {
    // Function only - lookup styles inferred from key name
    handler = definition;
    lookupStyles = [keyName];
  } else if (Array.isArray(definition)) {
    const [first, fn] = definition;

    if (typeof fn !== 'function') {
      throw new Error(
        `[Tasty] Invalid handler definition for "${keyName}". ` +
          'Tuple must have a function as the second element: [string, function] or [string[], function].',
      );
    }

    handler = fn;

    if (typeof first === 'string') {
      // [string, fn] - single lookup style
      lookupStyles = [first];
    } else if (Array.isArray(first)) {
      // [string[], fn] - multiple lookup styles
      lookupStyles = first;
    } else {
      throw new Error(
        `[Tasty] Invalid handler definition for "${keyName}". ` +
          'First element must be a string or string array.',
      );
    }
  } else {
    throw new Error(
      `[Tasty] Invalid handler definition for "${keyName}". ` +
        'Expected function, [string, function], or [string[], function].',
    );
  }

  // Validate handler in dev mode
  validateHandler(keyName, handler, lookupStyles);

  // Wrap the handler to avoid mutation issues when the same function
  // is reused for multiple handler definitions. Each registration
  // gets its own function identity with its own __lookupStyles.
  const wrappedHandler = ((props) => handler(props)) as StyleHandler;
  wrappedHandler.__lookupStyles = lookupStyles;

  return wrappedHandler;
}

/**
 * Validate a handler definition in development mode.
 */
function validateHandler(
  name: string,
  handler: RawStyleHandler,
  lookupStyles: string[],
): void {
  if (!devMode) return;

  if (typeof handler !== 'function') {
    console.warn(
      `[Tasty] Handler "${name}" is not a function. ` +
        'Handlers must be functions that return CSSMap, CSSMap[], or null.',
    );
  }

  if (
    !lookupStyles ||
    !Array.isArray(lookupStyles) ||
    lookupStyles.length === 0
  ) {
    console.warn(
      `[Tasty] Handler "${name}" has invalid lookupStyles. ` +
        'Expected non-empty array of style names.',
    );
  }
}

export interface RegisterHandlerOptions {
  /** The `handlers` key this handler was registered under, for diagnostics. */
  key?: string;
  /** Where it came from — a plugin name, or `'configure()'`. */
  source?: string;
}

/** Describe a handler in a warning message. */
function describeHandler(
  lookupStyles: string[],
  options?: RegisterHandlerOptions,
): string {
  const name = options?.key ?? lookupStyles.join(', ');

  return options?.source ? `"${name}" (from ${options.source})` : `"${name}"`;
}

/**
 * Keep a handler's dependencies inside one chunk.
 *
 * Chunks are rendered and cached independently and a chunk's cache key covers
 * only its own style values, so a handler whose `__lookupStyles` straddle two
 * chunks gets invoked once per chunk with a *subset* of its inputs — and can emit
 * stale CSS. Custom style names are unknown to the built-in chunk lists and would
 * otherwise fall into `misc`, splitting any handler that mixes them with built-in
 * styles. Pull them into the built-in chunk instead.
 *
 * Runs in production too: this is a correctness fix, not a diagnostic. It only
 * ever moves names the built-in lists don't know, so no existing class name can
 * change.
 */
function alignHandlerChunks(
  lookupStyles: string[],
  options?: RegisterHandlerOptions,
): void {
  const known = new Set<ChunkName>();
  const unknown: string[] = [];

  for (const styleName of lookupStyles) {
    const chunk = STYLE_TO_CHUNK.get(styleName);

    if (chunk) {
      known.add(chunk);
    } else {
      unknown.push(styleName);
    }
  }

  if (known.size > 1) {
    // The handler bridges two built-in chunks. Resolving this correctly would
    // mean re-deriving chunk membership across the whole handler graph, which can
    // move built-in styles between chunks and change class names — so warn only.
    if (inDevMode()) {
      console.warn(
        `[Tasty] Handler ${describeHandler(lookupStyles, options)} depends on ` +
          `styles from different chunks (${[...known].sort().join(', ')}). ` +
          `Chunks are cached independently, so this handler will be invoked once ` +
          `per chunk with only part of its dependencies and can emit stale CSS. ` +
          `Split it into per-chunk handlers, or have one property expand into the ` +
          `others before chunking.`,
      );
    }

    return;
  }

  if (unknown.length === 0) return;

  // Exactly one known chunk → custom names join it. No known chunk → pin them
  // together in `misc`, where they would land anyway, so they stay together even
  // if one of them later becomes known.
  const target = known.size === 1 ? [...known][0] : CHUNK_NAMES.MISC;

  for (const styleName of unknown) {
    assignStyleChunk(styleName, target);
  }
}

/**
 * Warn when replacing a handler takes unrelated style properties down with it.
 *
 * Built-in handlers are shared across several style names (`displayStyle` also
 * emits `hide`, `overflow`, `whiteSpace`, `textOverflow`), so registering a
 * handler for one of them unregisters the built-in from *all* of its names. The
 * displaced names don't go dark — the pipeline falls back to an auto-generated
 * CSS alias and writes it back into the map — so `hide: true` starts emitting a
 * literal `hide: true` declaration. Silent wrongness, which is worth a warning.
 *
 * Must run before the handlers are actually removed.
 */
function warnAboutOrphanedStyles(
  lookupStyles: string[],
  handlersToRemove: Set<StyleHandler>,
  options?: RegisterHandlerOptions,
): void {
  const incoming = new Set(lookupStyles);
  const orphaned = new Set<string>();

  for (const oldHandler of handlersToRemove) {
    for (const oldStyleName of oldHandler.__lookupStyles ?? []) {
      if (incoming.has(oldStyleName)) continue;

      const survivors = (STYLE_HANDLER_MAP[oldStyleName] ?? []).filter(
        (h) => !handlersToRemove.has(h),
      );

      if (survivors.length === 0) orphaned.add(oldStyleName);
    }
  }

  if (orphaned.size === 0) return;

  console.warn(
    `[Tasty] Custom handler ${describeHandler(lookupStyles, options)} displaced ` +
      `built-in handlers that also handle: ${[...orphaned].sort().join(', ')}. ` +
      `Those properties now fall back to auto-generated CSS aliases, which is ` +
      `usually wrong (e.g. \`hide: true\` would emit a literal \`hide: true\` ` +
      `declaration). Either declare them in this handler's lookup styles and ` +
      `delegate via \`styleHandlers.*\`, or pick a narrower style name.`,
  );
}

/**
 * Register a custom handler, replacing any existing handlers for the same lookup styles.
 * This is called by configure() to process user-defined handlers.
 *
 * When registering a handler for style X, any existing handler that processes X
 * is removed from ALL its lookup styles to prevent double-processing.
 * For example, if gapStyle handles ['display', 'flow', 'gap'] and a new handler
 * is registered for just ['gap'], gapStyle is removed from display and flow too.
 *
 * Note: this bypasses the `configure()` lock, so calling it after styles have
 * been generated changes the handlers for already-emitted class names. Prefer
 * `configure({ handlers })`, which is rejected after first render.
 */
export function registerHandler(
  handler: StyleHandler,
  options?: RegisterHandlerOptions,
): void {
  const lookupStyles = handler.__lookupStyles;

  if (!lookupStyles || lookupStyles.length === 0) {
    if (devMode) {
      console.warn(
        '[Tasty] Cannot register handler without __lookupStyles property.',
      );
    }
    return;
  }

  alignHandlerChunks(lookupStyles, options);

  // Find and remove existing handlers that would conflict
  // A handler conflicts if it handles any of the same styles as the new handler
  const handlersToRemove = new Set<StyleHandler>();

  for (const styleName of lookupStyles) {
    const existing = STYLE_HANDLER_MAP[styleName];
    if (existing) {
      for (const existingHandler of existing) {
        handlersToRemove.add(existingHandler);
      }
    }
  }

  if (handlersToRemove.size > 0 && inDevMode()) {
    warnAboutOrphanedStyles(lookupStyles, handlersToRemove, options);
  }

  // Remove conflicting handlers from ALL their lookup styles
  for (const oldHandler of handlersToRemove) {
    const oldLookupStyles = oldHandler.__lookupStyles;
    if (oldLookupStyles) {
      for (const oldStyleName of oldLookupStyles) {
        const handlers = STYLE_HANDLER_MAP[oldStyleName];
        if (handlers) {
          const filtered = handlers.filter((h) => h !== oldHandler);
          if (filtered.length === 0) {
            delete STYLE_HANDLER_MAP[oldStyleName];
          } else {
            STYLE_HANDLER_MAP[oldStyleName] = filtered;
          }
        }
      }
    }
  }

  // Register the new handler under its lookup styles
  for (const styleName of lookupStyles) {
    addStyleHandler(styleName, handler);
  }
}

// ============================================================================
// Wrapped Style Handlers Export
// ============================================================================

/**
 * Create a wrapped handler that can be safely called by users.
 * The wrapper preserves __lookupStyles for proper registration.
 */
function wrapHandler<T extends { __lookupStyles: string[] }>(handler: T): T {
  const fn = handler as unknown as (props: unknown) => unknown;
  const wrapped = ((props: unknown) => fn(props)) as unknown as T;
  wrapped.__lookupStyles = handler.__lookupStyles;
  return wrapped;
}

function wrapHandlerRecord<
  T extends Record<string, { __lookupStyles: string[] }>,
>(handlers: T): T {
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      wrapHandler(handler),
    ]),
  ) as T;
}

const wrappedLogicalStyleHandlers = wrapHandlerRecord(logicalStyleHandlers);

/**
 * Exported object containing wrapped predefined style handlers.
 * Users can import and call these to extend or delegate to built-in behavior.
 *
 * Internal handlers use *Style suffix for searchability.
 * External API uses short names for convenience.
 *
 * @example
 * ```ts
 * import { styleHandlers, configure } from '@tenphi/tasty';
 *
 * configure({
 *   handlers: {
 *     fill: ({ fill }) => {
 *       if (fill?.startsWith('gradient:')) {
 *         return { background: fill.slice(9) };
 *       }
 *       return styleHandlers.fill({ fill });
 *     },
 *   },
 * });
 * ```
 */
export const styleHandlers = {
  blockSize: wrapHandler(blockSizeStyle),
  border: wrapHandler(borderStyle),
  color: wrapHandler(colorStyle),
  display: wrapHandler(displayStyle),
  fade: wrapHandler(fadeStyle),
  fill: wrapHandler(fillStyle),
  svgFill: wrapHandler(svgFillStyle),
  flow: wrapHandler(flowStyle),
  gap: wrapHandler(gapStyle),
  height: wrapHandler(heightStyle),
  inset: wrapHandler(insetStyle),
  inlineSize: wrapHandler(inlineSizeStyle),
  ...wrappedLogicalStyleHandlers,
  margin: wrapHandler(marginStyle),
  outline: wrapHandler(outlineStyle),
  padding: wrapHandler(paddingStyle),
  placement: wrapHandler(placementStyle),
  preset: wrapHandler(presetStyle),
  radius: wrapHandler(radiusStyle),
  scrollMargin: wrapHandler(scrollMarginStyle),
  scrollPadding: wrapHandler(scrollPaddingStyle),
  scrollbar: wrapHandler(scrollbarStyle),
  shadow: wrapHandler(shadowStyle),
  transition: wrapHandler(transitionStyle),
  width: wrapHandler(widthStyle),
} as const;
