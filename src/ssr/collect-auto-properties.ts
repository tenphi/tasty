/**
 * SSR / RSC auto-property inference.
 *
 * Scans rendered CSS declarations for custom properties whose types
 * can be inferred from their values (e.g. `--angle: 30deg` → `<angle>`).
 * Mirrors the client-side auto-inference in StyleInjector.inject().
 */

import type { StyleResult } from '../pipeline';
import { parsePropertyToken } from '../properties';
import { PropertyTypeResolver } from '../properties/property-type-resolver';
import type { RSCStyleCache } from '../rsc-cache';
import { pushRSCCSS } from '../rsc-cache';
import type { Styles } from '../styles/types';

import type { ServerStyleCollector } from './collector';
import { formatPropertyCSS } from './format-property';

/**
 * Scan rendered rules for auto-inferable custom properties and emit
 * @property CSS via the provided callback.
 */
function scanAndEmitAutoProperties(
  rules: StyleResult[],
  styles: Styles | undefined,
  emit: (name: string, css: string) => void,
): void {
  const registered = new Set<string>();

  if (styles) {
    const localProps = styles['@property'];
    if (localProps && typeof localProps === 'object') {
      for (const token of Object.keys(localProps as Record<string, unknown>)) {
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
          emit(name, css);
        }
      },
    );
  }
}

/**
 * Scan rendered rules for custom property declarations and collect
 * auto-inferred @property rules via the SSR collector.
 *
 * @param rules - Rendered style rules containing CSS declarations
 * @param collector - SSR collector to emit @property CSS into
 * @param styles - Original styles object (used to skip explicit @property)
 */
export function collectAutoInferredProperties(
  rules: StyleResult[],
  collector: ServerStyleCollector,
  styles?: Styles,
): void {
  scanAndEmitAutoProperties(rules, styles, (name, css) => {
    collector.collectProperty(`__auto:${name}`, css);
  });
}

/**
 * RSC variant: scan rendered rules and push auto-inferred @property CSS
 * into the RSC pending buffer.
 */
export function collectAutoInferredPropertiesRSC(
  rules: StyleResult[],
  rscCache: RSCStyleCache,
  styles?: Styles,
): void {
  scanAndEmitAutoProperties(rules, styles, (name, css) => {
    pushRSCCSS(rscCache, `__auto:${name}`, css);
  });
}
