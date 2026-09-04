/**
 * State Key Parser
 *
 * Parses state notation strings (like 'hovered & !disabled', '@media(w < 768px)')
 * into ConditionNode trees for processing in the pipeline.
 */

import { Lru } from '../parser/lru';
import type { StateParserContext } from '../states';
import {
  expandDimensionShorthands,
  expandTastyUnits,
  findTopLevelComma,
  resolvePredefinedState,
} from '../states';
import { camelToKebab } from '../utils/case-converter';
import { isDevEnv } from '../utils/is-dev-env';
import { transformSelectorContent } from '../utils/selector-transform';

import type { ConditionNode, NumericBound } from './conditions';
import { emitWarning } from './warnings';
import {
  and,
  createContainerDimensionCondition,
  createContainerRawCondition,
  createContainerStyleCondition,
  createMediaDimensionCondition,
  createMediaFeatureCondition,
  createMediaTypeCondition,
  createModifierCondition,
  createOwnCondition,
  createParentCondition,
  createPseudoCondition,
  createRootCondition,
  createStartingCondition,
  createSupportsCondition,
  not,
  or,
  trueCondition,
} from './conditions';

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum XOR operands before emitting a performance warning.
 * A ^ B ^ C ^ D = 8 OR branches (2^(n-1)), so chains above 4
 * risk exponential blowup in downstream processing.
 */
const MAX_XOR_CHAIN_LENGTH = 4;

// ============================================================================
// Types
// ============================================================================

export interface ParseStateKeyOptions {
  context?: StateParserContext;
  isSubElement?: boolean;
}

// ============================================================================
// Caching
// ============================================================================

// Cache for parsed state keys (key -> ConditionNode)
const parseCache = new Lru<string, ConditionNode>(5000);

// ============================================================================
// Internal-pseudo Detection
// ============================================================================

/**
 * Chrome-internal pseudo-classes (e.g. `:-internal-autofill-selected`,
 * `:-internal-autofill-previewed`) cannot be targeted from user CSS and
 * may invalidate the surrounding rule in Safari even when wrapped in
 * forgiving `:is(...)`. The regex matches both bare uses and references
 * inside enhanced pseudo arguments like `:is(:-webkit-autofill,
 * :-internal-autofill-selected)`.
 */
const INTERNAL_PSEUDO_PATTERN = /:-internal-[a-z0-9-]+/g;

// ============================================================================
// Tokenizer Patterns
// ============================================================================

const SIMPLE_MODIFIER_PATTERN = /^[a-z][a-z0-9-]+$/i;
const FUNCTION_START_PATTERN =
  /@(?:media|supports|root|parent|own)?\(|:(?:is|has|not|where)\(/iy;
const SIMPLE_TOKEN_PATTERN =
  /@media:[a-z]+|@[a-z][a-z0-9-]*|[a-z][a-z0-9-]*(?:\^=|\$=|\*=|=)(?:"[^"]*"|'[^']*'|[^\s&|!^()]+)|[a-z][a-z0-9-]+|:[-a-z][a-z0-9-]*(?:\([^)]+\))?|\.[a-z][a-z0-9-]+/iy;

// ============================================================================
// Tokenizer
// ============================================================================

/**
 * Tokenize a state notation string
 */
function tokenize(stateKey: string): string[] {
  const tokens: string[] = [];
  const source = stateKey.includes(',')
    ? replaceCommasOutsideParens(stateKey)
    : stateKey;

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (
      ch === '&' ||
      ch === '|' ||
      ch === '!' ||
      ch === '^' ||
      ch === '(' ||
      ch === ')'
    ) {
      tokens.push(ch);
      i++;
      continue;
    }

    FUNCTION_START_PATTERN.lastIndex = i;
    const functionStart = FUNCTION_START_PATTERN.exec(source);
    if (functionStart) {
      const open = FUNCTION_START_PATTERN.lastIndex - 1;
      const isMedia = ch === '@' && functionStart[0].length === 7;
      const mediaClose = isMedia ? source.indexOf(')', open + 1) : -1;
      const end = isMedia
        ? mediaClose > open + 1
          ? mediaClose + 1
          : -1
        : findBalancedEnd(source, open);
      if (end !== -1) {
        tokens.push(source.slice(i, end));
        i = end;
        continue;
      }
    }

    if (ch === '[') {
      const end = source.indexOf(']', i + 1);
      if (end > i + 1) {
        tokens.push(source.slice(i, end + 1));
        i = end + 1;
        continue;
      }
    }

    SIMPLE_TOKEN_PATTERN.lastIndex = i;
    const simple = SIMPLE_TOKEN_PATTERN.exec(source);
    if (simple) {
      tokens.push(simple[0]);
      i = SIMPLE_TOKEN_PATTERN.lastIndex;
      continue;
    }

    i++;
  }

  return tokens;
}

/** Return the index after a balanced function, preserving the two-level limit. */
function findBalancedEnd(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') {
      if (++depth > 3) return -1;
    } else if (source[i] === ')' && --depth === 0) {
      return i + 1;
    }
  }
  return -1;
}

/**
 * Replace commas with | only outside of parentheses
 */
function replaceCommasOutsideParens(str: string): string {
  let result = '';
  let depth = 0;

  for (const char of str) {
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    }
    result += char === ',' && depth === 0 ? '|' : char;
  }

  return result;
}

// ============================================================================
// Recursive Descent Parser
// ============================================================================

/**
 * Parser state
 */
class Parser {
  private tokens: string[];
  private pos = 0;
  private options: ParseStateKeyOptions;

  constructor(tokens: string[], options: ParseStateKeyOptions) {
    this.tokens = tokens;
    this.options = options;
  }

  parse(): ConditionNode {
    if (this.tokens.length === 0) {
      return trueCondition();
    }
    return this.parseExpression();
  }

  private match(token: string): boolean {
    if (this.tokens[this.pos] === token) {
      this.pos++;
      return true;
    }
    return false;
  }

  /**
   * Parse expression with operator precedence:
   * ! (NOT) > ^ (XOR) > | (OR) > & (AND)
   */
  private parseExpression(): ConditionNode {
    return this.parseAnd();
  }

  private parseAnd(): ConditionNode {
    let left = this.parseOr();

    while (this.tokens[this.pos] === '&') {
      this.pos++;
      const right = this.parseOr();
      left = and(left, right);
    }

    return left;
  }

  private parseOr(): ConditionNode {
    let left = this.parseXor();

    while (this.tokens[this.pos] === '|') {
      this.pos++;
      const right = this.parseXor();
      left = or(left, right);
    }

    return left;
  }

  private parseXor(): ConditionNode {
    let left = this.parseUnary();
    let operandCount = 1;

    while (this.tokens[this.pos] === '^') {
      this.pos++;
      const right = this.parseUnary();
      operandCount++;

      if (operandCount > MAX_XOR_CHAIN_LENGTH) {
        emitWarning(
          'XOR_CHAIN_TOO_LONG',
          `XOR chain with ${operandCount} operands produces ${Math.pow(2, operandCount - 1)} OR branches. ` +
            `Consider breaking into smaller expressions to avoid exponential growth.`,
        );
      }

      // XOR: (A & !B) | (!A & B)
      left = or(and(left, not(right)), and(not(left), right));
    }

    return left;
  }

  private parseUnary(): ConditionNode {
    if (this.match('!')) {
      const operand = this.parseUnary();
      return not(operand);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ConditionNode {
    // Handle parentheses
    if (this.match('(')) {
      const expr = this.parseExpression();
      this.match(')'); // Consume closing paren (lenient if missing)
      return expr;
    }

    // Handle state tokens
    const token = this.tokens[this.pos];
    // Every operator/group token is one character; every state token emitted by
    // tokenize() is at least two characters long.
    if (token && token.length > 1) {
      this.pos++;
      return this.parseStateToken(token);
    }

    // Fallback for empty/invalid - return TRUE
    return trueCondition();
  }

  /**
   * Parse a state token into a ConditionNode
   */
  private parseStateToken(value: string): ConditionNode {
    // @starting
    if (value === '@starting') {
      return createStartingCondition(false, value);
    }

    // @media:type (e.g., @media:print)
    if (value.startsWith('@media:')) {
      const mediaType = value.slice(7) as 'print' | 'screen' | 'all' | 'speech';
      return createMediaTypeCondition(mediaType, false, value);
    }

    // @media(...) - media query
    if (value.startsWith('@media(')) {
      return this.parseMediaQuery(value);
    }

    // @supports(...) - feature/selector support query
    if (value.startsWith('@supports(')) {
      return this.parseSupportsQuery(value);
    }

    // @root(...) - root state
    if (value.startsWith('@root(')) {
      return this.parseRootState(value);
    }

    // @parent(...) - parent element state
    if (value.startsWith('@parent(')) {
      return this.parseParentState(value);
    }

    // @own(...) - own state (sub-element)
    if (value.startsWith('@own(')) {
      return this.parseOwnState(value);
    }

    // @(...) - container query
    if (value.startsWith('@(')) {
      return this.parseContainerQuery(value);
    }

    // @name - predefined state
    if (value.startsWith('@') && /^@[A-Za-z][A-Za-z0-9-]*$/.test(value)) {
      return this.parsePredefinedState(value);
    }

    // Enhanced pseudo-classes: :is(), :has(), :not(), :where()
    // Transform capitalized words to [data-element="..."] selectors,
    // auto-complete trailing combinators with *, and
    // normalize :not(X) → negated :is(X) for deduplication.
    if (value.startsWith(':')) {
      const enhancedMatch = /^:(is|has|not|where)\(/.exec(value);
      if (enhancedMatch) {
        const fn = enhancedMatch[1];
        const prefix = enhancedMatch[0];
        let content = transformSelectorContent(value.slice(prefix.length, -1));

        // Auto-complete trailing combinator: :has(Icon >) → :has(... > *)
        content = content.replace(/([>+~])\s*$/, '$1 *');

        if (fn === 'not') {
          return createPseudoCondition(`:is(${content})`, true, value);
        }

        return createPseudoCondition(`:${fn}(${content})`, false, value);
      }

      return createPseudoCondition(value, false, value);
    }

    // Class selector (e.g., .active)
    if (value.startsWith('.')) {
      return createPseudoCondition(value, false, value);
    }

    // Attribute selector (e.g., [disabled], [data-state="active"])
    // Single, simple attribute selectors become structured modifiers so the
    // pipeline can reason about their mutual exclusivity (same attribute,
    // different value can never match at once). Complex forms (~=, |=, case
    // flags, namespaces, multiple attrs, combinators) stay opaque pseudos.
    if (value.startsWith('[')) {
      const attrMatch =
        /^\[\s*([a-zA-Z_][\w-]*)\s*(?:(=|\^=|\$=|\*=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]$/.exec(
          value,
        );
      if (attrMatch) {
        const [, attribute, operator, dq, sq, bare] = attrMatch;
        if (operator === undefined) {
          // Boolean attribute: [data-disabled]
          return createModifierCondition(
            attribute,
            undefined,
            '=',
            false,
            value,
          );
        }
        const attrValue = dq ?? sq ?? bare;
        return createModifierCondition(
          attribute,
          attrValue,
          operator as '=' | '^=' | '$=' | '*=',
          false,
          value,
        );
      }
      return createPseudoCondition(value, false, value);
    }

    // Value modifier (e.g., theme=danger, size=large)
    if (value.includes('=')) {
      return this.parseValueModifier(value);
    }

    // Boolean modifier (e.g., hovered, disabled)
    return createBooleanModifier(value);
  }

  /**
   * Parse @media(...) query
   */
  private parseMediaQuery(raw: string): ConditionNode {
    const content = raw.slice(7, -1); // Remove '@media(' and ')'
    if (!content.trim()) {
      return trueCondition();
    }

    // Expand shorthands and units
    let condition = expandDimensionShorthands(content);
    condition = expandTastyUnits(condition);

    // Check for feature queries (contains ':' but not dimension comparison)
    if (
      condition.includes(':') &&
      !condition.includes('<') &&
      !condition.includes('>') &&
      !condition.includes('=')
    ) {
      // Feature query: @media(prefers-contrast: high)
      const colonIdx = condition.indexOf(':');
      const feature = condition.slice(0, colonIdx).trim();
      const featureValue = condition.slice(colonIdx + 1).trim();
      return createMediaFeatureCondition(feature, featureValue, false, raw);
    }

    // Boolean feature query: @media(prefers-reduced-motion)
    if (
      !condition.includes('<') &&
      !condition.includes('>') &&
      !condition.includes('=')
    ) {
      return createMediaFeatureCondition(
        condition.trim(),
        undefined,
        false,
        raw,
      );
    }

    // Dimension query - parse bounds
    const { dimension, lowerBound, upperBound } =
      this.parseDimensionCondition(condition);

    if (!dimension) {
      // Fallback for unparseable - treat as pseudo
      return createPseudoCondition(raw, false, raw);
    }

    return createMediaDimensionCondition(
      dimension as 'width' | 'height',
      lowerBound,
      upperBound,
      false,
      raw,
    );
  }

  /**
   * Parse dimension condition string (e.g., "width < 768px", "600px <= width < 1200px")
   */
  private parseDimensionCondition(condition: string): {
    dimension?: string;
    lowerBound?: NumericBound;
    upperBound?: NumericBound;
  } {
    // Range syntax: "600px <= width < 1200px"
    const rangeMatch = condition.match(
      /^(.+?)\s*(<=|<)\s*(width|height|inline-size|block-size)\s*(<=|<)\s*(.+)$/,
    );
    if (rangeMatch) {
      const [, lowerValue, lowerOp, dimension, upperOp, upperValue] =
        rangeMatch;
      const lower = lowerValue.trim();
      const upper = upperValue.trim();
      return {
        dimension,
        lowerBound: {
          value: lower,
          valueNumeric: parseNumericValue(lower),
          inclusive: lowerOp === '<=',
        },
        upperBound: {
          value: upper,
          valueNumeric: parseNumericValue(upper),
          inclusive: upperOp === '<=',
        },
      };
    }

    // Simple comparison: "width < 768px"
    const simpleMatch = condition.match(
      /^(width|height|inline-size|block-size)\s*(<=|>=|<|>|=)\s*(.+)$/,
    );
    if (simpleMatch) {
      const [, dimension, operator, value] = simpleMatch;
      const trimmedValue = value.trim();
      const numeric = parseNumericValue(trimmedValue);

      if (operator === '<' || operator === '<=') {
        return {
          dimension,
          upperBound: {
            value: trimmedValue,
            valueNumeric: numeric,
            inclusive: operator === '<=',
          },
        };
      } else if (operator === '>' || operator === '>=') {
        return {
          dimension,
          lowerBound: {
            value: trimmedValue,
            valueNumeric: numeric,
            inclusive: operator === '>=',
          },
        };
      } else if (operator === '=') {
        // Exact match: both bounds are the same and inclusive
        return {
          dimension,
          lowerBound: {
            value: trimmedValue,
            valueNumeric: numeric,
            inclusive: true,
          },
          upperBound: {
            value: trimmedValue,
            valueNumeric: numeric,
            inclusive: true,
          },
        };
      }
    }

    // Reversed: "768px > width"
    const reversedMatch = condition.match(
      /^(.+?)\s*(<=|>=|<|>|=)\s*(width|height|inline-size|block-size)$/,
    );
    if (reversedMatch) {
      const [, value, operator, dimension] = reversedMatch;
      const trimmedValue = value.trim();
      const numeric = parseNumericValue(trimmedValue);

      // Reverse the operator
      if (operator === '<' || operator === '<=') {
        return {
          dimension,
          lowerBound: {
            value: trimmedValue,
            valueNumeric: numeric,
            inclusive: operator === '<=',
          },
        };
      } else if (operator === '>' || operator === '>=') {
        return {
          dimension,
          upperBound: {
            value: trimmedValue,
            valueNumeric: numeric,
            inclusive: operator === '>=',
          },
        };
      }
    }

    return {};
  }

  /**
   * Parse @root(...) state
   */
  private parseInnerCondition(
    raw: string,
    prefixLen: number,
    wrap: (inner: ConditionNode) => ConditionNode,
  ): ConditionNode {
    const content = raw.slice(prefixLen, -1);
    if (!content.trim()) return trueCondition();
    return wrap(parseStateKey(content, this.options));
  }

  private parseRootState(raw: string): ConditionNode {
    return this.parseInnerCondition(raw, 6, (inner) =>
      createRootCondition(inner, false, raw),
    );
  }

  /**
   * Parse @parent(...) state
   *
   * Syntax:
   *   @parent(hovered)      → :is([data-hovered] *)
   *   @parent(theme=dark)   → :is([data-theme="dark"] *)
   *   @parent(hovered, >)   → :is([data-hovered] > *)  (direct parent)
   *   @parent(.my-class)    → :is(.my-class *)
   */
  private parseParentState(raw: string): ConditionNode {
    const content = raw.slice(8, -1);
    let condition = content.trim();
    if (!condition) {
      return trueCondition();
    }

    let direct = false;

    const lastCommaIdx = condition.lastIndexOf(',');
    if (lastCommaIdx !== -1) {
      const afterComma = condition.slice(lastCommaIdx + 1).trim();
      if (afterComma === '>') {
        direct = true;
        condition = condition.slice(0, lastCommaIdx).trim();
      }
    }

    const innerCondition = parseStateKey(condition, this.options);
    return createParentCondition(innerCondition, direct, false, raw);
  }

  /**
   * Parse @supports(...) query
   *
   * Syntax:
   *   @supports(display: grid)     → @supports (display: grid)
   *   @supports($, :has(*))        → @supports selector(:has(*))
   */
  private parseSupportsQuery(raw: string): ConditionNode {
    const content = raw.slice(10, -1); // Remove '@supports(' and ')'
    if (!content.trim()) {
      return trueCondition();
    }

    // Check for selector syntax: @supports($, :has(*))
    if (content.startsWith('$,')) {
      const selector = content.slice(2).trim(); // Remove '$,' prefix
      return createSupportsCondition('selector', selector, false, raw);
    }

    // Feature syntax: @supports(display: grid)
    return createSupportsCondition('feature', content, false, raw);
  }

  private parseOwnState(raw: string): ConditionNode {
    return this.parseInnerCondition(raw, 5, (inner) =>
      createOwnCondition(inner, false, raw),
    );
  }

  /**
   * Parse @(...) container query
   */
  private parseContainerQuery(raw: string): ConditionNode {
    const content = raw.slice(2, -1); // Remove '@(' and ')'
    if (!content.trim()) {
      return trueCondition();
    }

    // Check for named container: @(layout, w < 600px)
    // Use parentheses-aware comma search so inner commas (e.g., scroll-state(a, b)) are skipped
    const commaIdx = findTopLevelComma(content);
    let containerName: string | undefined;
    let condition: string;

    if (commaIdx !== -1) {
      containerName = content.slice(0, commaIdx).trim();
      condition = content.slice(commaIdx + 1).trim();
    } else {
      condition = content.trim();
    }

    // Check for style query shorthand: @($variant=primary)
    if (condition.startsWith('$')) {
      const styleQuery = condition.slice(1); // Remove '$'
      const eqIdx = styleQuery.indexOf('=');

      if (eqIdx === -1) {
        // Existence check: @($variant)
        return createContainerStyleCondition(
          styleQuery,
          undefined,
          containerName,
          false,
          raw,
        );
      }

      const property = styleQuery.slice(0, eqIdx).trim();
      let propertyValue = styleQuery.slice(eqIdx + 1).trim();

      // Remove quotes if present
      if (
        (propertyValue.startsWith('"') && propertyValue.endsWith('"')) ||
        (propertyValue.startsWith("'") && propertyValue.endsWith("'"))
      ) {
        propertyValue = propertyValue.slice(1, -1);
      }

      return createContainerStyleCondition(
        property,
        propertyValue,
        containerName,
        false,
        raw,
      );
    }

    // Check for function-like syntax: scroll-state(...), style(...), etc.
    // Passes the condition through to CSS verbatim.
    if (/^[a-zA-Z][\w-]*\s*\(/.test(condition)) {
      return createContainerRawCondition(condition, containerName, false, raw);
    }

    // Dimension query
    let expandedCondition = expandDimensionShorthands(condition);
    expandedCondition = expandTastyUnits(expandedCondition);

    const { dimension, lowerBound, upperBound } =
      this.parseDimensionCondition(expandedCondition);

    if (!dimension) {
      // Fallback
      return createPseudoCondition(raw, false, raw);
    }

    return createContainerDimensionCondition(
      dimension as 'width' | 'height',
      lowerBound,
      upperBound,
      containerName,
      false,
      raw,
    );
  }

  /**
   * Parse predefined state (@mobile, @dark, etc.)
   */
  private parsePredefinedState(raw: string): ConditionNode {
    const ctx = this.options.context;
    if (!ctx) {
      // No context - can't resolve predefined states
      return createPseudoCondition(raw, false, raw);
    }

    const resolved = resolvePredefinedState(raw, ctx);
    if (!resolved) {
      // Undefined predefined state - treat as modifier
      return createModifierCondition(
        `data-${camelToKebab(raw.slice(1))}`,
        undefined,
        '=',
        false,
        raw,
      );
    }

    // Parse the resolved value recursively
    return parseStateKey(resolved, this.options);
  }

  /**
   * Parse value modifier (e.g., theme=danger, size^=sm)
   */
  private parseValueModifier(raw: string): ConditionNode {
    // Match operators: =, ^=, $=, *=
    const opMatch = raw.match(/^([a-z][a-z0-9-]*)(\^=|\$=|\*=|=)(.+)$/i);
    if (!opMatch) {
      return createModifierCondition(
        `data-${camelToKebab(raw)}`,
        undefined,
        '=',
        false,
        raw,
      );
    }

    const [, key, operator, value] = opMatch;
    let cleanValue = value;

    // Remove quotes if present
    if (
      (cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
      (cleanValue.startsWith("'") && cleanValue.endsWith("'"))
    ) {
      cleanValue = cleanValue.slice(1, -1);
    }

    return createModifierCondition(
      `data-${camelToKebab(key)}`,
      cleanValue,
      operator as '=' | '^=' | '$=' | '*=',
      false,
      raw,
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a numeric value from a CSS value string
 */
function parseNumericValue(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?)(px|em|rem|vh|vw|%)?$/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

function createBooleanModifier(raw: string): ConditionNode {
  return createModifierCondition(
    `data-${camelToKebab(raw)}`,
    undefined,
    '=',
    false,
    raw,
  );
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Parse a state key string into a ConditionNode
 */
export function parseStateKey(
  stateKey: string,
  options: ParseStateKeyOptions = {},
): ConditionNode {
  // Handle empty/default state
  if (!stateKey) return trueCondition();

  const trimmed = stateKey.trim();
  if (!trimmed) return trueCondition();

  // Build cache key including local predefined states (they affect parsing)
  // Global predefined states are set once at initialization and don't change
  const ctx = options.context;
  const localStatesKey =
    ctx && Object.keys(ctx.localPredefinedStates).length > 0
      ? JSON.stringify(ctx.localPredefinedStates)
      : '';
  const cacheKey =
    trimmed + '\0' + (options.isSubElement ? '1' : '0') + '\0' + localStatesKey;

  // Check cache
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Warn about `:-internal-*` pseudo-classes. The cache miss above
  // means we only emit the warning the first time we encounter a
  // given key (subsequent identical keys reuse the cached result and
  // skip this scan). The regex catches both bare uses and references
  // inside `:is(...)` / `:has(...)` / `:not(...)` / `:where(...)`.
  //
  // Gated behind `isDevEnv()` because this is a developer-only aid.
  // `isDevEnv()` uses bracket notation on `process.env` to survive
  // tasty's own bundling and also returns `false` under `NODE_ENV=test`
  // / `NODE_ENV=production`, so the warning only fires in real dev.
  if (isDevEnv()) {
    INTERNAL_PSEUDO_PATTERN.lastIndex = 0;
    const internalMatches = trimmed.match(INTERNAL_PSEUDO_PATTERN);
    if (internalMatches && internalMatches.length > 0) {
      const unique = Array.from(new Set(internalMatches));
      emitWarning(
        'INTERNAL_PSEUDO_USED',
        `State key "${trimmed}" references internal pseudo-class${unique.length > 1 ? 'es' : ''} ${unique.map((p) => `\`${p}\``).join(', ')}. ` +
          `These are unmatchable from user CSS and can invalidate the surrounding rule in Safari (even inside \`:is(...)\`). ` +
          `Use \`:-webkit-autofill | :autofill\` instead for autofill states.`,
      );
    }
  }

  const result = SIMPLE_MODIFIER_PATTERN.test(trimmed)
    ? createBooleanModifier(trimmed)
    : new Parser(tokenize(trimmed), options).parse();

  // Cache result
  parseCache.set(cacheKey, result);

  return result;
}

/**
 * Clear the parse cache (for testing)
 */
export function clearParseCache(): void {
  parseCache.clear();
}
