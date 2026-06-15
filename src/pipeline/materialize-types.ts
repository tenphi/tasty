/**
 * Materialization Types
 *
 * Pure type definitions used by the materialization layer to describe parsed
 * conditions, selector groups, variants, and final CSS-rule shape. These
 * types have no module-level state and can be imported anywhere without
 * pulling in the materialization implementation.
 */

/**
 * Parsed media condition for structured analysis and combination
 */
export interface ParsedMediaCondition {
  /** Subtype for structured analysis */
  subtype: 'dimension' | 'feature' | 'type';
  /** Whether this is a negated condition */
  negated: boolean;
  /** The condition part for CSS output (e.g., "(width < 600px)", "print") */
  condition: string;
  /** For dimension queries: dimension name */
  dimension?: 'width' | 'height' | 'inline-size' | 'block-size';
  /** For dimension queries: lower bound value */
  lowerBound?: {
    value: string;
    valueNumeric: number | null;
    inclusive: boolean;
  };
  /** For dimension queries: upper bound value */
  upperBound?: {
    value: string;
    valueNumeric: number | null;
    inclusive: boolean;
  };
  /** For feature queries: feature name */
  feature?: string;
  /** For feature queries: feature value */
  featureValue?: string;
  /** For type queries: media type */
  mediaType?: 'print' | 'screen' | 'all' | 'speech';
}

/**
 * Parsed container condition for structured analysis and combination
 */
export interface ParsedContainerCondition {
  /** Container name (undefined = unnamed/nearest container) */
  name?: string;
  /** The condition part (e.g., "(width < 600px)" or "style(--variant: danger)") */
  condition: string;
  /** Whether this is a negated condition */
  negated: boolean;
  /** Subtype for structured analysis */
  subtype: 'dimension' | 'style' | 'raw';
  /** For style queries: property name (without --) */
  property?: string;
  /** For style queries: property value (undefined = existence check) */
  propertyValue?: string;
}

/**
 * Parsed supports condition for structured analysis and combination
 */
export interface ParsedSupportsCondition {
  /** Subtype: 'feature' for property support, 'selector' for selector() support */
  subtype: 'feature' | 'selector';
  /** The condition string (e.g., "display: grid" or ":has(*)") */
  condition: string;
  /** Whether this is a negated condition */
  negated: boolean;
}

/**
 * Parsed modifier condition for structured analysis
 */
export interface ParsedModifierCondition {
  /** Attribute name (e.g., 'data-hovered', 'data-size') */
  attribute: string;
  /** Value if present (e.g., 'large', 'danger') */
  value?: string;
  /** Operator for value matching (default '=') */
  operator?: '=' | '^=' | '$=' | '*=';
  /** Whether this is negated (:not(...)) */
  negated: boolean;
}

/**
 * Parsed pseudo-class condition for structured analysis
 */
export interface ParsedPseudoCondition {
  /** The pseudo-class (e.g., ':hover', ':focus-visible', ':has(> Icon)') */
  pseudo: string;
  /** Whether this is negated (:not(...)) */
  negated: boolean;
}

/** Modifier or pseudo condition (shared across own/root/parent) */
export type ParsedSelectorCondition =
  | ParsedModifierCondition
  | ParsedPseudoCondition;

/**
 * A group of selector conditions that produces an :is() or :not() wrapper.
 *
 * Each branch is an AND conjunction of conditions (one selector fragment).
 * Multiple branches are OR'd together inside the :is()/:not() wrapper.
 *
 * Example: size=small | size=medium
 *   branches: [[size=small], [size=medium]]
 *   renders:  :is([data-size="small"], [data-size="medium"])
 *
 * When negated, :is() becomes :not():
 *   :not([data-size="small"], [data-size="medium"])
 *
 * Single-branch groups are unwrapped (no :is() wrapper):
 *   branches: [[size=small]]
 *   renders:  [data-size="small"]
 */
export interface SelectorGroup {
  branches: ParsedSelectorCondition[][];
  negated: boolean;
}

/**
 * A group of parent conditions originating from a single @parent() call.
 * Each group produces its own :is()/:not() wrapper in the final CSS.
 * Separate @parent() calls = separate groups = can match different ancestors.
 *
 * Extends SelectorGroup with a `direct` flag for ancestor combinator:
 *   direct = false → ` *` (any ancestor)
 *   direct = true  → ` > *` (direct parent only)
 *
 * Example: @parent(hovered & pressed | active)
 *   branches: [[hovered, pressed], [active]]
 *   renders:  :is([data-hovered][data-pressed] *, [data-active] *)
 */
export interface ParentGroup extends SelectorGroup {
  direct: boolean;
}

/**
 * A single selector variant (one term in a DNF expression)
 */
export interface SelectorVariant {
  /** Structured modifier conditions (flat AND) */
  modifierConditions: ParsedModifierCondition[];

  /** Structured pseudo conditions (flat AND) */
  pseudoConditions: ParsedPseudoCondition[];

  /** Selector groups — :is()/:not() wrappers for OR branches on the element */
  selectorGroups: SelectorGroup[];

  /** Own groups — :is()/:not() wrappers for @own() OR branches on sub-elements */
  ownGroups: SelectorGroup[];

  /** Parsed media conditions for structured combination */
  mediaConditions: ParsedMediaCondition[];

  /** Parsed container conditions for structured combination */
  containerConditions: ParsedContainerCondition[];

  /** Parsed supports conditions for @supports at-rules */
  supportsConditions: ParsedSupportsCondition[];

  /** Root groups — :is()/:not() wrappers for @root() OR branches */
  rootGroups: SelectorGroup[];

  /** Parent condition groups — each @parent() call is a separate group */
  parentGroups: ParentGroup[];

  /** Whether to wrap in @starting-style */
  startingStyle: boolean;
}

/**
 * CSS output components extracted from a condition
 * Supports multiple variants for OR conditions (DNF form)
 */
export interface CSSComponents {
  /** Selector variants - OR means multiple variants, AND means single variant with combined selectors */
  variants: SelectorVariant[];

  /** Whether condition is impossible (should skip) */
  isImpossible: boolean;
}

/**
 * Final CSS rule output
 */
export interface CSSRule {
  /** Single selector or array of selector fragments (for OR conditions) */
  selector: string | string[];
  declarations: string;
  atRules?: string[];
  rootPrefix?: string;
  /** When true, declarations are wrapped in @starting-style { ... } inside the selector rule */
  startingStyle?: boolean;
  /**
   * Cascade order hint propagated from the source style entry priority.
   * Higher = later in the stylesheet (wins the cascade). Used by the
   * pipeline post-pass to emit `@fallback` rules before the higher-priority
   * rules that layer over them. Internal; stripped before injection.
   */
  order?: number;
}
