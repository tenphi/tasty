/**
 * Format @keyframes CSS rules for SSR output.
 *
 * Replicates the stepsToCSS logic from SheetManager but as a
 * standalone function that doesn't need DOM access.
 */

import type { KeyframesSteps } from '../injector/types';
import { createStyle, STYLE_HANDLER_MAP } from '../styles';
import type { CSSMap, StyleHandler, StyleValueStateMap } from '../utils/styles';

/**
 * Convert keyframes steps to a CSS string.
 * Replicates SheetManager.stepsToCSS() without the class instance.
 */
function stepsToCSS(steps: KeyframesSteps): string {
  const rules: string[] = [];

  for (const [key, value] of Object.entries(steps)) {
    if (typeof value === 'string') {
      rules.push(`${key} { ${value.trim()} }`);
      continue;
    }

    const styleMap = (value || {}) as StyleValueStateMap;
    const styleNames = Object.keys(styleMap).sort();
    const handlerQueue: StyleHandler[] = [];
    const seenHandlers = new Set<StyleHandler>();

    styleNames.forEach((styleName) => {
      let handlers = STYLE_HANDLER_MAP[styleName];
      if (!handlers) {
        handlers = STYLE_HANDLER_MAP[styleName] = [createStyle(styleName)];
      }

      handlers.forEach((handler) => {
        if (!seenHandlers.has(handler)) {
          seenHandlers.add(handler);
          handlerQueue.push(handler);
        }
      });
    });

    const declarationPairs: { prop: string; value: string }[] = [];

    handlerQueue.forEach((handler) => {
      const lookup = handler.__lookupStyles;
      const filteredMap = lookup.reduce<StyleValueStateMap>((acc, name) => {
        const v = styleMap[name];
        if (v !== undefined) acc[name] = v;
        return acc;
      }, {});

      const result = handler(filteredMap);
      if (!result) return;

      const results = Array.isArray(result) ? result : [result];
      results.forEach((cssMap) => {
        if (!cssMap || typeof cssMap !== 'object') return;
        const { $: _$, ...props } = cssMap as CSSMap;

        Object.entries(props).forEach(([prop, val]) => {
          if (val == null || val === '') return;

          if (Array.isArray(val)) {
            val.forEach((v) => {
              if (v != null && v !== '') {
                declarationPairs.push({ prop, value: String(v) });
              }
            });
          } else {
            declarationPairs.push({ prop, value: String(val) });
          }
        });
      });
    });

    const declarations = declarationPairs
      .map((d) => `${d.prop}: ${d.value}`)
      .join('; ');

    rules.push(`${key} { ${declarations.trim()} }`);
  }

  return rules.join(' ');
}

/**
 * Format a @keyframes rule as a CSS string.
 */
export function formatKeyframesCSS(
  name: string,
  steps: KeyframesSteps,
): string {
  const cssSteps = stepsToCSS(steps);
  return `@keyframes ${name} { ${cssSteps} }`;
}
