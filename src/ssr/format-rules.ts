/**
 * Shared CSS rule formatting utility.
 *
 * Extracted from SheetManager to allow both the DOM-based injector (client)
 * and the ServerStyleCollector (server) to produce identical CSS text
 * from StyleResult arrays.
 */

import type { StyleResult } from '../pipeline';

/**
 * Resolve selectors for a rule, applying className-based specificity doubling
 * and rootPrefix handling. Mirrors the logic in StyleInjector.inject().
 */
function resolveSelector(
  rule: StyleResult,
  className: string,
): string {
  let selector = rule.selector;

  if (rule.needsClassName) {
    const selectorParts = selector ? selector.split('|||') : [''];
    const classPrefix = `.${className}.${className}`;

    selector = selectorParts
      .map((part) => {
        const classSelector = part ? `${classPrefix}${part}` : classPrefix;

        if (rule.rootPrefix) {
          return `${rule.rootPrefix} ${classSelector}`;
        }
        return classSelector;
      })
      .join(', ');
  }

  return selector;
}

/**
 * Group rules by selector + at-rules and merge their declarations.
 * Mirrors the grouping logic in SheetManager.insertRule().
 */
function groupRules(
  rules: { selector: string; declarations: string; atRules?: string[] }[],
): { selector: string; declarations: string; atRules?: string[] }[] {
  const groupMap = new Map<
    string,
    { selector: string; atRules?: string[]; declarations: string }
  >();
  const order: string[] = [];

  const atKey = (at?: string[]) => (at && at.length ? at.join('|') : '');

  for (const r of rules) {
    const key = `${atKey(r.atRules)}||${r.selector}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.declarations = existing.declarations
        ? `${existing.declarations} ${r.declarations}`
        : r.declarations;
    } else {
      groupMap.set(key, {
        selector: r.selector,
        atRules: r.atRules,
        declarations: r.declarations,
      });
      order.push(key);
    }
  }

  return order.map((key) => groupMap.get(key)!);
}

/**
 * Format an array of StyleResult rules into a CSS text string.
 *
 * Applies className-based specificity doubling (.cls.cls),
 * groups rules by selector + at-rules, and wraps with at-rule blocks.
 *
 * Produces the same CSS text as SheetManager.insertRule() would insert
 * into the DOM, but as a plain string suitable for SSR output.
 */
export function formatRules(
  rules: StyleResult[],
  className: string,
): string {
  if (rules.length === 0) return '';

  const resolvedRules = rules.map((rule) => ({
    selector: resolveSelector(rule, className),
    declarations: rule.declarations,
    atRules: rule.atRules,
  }));

  const grouped = groupRules(resolvedRules);
  const cssRules: string[] = [];

  for (const rule of grouped) {
    const baseRule = `${rule.selector} { ${rule.declarations} }`;

    let fullRule = baseRule;
    if (rule.atRules && rule.atRules.length > 0) {
      fullRule = rule.atRules.reduce(
        (css, atRule) => `${atRule} { ${css} }`,
        baseRule,
      );
    }

    cssRules.push(fullRule);
  }

  return cssRules.join('\n');
}
