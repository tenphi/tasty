/**
 * Format @property CSS rules for SSR output.
 *
 * Replicates the CSS construction from StyleInjector.property()
 * but returns a CSS string instead of inserting into the DOM.
 */

import type { PropertyDefinition } from '../injector/types';
import { colorInitialValueToRgb, getEffectiveDefinition } from '../properties';
import type { StyleValue } from '../utils/styles';
import { parseStyle } from '../utils/styles';

/**
 * Format a single @property rule as a CSS string.
 *
 * Returns the full `@property --name { ... }` text, or empty string
 * if the token is invalid. For color properties, also returns
 * the companion `-rgb` property.
 */
export function formatPropertyCSS(
  token: string,
  definition: PropertyDefinition,
): string {
  const result = getEffectiveDefinition(token, definition);
  if (!result.isValid) return '';

  const rules: string[] = [];

  rules.push(buildPropertyRule(result.cssName, result.definition));

  if (result.isColor) {
    const rgbCssName = `${result.cssName}-rgb`;
    const rgbInitial = colorInitialValueToRgb(result.definition.initialValue);
    rules.push(
      buildPropertyRule(rgbCssName, {
        syntax: '<number>+',
        inherits: result.definition.inherits,
        initialValue: rgbInitial,
      }),
    );
  }

  return rules.join('\n');
}

function buildPropertyRule(
  cssName: string,
  definition: PropertyDefinition,
): string {
  const parts: string[] = [];

  if (definition.syntax != null) {
    let syntax = String(definition.syntax).trim();
    if (!/^['"]/u.test(syntax)) syntax = `"${syntax}"`;
    parts.push(`syntax: ${syntax};`);
  }

  const inherits = definition.inherits ?? true;
  parts.push(`inherits: ${inherits ? 'true' : 'false'};`);

  if (definition.initialValue != null) {
    let initialValueStr: string;
    if (typeof definition.initialValue === 'number') {
      initialValueStr = String(definition.initialValue);
    } else {
      initialValueStr = parseStyle(
        definition.initialValue as StyleValue,
      ).output;
    }
    parts.push(`initial-value: ${initialValueStr};`);
  }

  const declarations = parts.join(' ').trim();
  return `@property ${cssName} { ${declarations} }`;
}
