/**
 * SSR auto-property inference.
 *
 * Scans rendered CSS declarations for custom properties whose types
 * can be inferred from their values (e.g. `--angle: 30deg` → `<angle>`).
 * Mirrors the client-side auto-inference in StyleInjector.inject().
 */

import type { StyleResult } from '../pipeline';
import { parsePropertyToken } from '../properties';
import { PropertyTypeResolver } from '../properties/property-type-resolver';
import type { Styles } from '../styles/types';

import type { ServerStyleCollector } from './collector';
import { formatPropertyCSS } from './format-property';

/**
 * Scan rendered rules for custom property declarations and collect
 * auto-inferred @property rules via the SSR collector.
 *
 * @param rules - Rendered style rules containing CSS declarations
 * @param collector - SSR collector to emit @property CSS into
 * @param styles - Original styles object (used to skip explicit @properties)
 */
export function collectAutoInferredProperties(
  rules: StyleResult[],
  collector: ServerStyleCollector,
  styles?: Styles,
): void {
  const registered = new Set<string>();

  if (styles) {
    const localProps = styles['@properties'];
    if (localProps && typeof localProps === 'object') {
      for (const token of Object.keys(
        localProps as Record<string, unknown>,
      )) {
        const parsed = parsePropertyToken(token);
        if (parsed.isValid) {
          registered.add(parsed.cssName);
        }
      }
    }
  }

  const resolver = new PropertyTypeResolver();

  for (const rule of rules) {
    if (!rule.declarations) continue;
    resolver.scanDeclarations(
      rule.declarations,
      (name) => registered.has(name),
      (name, syntax, initialValue) => {
        registered.add(name);
        const css = formatPropertyCSS(name, {
          syntax,
          inherits: true,
          initialValue,
        });
        if (css) {
          collector.collectProperty(`__auto:${name}`, css);
        }
      },
    );
  }
}
