import { getGlobalInjector } from '../config';
import { getStyleTarget, pushRSCCSS } from '../rsc-cache';
import { formatPropertyCSS } from '../ssr/format-property';

export interface UsePropertyOptions {
  /**
   * CSS syntax string for the property (e.g., '<color>', '<length>', '<angle>').
   * For color tokens (#name), this is auto-set to '<color>' and cannot be overridden.
   * @see https://developer.mozilla.org/en-US/docs/Web/CSS/@property/syntax
   */
  syntax?: string;
  /**
   * Whether the property inherits from parent elements
   * @default true
   */
  inherits?: boolean;
  /**
   * Initial value for the property.
   * For color tokens (#name), this defaults to 'transparent' if not specified.
   */
  initialValue?: string | number;
  /**
   * Shadow root or document to inject into
   */
  root?: Document | ShadowRoot;
}

/**
 * Register a CSS @property custom property.
 * This enables advanced features like animating custom properties.
 *
 * Note: @property rules are global and persistent once defined.
 * The function ensures the property is only registered once per root.
 *
 * Accepts tasty token syntax for the property name:
 * - `$name` → defines `--name`
 * - `#name` → defines `--name-color` (auto-sets syntax: '<color>', defaults initialValue: 'transparent')
 * - `--name` → defines `--name` (legacy format)
 *
 * Works in all environments: client, SSR with collector, and React Server Components.
 *
 * @param name - The property token ($name, #name) or CSS property name (--name)
 * @param options - Property configuration
 *
 * @example Basic property with token syntax
 * ```tsx
 * function Spinner() {
 *   useProperty('$rotation', {
 *     syntax: '<angle>',
 *     inherits: false,
 *     initialValue: '0deg',
 *   });
 *
 *   return <div className="spinner" />;
 * }
 * ```
 *
 * @example Color property with token syntax (auto-sets syntax)
 * ```tsx
 * function MyComponent() {
 *   useProperty('#theme', {
 *     initialValue: 'red', // syntax: '<color>' is auto-set
 *   });
 *
 *   // Now --theme-color can be animated with CSS transitions
 *   return <div style={{ '--theme-color': 'blue' } as React.CSSProperties}>Colored</div>;
 * }
 * ```
 *
 * @example Legacy format (still supported)
 * ```tsx
 * function ResizableBox() {
 *   useProperty('--box-size', {
 *     syntax: '<length>',
 *     initialValue: '100px',
 *   });
 *
 *   return <div style={{ width: 'var(--box-size)' }} />;
 * }
 * ```
 */
export function useProperty(name: string, options?: UsePropertyOptions): void {
  if (!name) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Tasty] useProperty: property name is required`);
    }
    return;
  }

  const target = getStyleTarget();

  if (target.mode === 'ssr') {
    target.collector.collectInternals();

    const css = formatPropertyCSS(name, {
      syntax: options?.syntax,
      inherits: options?.inherits,
      initialValue: options?.initialValue,
    });
    if (css) {
      target.collector.collectProperty(name, css);
    }
    return;
  }

  if (target.mode === 'rsc') {
    const css = formatPropertyCSS(name, {
      syntax: options?.syntax,
      inherits: options?.inherits,
      initialValue: options?.initialValue,
    });
    if (css) {
      pushRSCCSS(target.cache, `__prop:${name}`, css);
    }
    return;
  }

  const injector = getGlobalInjector();

  if (injector.isPropertyDefined(name, { root: options?.root })) {
    return;
  }

  injector.property(name, {
    syntax: options?.syntax,
    inherits: options?.inherits,
    initialValue: options?.initialValue,
    root: options?.root,
  });
}
