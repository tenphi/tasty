import type { StyleResult } from '../pipeline';
import type { PropertyTypeResolver } from '../properties/property-type-resolver';

import type { QueuedWrite } from './batch';

declare global {
  interface Window {
    __TASTY__?: string[];
  }
}

export interface InjectResult {
  className: string;
  dispose: () => void;
}

export interface GlobalInjectResult {
  dispose: () => void;
}

export type DisposeFunction = () => void;

export interface StyleInjectorConfig {
  nonce?: string;
  maxRulesPerSheet?: number; // default: infinite (no cap)
  forceTextInjection?: boolean; // default: auto-detected (true in test environments, false otherwise)
  /** Enable development mode features: performance metrics and debug information storage */
  devMode?: boolean; // default: auto-detected (true in development, false in production)
  /**
   * Global predefined states for advanced state mapping.
   * These are state aliases that can be used in any component.
   * Example: { '@mobile': '@media(w < 920px)', '@dark': '@root(theme=dark)' }
   */
  states?: Record<string, string>;
  /**
   * Automatically infer and register CSS @property declarations
   * from custom property values. When false, only explicit @property are used.
   * @default true
   */
  autoPropertyTypes?: boolean;
  /** Garbage collection configuration for unused styles */
  gc?: GCConfig;
  /**
   * Prefix prepended to every generated identifier.
   * Mirrors the `namePrefix` field on the public `TastyConfig` so that
   * standalone injector consumers can configure it directly.
   * @default 't'
   */
  namePrefix?: string;
  /**
   * Defer stylesheet writes and apply them in one batch instead of one
   * `insertRule()` per component. Mirrors `batchInjection` on the public
   * `TastyConfig`.
   * @default false
   */
  batchInjection?: boolean | 'always';
}

/**
 * Per-className usage tracking for GC.
 */
/**
 * @deprecated Nothing reads this any more. Collection asks the DOM what is
 * rendered rather than tracking usage per class, so there is no usage record
 * to describe. Kept so existing imports keep type-checking.
 */
export interface StyleUsage {
  lastTouchedAt: number;
}

/**
 * Configuration for the style garbage collector.
 *
 * GC is triggered by touch count rather than timers: every `touchInterval`
 * touches, an idle callback is scheduled to evict unused styles above
 * `capacity`, oldest first.
 */
export interface GCConfig {
  /**
   * How long a class is left alone after collection first notices nothing is
   * carrying it, in milliseconds (default 10,000).
   *
   * Rendering is not commit-aware: a render can resolve a class and commit it a
   * little later, and in between nothing on the page carries it. Rather than
   * try to tell that apart from a class that is finished — which cannot be done
   * from outside React — collection simply does not touch anything that was in
   * use recently. A render would have to stay pending for the whole window to
   * lose its rules, and it gets them back on its next render.
   */
  grace?: number;

  /**
   * Number of touch events between automatic GC cycles.
   * @default 1000
   */
  touchInterval?: number;
  /**
   * Maximum number of unused styles to retain.
   * GC evicts the oldest unused styles when this limit is exceeded.
   * Pinned styles and DOM-live styles
   * do not count against this limit.
   * @default 1000
   */
  capacity?: number;
}

/**
 * Per-call options for inject().
 */
export interface InjectOptions {
  root?: Document | ShadowRoot;
  /** Reuse the class already injected for this key instead of writing again. */
  cacheKey?: string;
  /**
   * Pin the injected class (default `true`). A pinned class is never evicted by
   * `gc()`, and the returned `dispose()` releases the pin. Pass `false` when the
   * caller keeps no handle and the DOM is the only record that the class is in
   * use — the render path does this, because a hook-free render has no unmount
   * signal to dispose on.
   */
  pin?: boolean;
  /**
   * Class derived by StyleInjector.prepareClassName() after it already checked
   * the cache and hydration state. Internal render-path optimization.
   * @internal
   */
  preparedClassName?: string;
}

/**
 * Per-call options for gc().
 */
export interface GCOptions {
  root?: Document | ShadowRoot;
  /** Bypass capacity threshold and remove ALL unused styles. */
  force?: boolean;
}

/** Sentinel for hydrated (server-rendered) rules not yet backed by a real sheet entry. */
export const HYDRATED_RULE_INDEX = -2;
/** Sentinel for pre-allocated class names whose CSS hasn't been injected yet. */
export const PLACEHOLDER_RULE_INDEX = -1;
/**
 * Sentinel for class names whose rules are queued for a batched sheet write.
 * Distinct from `PLACEHOLDER_RULE_INDEX`: a placeholder still needs its rules
 * built and inserted, whereas a pending entry already owns a queued write and
 * must not be injected twice.
 */
export const PENDING_RULE_INDEX = -3;

export interface RuleInfo {
  className: string;
  ruleIndex: number;
  sheetIndex: number;
  /** Dev-only: full CSS texts inserted for this class; omitted in production */
  cssText?: string[];
  /** Inclusive end index of the contiguous block of inserted rules for this className */
  endRuleIndex?: number;
  /** NEW: exact indices of all inserted rules for this className */
  indices?: number[];
}

export type InjectionMode = 'style-element' | 'adopted';

export interface SheetInfo {
  /** HTMLStyleElement used in style-element mode; null in adopted mode. */
  sheet: HTMLStyleElement | null;
  /** Constructable CSSStyleSheet used in adopted mode (ShadowRoot targets) */
  constructableSheet?: CSSStyleSheet;
  ruleCount: number;
  holes: number[]; // Available rule indices from deletions
  /**
   * True when this sheet is written through `textContent` instead of CSSOM.
   * Decided once at sheet creation so a sheet is never half CSSOM / half text.
   */
  textMode?: boolean;
  /**
   * Inserted rule texts in rule-index order. Maintained only in text mode —
   * it is what makes deletion possible there, since `textContent` cannot be
   * edited rule-by-rule and has to be rebuilt.
   */
  textRules?: string[];
}

interface CleanupStats {
  timestamp: number;
  classesDeleted: number;
  cssSize: number;
  rulesDeleted: number;
}

export interface CacheMetrics {
  hits: number;
  /** Hits served by a registered immutable precompiled stylesheet. */
  precompiledHits: number;
  /** Distinct precompiled classes served since metrics were last reset. */
  precompiledUniqueHits: number;
  misses: number;
  bulkCleanups: number; // number of bulk cleanup operations
  totalInsertions: number;
  totalUnused: number; // total styles marked as unused
  stylesCleanedUp: number; // total number of styles cleaned up in bulk operations
  cleanupHistory: CleanupStats[]; // detailed history of each cleanup operation
  startTime: number;

  // Calculated getters
  unusedHits?: number; // calculated as classes eligible for eviction (see gc())
}

export interface RootRegistry {
  sheets: SheetInfo[];
  /** className -> outstanding `inject()` references; 0 means nobody holds a handle */
  pinCounts: Map<string, number>;
  rules: Map<string, RuleInfo>; // className -> rule info (includes both active and unused)
  /** Cache key to className mapping to avoid dual storage of RuleInfo objects */
  cacheKeyToClassName: Map<string, string>; // cacheKey -> className
  /** Deduplication set of fully materialized CSS rules inserted into sheets */
  ruleTextSet: Set<string>;
  /** Performance metrics (optional) */
  metrics?: CacheMetrics;
  /** Dev-only distinct precompiled classes served since metrics were reset. */
  precompiledUsedClasses?: Set<string>;
  /** Keyframes cache by content hash -> entry */
  keyframesCache: Map<string, KeyframesCacheEntry>;
  /** Keyframes name to content hash mapping for collision detection */
  keyframesNameToContent: Map<string, string>; // providedName -> contentHash
  /** Counter for generating keyframes names like k0, k1, k2... */
  keyframesCounter: number;
  /** Map of injected @property names to their normalized declarations for tracking */
  injectedProperties: Map<string, string>; // propertyName -> normalized declaration
  /** Content hashes of injected @font-face rules for deduplication */
  injectedFontFaces: Set<string>;
  /**
   * Injected @counter-style rules. Maps the name to whether it was injected
   * "strong" (`true`, the default — overrides) or "weak" (`false`, global
   * `configure()` definitions that never clobber an existing rule).
   */
  injectedCounterStyles: Map<string, boolean>;
  /**
   * Injected @function rules. Maps the CSS function name to whether it was
   * injected "strong" (`true`, the default — overrides) or "weak" (`false`,
   * global `configure()` definitions that never clobber an existing rule).
   */
  injectedFunctions: Map<string, boolean>;
  /** Global rules tracking for index adjustment */
  globalRules: Map<string, RuleInfo>; // globalKey -> rule info
  /** Resolver for auto-inferring @property types from declaration values */
  propertyTypeResolver: PropertyTypeResolver;
  /**
   * className -> when the class was first noticed to be carrying nothing:
   * injection, or the first sweep that looked and did not find it on an
   * element. Cleared the moment a sweep finds it rendered again.
   *
   * Deliberately "when it was noticed", not "when it stopped being rendered".
   * Nothing observes the moment an element leaves, so a class that unmounted
   * just before a sweep and one that unmounted just after the previous sweep
   * would otherwise be treated differently — and the first would lose its
   * grace window entirely. Starting the clock at the sighting gives every
   * class the same full window, whenever it actually went.
   *
   * Written only by the sweep's own DOM scan and at injection, so rendering
   * never pays for it.
   */
  unusedSince: Map<string, number>;
  /**
   * Local `@keyframes` a class animates, by the name they were authored under.
   *
   * One reference is held per distinct set of steps, however many renders ask
   * for it, and the classes that animate it own that reference between them.
   * The last of them to be deleted releases it, so keyframes cannot outlive
   * every rule that referred to them, and repeat renders cannot pile up
   * references nobody gives back.
   */
  localKeyframes: Map<
    string,
    { name: string; dispose: () => void; owners: Set<string> }
  >;
  /** Renders since the last scheduled sweep (per-root) */
  touchCount: number;
  /** How many entries from `window.__TASTY__` have been synced into this registry */
  serverClassSyncIndex: number;
  /** Whether `<style data-tasty-rsc>` tags have been scanned for class names */
  rscStylesScanned: boolean;
  /** Whether this root uses adoptedStyleSheets or <style> elements */
  injectionMode: InjectionMode;
  /**
   * Lazy feature-test for `@property` support, cached per registry.
   * - `undefined`: not yet probed.
   * - `true`: engine supports `@property`; rejections indicate user-authored
   *   invalid rules and should warn.
   * - `false`: engine doesn't support `@property` (e.g., jsdom); rejections
   *   are expected and warnings are suppressed.
   */
  atPropertySupported?: boolean;
}

// StyleRule is now just an alias for StyleResult from the pipeline
export type StyleRule = StyleResult;

export interface KeyframesInfo {
  name: string;
  sheetIndex: number;
  ruleIndex: number;
  /** Dev-only: full CSS text of the @keyframes rule; omitted in production */
  cssText?: string;
}

type KeyframeStep = string | Record<string, string | number>;
export type KeyframesSteps = Record<string, KeyframeStep>;

export interface KeyframesResult {
  toString(): string;
  dispose: () => void;
}

export interface KeyframesCacheEntry {
  name: string;
  refCount: number;
  info: KeyframesInfo;
  /**
   * Queued sheet write, when `batchInjection` deferred the insertion. Present
   * only between `keyframes()` and the flush; disposing in that window cancels
   * the write instead of deleting a rule that was never inserted.
   */
  pending?: QueuedWrite;
}

/**
 * Definition for a CSS @property at-rule.
 * Used to define custom property syntax, inheritance, and initial value.
 */
export interface PropertyDefinition {
  /** CSS syntax string (e.g., '<color>', '<angle>', '<number>') */
  syntax?: string;
  /** Whether the property inherits (default: true) */
  inherits?: boolean;
  /** Initial value for the property */
  initialValue?: string | number;
}

/**
 * Options for registering a CSS `@property`.
 * Extends {@link PropertyDefinition} with an optional injection root.
 */
export interface PropertyOptions extends PropertyDefinition {
  /** Shadow root or document to inject into */
  root?: Document | ShadowRoot;
}

/**
 * A single parameter for a CSS @function at-rule.
 *
 * - `true` — a bare parameter with no type or default.
 * - `string` — a CSS type shorthand (e.g. `'<length>'`, `'<color>'`).
 * - object — full form with optional `syntax` (type) and `default` value.
 */
export type FunctionParameter =
  true | string | { syntax?: string; default?: string | number };

/**
 * Definition for a CSS @function at-rule (custom function).
 *
 * The descriptor body reads like a mini styles object: any `$name` key declares
 * a local variable (`--name`) whose value is parsed through the Tasty DSL.
 * `result` is the only required field.
 *
 * @example
 * ```ts
 * // @function --negative(--value) { result: calc(-1 * var(--value)); }
 * { args: ['$value'], result: '(-1 * $value)' }
 * ```
 */
export interface FunctionDefinition {
  /**
   * Ordered parameters. Array form lists bare parameter names (`['$value']`);
   * object form maps each parameter name to its type/default.
   */
  args?: string[] | Record<string, FunctionParameter>;
  /** Optional return type, e.g. `'<color>'`. */
  returns?: string;
  /** The `result:` descriptor value (parsed through the Tasty DSL). Required. */
  result: string;
  /** Local variables: any `$name` key declares `--name` in the body. */
  [localVar: `$${string}`]: string | number | undefined;
}

/**
 * Descriptors for a CSS @font-face at-rule.
 */
export interface FontFaceDescriptors {
  /** Required. URL(s) to the font file(s). */
  src: string;
  /** Font weight or range. Default: 'normal'. */
  fontWeight?: string | number;
  /** Font style. Default: 'normal'. */
  fontStyle?: 'normal' | 'italic' | 'oblique' | (string & {});
  /** Font stretch. Default: 'normal'. */
  fontStretch?: string;
  /** Loading behavior. Default: 'auto'. */
  fontDisplay?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  /** Unicode range to cover. */
  unicodeRange?: string;
  /** Ascent metric override. */
  ascentOverride?: string;
  /** Descent metric override. */
  descentOverride?: string;
  /** Line gap metric override. */
  lineGapOverride?: string;
  /** Size adjustment factor. */
  sizeAdjust?: string;
  /** OpenType feature settings. */
  fontFeatureSettings?: string;
  /** Font variation axis settings. */
  fontVariationSettings?: string;
}

/** Single descriptor or array of descriptors for multiple weights/styles. */
export type FontFaceInput = FontFaceDescriptors | FontFaceDescriptors[];

/**
 * Descriptors for a CSS @counter-style at-rule.
 */
export interface CounterStyleDescriptors {
  /** Required. Numbering algorithm. */
  system:
    | 'cyclic'
    | 'numeric'
    | 'alphabetic'
    | 'symbolic'
    | 'additive'
    | 'fixed'
    | (string & {});
  /** Symbols for non-additive systems. */
  symbols?: string;
  /** Symbol-value pairs for additive system. */
  additiveSymbols?: string;
  /** String prepended to the marker. Default: "". */
  prefix?: string;
  /** String appended to the marker. Default: ". ". */
  suffix?: string;
  /** Negative-value wrapping (e.g., '"(" ")"'). */
  negative?: string;
  /** Counter range (e.g., 'infinite infinite'). */
  range?: string;
  /** Minimum marker width and pad symbol (e.g., '3 "0"'). */
  pad?: string;
  /** Fallback counter style name. */
  fallback?: string;
  /** Speech synthesis hint. */
  speakAs?: string;
}

export interface RawCSSInfo {
  /** Unique identifier for this raw CSS block */
  id: string;
  /** The raw CSS text */
  css: string;
  /** Start offset in the style element's textContent */
  startOffset: number;
  /** End offset in the style element's textContent */
  endOffset: number;
}

export interface RawCSSResult {
  dispose: () => void;
}
