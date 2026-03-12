/**
 * Format global CSS rules for SSR output.
 *
 * Unlike formatRules() which applies className-based specificity doubling,
 * this function formats rules that already have their full selectors
 * (from renderStyles called with a selector string).
 */

import type { StyleResult } from '../pipeline';

/**
 * Format an array of global StyleResult rules into a CSS text string.
 *
 * Rules already have their full selectors applied by renderStyles().
 * Handles rootPrefix prepending and at-rule wrapping.
 */
export function formatGlobalRules(rules: StyleResult[]): string {
  if (rules.length === 0) return '';

  const cssRules: string[] = [];

  for (const rule of rules) {
    const selector = rule.rootPrefix
      ? `${rule.rootPrefix} ${rule.selector}`
      : rule.selector;

    const baseRule = `${selector} { ${rule.declarations} }`;

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
