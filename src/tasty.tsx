import type {
  AllHTMLAttributes,
  ComponentType,
  ElementType,
  ForwardRefExoticComponent,
  JSX,
  PropsWithoutRef,
  RefAttributes,
} from 'react';
import { createElement, forwardRef, Fragment } from 'react';
import type { ComputeStylesOptions } from './compute-styles';
import { computeStyles } from './compute-styles';
import type { PropHandlerProps } from './prop-handlers';
import { propHandlerRegistry } from './prop-handlers';
import { baseStylePropsRegistry } from './styles/base-props';
import { BASE_STYLES } from './styles/list';
import type { Styles, StylesInterface } from './styles/types';
import type {
  AllBaseProps,
  BaseProps,
  BaseStyleProps,
  ExtraBaseStyleProps,
  ModValue,
  Mods,
  TastyCustomProps,
  TokenValue,
  Tokens,
} from './types';
import { getDisplayName } from './utils/get-display-name';
import { hasKeys } from './utils/has-keys';
import { isValidElementType } from './utils/is-valid-element-type';
import { isSelector } from './utils/is-selector';
import { mergeStyles } from './utils/merge-styles';
import { modAttrs } from './utils/mod-attrs';
import { processTokens } from './utils/process-tokens';
import { getConfig, getGlobalInjector } from './config';
import { touch } from './injector';
import type { StyleInjector } from './injector/injector';
import { checkRequestScope } from './rsc-cache';

import type { StyleValue, StyleValueStateMap } from './utils/styles';

/** Transform one is* prop to its HTML and matching data attributes. */
function handleIsProperty(
  props: Record<string, unknown>,
  isProperty: string,
  targetAttribute: string,
  dataAttribute: string,
) {
  if (isProperty in props) {
    props[targetAttribute] = props[isProperty];
    delete props[isProperty];
  }

  if (!(dataAttribute in props) && props[targetAttribute]) {
    props[dataAttribute] = '';
  }
}

function handleIsProperties(props: Record<string, unknown>) {
  handleIsProperty(props, 'isDisabled', 'disabled', 'data-disabled');
  handleIsProperty(props, 'isHidden', 'hidden', 'data-hidden');
  handleIsProperty(props, 'isChecked', 'checked', 'data-checked');
}

/**
 * Creates a sub-element component for compound component patterns.
 * Sub-elements are lightweight components with data-element attribute for CSS targeting.
 */
function createSubElement<Tag extends keyof JSX.IntrinsicElements>(
  elementName: string,
  definition: SubElementDefinition<Tag>,
): ForwardRefExoticComponent<
  PropsWithoutRef<SubElementProps<Tag>> & RefAttributes<unknown>
> {
  // Normalize definition to object form
  const config =
    typeof definition === 'string'
      ? { as: definition as Tag }
      : (definition as { as?: Tag; qa?: string; qaVal?: string | number });

  const tag = config.as ?? ('div' as Tag);
  const defaultQa = config.qa;
  const defaultQaVal = config.qaVal;

  const SubElement = forwardRef<unknown, SubElementProps<Tag>>((props, ref) => {
    const {
      qa,
      qaVal,
      mods,
      tokens,
      isDisabled,
      isHidden,
      isChecked,
      className,
      style,
      ...htmlProps
    } = props as SubElementProps<Tag> & {
      className?: string;
      style?: Record<string, unknown>;
    };

    // Build mod attributes
    let modDataAttrs: Record<string, unknown> | undefined;
    if (mods) {
      modDataAttrs = modAttrs(mods as Mods) as Record<string, unknown>;
    }

    // Process tokens into inline style properties
    const tokenStyle = tokens
      ? (processTokens(tokens) as Record<string, unknown>)
      : undefined;

    // Merge token styles with explicit style prop (style has priority)
    let mergedStyle: Record<string, unknown> | undefined;
    if (tokenStyle || style) {
      mergedStyle =
        tokenStyle && style
          ? { ...tokenStyle, ...style }
          : ((tokenStyle ?? style) as Record<string, unknown>);
    }

    const elementProps = {
      'data-element': elementName,
      'data-qa': qa ?? defaultQa,
      'data-qaval': qaVal ?? defaultQaVal,
      ...(modDataAttrs || {}),
      ...htmlProps,
      className,
      style: mergedStyle,
      isDisabled: isDisabled ?? (htmlProps as Record<string, unknown>).disabled,
      isHidden: isHidden ?? (htmlProps as Record<string, unknown>).hidden,
      isChecked: isChecked ?? (htmlProps as Record<string, unknown>).checked,
      ref,
    } as Record<string, unknown>;

    // Handle is* properties (isDisabled -> disabled + data-disabled, etc.)
    handleIsProperties(elementProps);

    // Clean up undefined data attributes
    if (elementProps['data-qa'] === undefined) delete elementProps['data-qa'];
    if (elementProps['data-qaval'] === undefined)
      delete elementProps['data-qaval'];

    return createElement(tag, elementProps);
  });

  SubElement.displayName = `SubElement(${elementName})`;

  return SubElement as ForwardRefExoticComponent<
    PropsWithoutRef<SubElementProps<Tag>> & RefAttributes<unknown>
  >;
}

type AnySubElement = ReturnType<typeof createSubElement>;

/** Create the sub-element components an `elements` definition declares. */
function createSubElements(
  elements: ElementsDefinition,
): Record<string, AnySubElement> {
  const subElements: Record<string, AnySubElement> = {};
  for (const [name, definition] of Object.entries(elements)) {
    subElements[name] = createSubElement(
      name,
      definition as SubElementDefinition<keyof JSX.IntrinsicElements>,
    );
  }
  return subElements;
}

/** Statics React itself reads; never copied from a base onto its extension. */
const REACT_STATICS = new Set([
  '$$typeof',
  'render',
  'type',
  'compare',
  'displayName',
  'defaultProps',
  'propTypes',
  'contextType',
  'contextTypes',
  'childContextTypes',
  'getDerivedStateFromProps',
  'getDerivedStateFromError',
]);

/**
 * Copy the component statics of `source` onto `target`, so an extension keeps
 * its base's sub-elements (`tasty(Card, …).Title`).
 */
function hoistComponentStatics(target: object, source: object): void {
  for (const key of Object.keys(source)) {
    if (REACT_STATICS.has(key) || key in target) continue;

    const value = (source as Record<string, unknown>)[key];
    if (typeof value !== 'string' && isValidElementType(value)) {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

/**
 * Merge each variant over the base styles, once, at factory time.
 *
 * Extend-mode state maps in the base styles (no `''` key, not a selector) are
 * pulled out and applied AFTER the variant merge, so they survive replace-mode
 * maps in variants. Without a `default` variant, `default` is the base styles.
 */
function buildVariantStylesMap(
  defaultStyles: Styles | undefined,
  variants: VariantMap,
): Record<string, Styles | undefined> {
  let baseStyles = defaultStyles;
  let extensionStyles: Styles | undefined;

  if (defaultStyles) {
    for (const key of Object.keys(defaultStyles)) {
      if (isSelector(key)) continue;

      const value = (defaultStyles as Record<string, unknown>)[key];

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !('' in value)
      ) {
        if (!extensionStyles) {
          baseStyles = { ...defaultStyles } as Styles;
          extensionStyles = {} as Styles;
        }
        (extensionStyles as Record<string, unknown>)[key] = value;
        delete (baseStyles as Record<string, unknown>)[key];
      }
    }
  }

  const variantStylesMap: Record<string, Styles | undefined> = {};
  for (const [variant, variantStyles] of Object.entries(variants)) {
    variantStylesMap[variant] = extensionStyles
      ? mergeStyles(baseStyles, variantStyles, extensionStyles)
      : mergeStyles(baseStyles, variantStyles);
  }
  // Ensure 'default' variant always exists
  if (!variantStylesMap['default']) {
    variantStylesMap['default'] = defaultStyles;
  }

  return variantStylesMap;
}

interface MergedStylesEntry {
  /** The styles the passed-in object was merged over. */
  base: Styles | undefined;
  styles: Styles;
  /** What `computeStyles()` returned for `styles` (client only). */
  className?: string;
}

/**
 * Merges keyed by the passed-in styles object, held weakly so a per-render
 * object is not kept alive.
 */
type MergedStylesCache = WeakMap<object, MergedStylesEntry>;

/**
 * `mergeStyles(base, extra)`, reusing the previous result while `extra` and
 * `base` are the same objects — a wrapper's defaults, a module-level constant
 * or a memoized object. The merged object then stays the same too, which lets
 * the class names computed for it be cached. Styles are treated as immutable,
 * as React treats props.
 */
function getMergedStyles(
  cache: MergedStylesCache,
  base: Styles | undefined,
  extra: Styles,
): MergedStylesEntry {
  let entry = cache.get(extra);
  if (!entry || entry.base !== base) {
    entry = { base, styles: mergeStyles(base, extra) };
    cache.set(extra, entry);
  }
  return entry;
}

/** Move the listed props out of `props`, into a new object. */
function takeProps(
  props: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  let taken: Record<string, unknown> | undefined;
  for (const key of keys) {
    if (key in props) {
      if (!taken) taken = {};
      taken[key] = props[key];
      delete props[key];
    }
  }
  return taken;
}

/** Move the `tokenProps` props out of `props`, keyed by their tokens. */
function takeTokenProps(
  props: Record<string, unknown>,
  mapping: readonly [propName: string, tokenKey: string][],
): Tokens | undefined {
  let tokens: Record<string, TokenValue> | undefined;
  for (const [propName, tokenKey] of mapping) {
    if (propName in props) {
      if (!tokens) tokens = {};
      tokens[tokenKey] = props[propName] as TokenValue;
      delete props[propName];
    }
  }
  return tokens as Tokens | undefined;
}

/** The keys a `modProps` definition declares. */
function getModPropsKeys(def: ModPropsInput): string[] {
  return (Array.isArray(def) ? def : Object.keys(def)) as string[];
}

type StyleList = readonly (keyof {
  [key in keyof StylesInterface]: StylesInterface[key];
})[];

// ============================================================================
// Mod props types — expose modifier keys as top-level component props
// ============================================================================

/** Type descriptor for a single mod prop: a JS constructor or an enum array. */
export type ModPropDef =
  | BooleanConstructor
  | StringConstructor
  | NumberConstructor
  | readonly string[];

/** Array form: list of mod key names (types default to ModValue). */
type ModPropsList = readonly string[];

/** Object form: map of mod key names to type descriptors. */
type ModPropsMap = Readonly<Record<string, ModPropDef>>;

/** Either array or object form accepted by `modProps` option. */
export type ModPropsInput = ModPropsList | ModPropsMap;

/** Resolve a single ModPropDef to its TypeScript type. */
export type ResolveModPropDef<T> = T extends BooleanConstructor
  ? boolean
  : T extends StringConstructor
    ? string
    : T extends NumberConstructor
      ? number
      : T extends readonly (infer U)[]
        ? U
        : ModValue;

/** Resolve an entire `modProps` definition to the component prop types it adds. */
export type ResolveModProps<M extends ModPropsInput> =
  M extends readonly (infer K)[]
    ? Partial<Record<K & string, ModValue>>
    : M extends Record<string, ModPropDef>
      ? { [key in keyof M & string]?: ResolveModPropDef<M[key]> }
      : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {};

// ============================================================================
// Token props types — expose token keys as top-level component props
// ============================================================================

/** A token key with `$` or `#` prefix. */
type TokenPropKey = `$${string}` | `#${string}`;

/** Array form: list of prop names. Names ending in `Color` map to `#` color tokens. */
type TokenPropsList = readonly string[];

/** Object form: prop name -> token key with explicit `$`/`#` prefix. */
type TokenPropsMap = Readonly<Record<string, TokenPropKey>>;

/** Either array or object form accepted by `tokenProps` option. */
export type TokenPropsInput = TokenPropsList | TokenPropsMap;

/** Resolve a `tokenProps` definition to the component prop types it adds. */
export type ResolveTokenProps<TP extends TokenPropsInput> =
  TP extends readonly (infer K)[]
    ? Partial<Record<K & string, TokenValue>>
    : TP extends Record<string, TokenPropKey>
      ? Partial<Record<keyof TP & string, TokenValue>>
      : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        {};

/**
 * Pre-compute the mapping from prop name to token key at component-creation time.
 * Array form: `'progress'` -> `'$progress'`, `'accentColor'` -> `'#accent'`.
 * Object form: entries used as-is.
 */
function buildTokenPropsMapping(
  def: TokenPropsInput,
): [propName: string, tokenKey: string][] {
  if (Array.isArray(def)) {
    return (def as string[]).map((propName) => {
      if (propName.endsWith('Color') && propName.length > 5) {
        return [propName, `#${propName.slice(0, -5)}`];
      }
      return [propName, `$${propName}`];
    });
  }
  return Object.entries(def);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

type PropsWithStyles = {
  styles?: Styles;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Omit<Record<string, any>, 'styles'>;

export type VariantMap = Record<string, Styles>;

export interface WithVariant<V extends VariantMap> {
  variant?: keyof V;
}

// ============================================================================
// Sub-element types for compound components
// ============================================================================

/**
 * Definition for a sub-element. Can be either:
 * - A tag name string (e.g., 'div', 'span')
 * - An object with configuration options
 */
export type SubElementDefinition<
  Tag extends keyof JSX.IntrinsicElements = 'div',
> =
  | Tag
  | {
      as?: Tag;
      qa?: string;
      qaVal?: string | number;
    };

/**
 * Map of sub-element definitions.
 * Keys become the sub-component names (e.g., { Icon: 'span' } -> Component.Icon)
 */
export type ElementsDefinition = Record<
  string,
  SubElementDefinition<keyof JSX.IntrinsicElements>
>;

/**
 * Resolves the tag from a SubElementDefinition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ResolveElementTag<T extends SubElementDefinition<any>> = T extends string
  ? T
  : T extends { as?: infer Tag }
    ? Tag extends keyof JSX.IntrinsicElements
      ? Tag
      : 'div'
    : 'div';

/**
 * Props for sub-element components.
 * Combines HTML attributes with tasty-specific props (qa, qaVal, mods, tokens, isDisabled, etc.)
 */
export type SubElementProps<Tag extends keyof JSX.IntrinsicElements = 'div'> =
  Omit<
    JSX.IntrinsicElements[Tag],
    'ref' | 'color' | 'content' | 'translate'
  > & {
    qa?: string;
    qaVal?: string | number;
    mods?: Mods;
    tokens?: Tokens;
    isDisabled?: boolean;
    isHidden?: boolean;
    isChecked?: boolean;
  };

/**
 * Generates the sub-element component types from an ElementsDefinition
 */
type SubElementComponents<E extends ElementsDefinition> = {
  [K in keyof E]: ForwardRefExoticComponent<
    PropsWithoutRef<SubElementProps<ResolveElementTag<E[K]>>> &
      RefAttributes<
        ResolveElementTag<E[K]> extends keyof HTMLElementTagNameMap
          ? HTMLElementTagNameMap[ResolveElementTag<E[K]>]
          : Element
      >
  >;
};

/**
 * Base type containing common properties shared between TastyProps and TastyElementOptions.
 * Separated to avoid code duplication while allowing different type constraints.
 */
type TastyBaseProps<
  K extends StyleList,
  V extends VariantMap,
  E extends ElementsDefinition = Record<string, never>,
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = {
  /** Default styles of the element. */
  styles?: Styles;
  /** The list of styles that can be provided by props */
  styleProps?: K;
  /** Modifier keys exposed as top-level component props (array or typed object form). */
  modProps?: M;
  /** Token keys exposed as top-level component props (array or typed object form). */
  tokenProps?: TP;
  element?: BaseProps['element'];
  variants?: V;
  /** Default tokens for inline CSS custom properties */
  tokens?: Tokens;
  /** Sub-element definitions for compound components */
  elements?: E;
} & Pick<BaseProps, 'qa' | 'qaVal'>;

/**
 * The names the `variant` option of `tasty(Base, options)` accepts: the
 * extension's own variants and the base's, as its `variant` prop does. A
 * union, not an intersection of the two, so an extension can default to a
 * variant only one of them defines.
 */
type ExtensionVariantName<V extends VariantMap, Props> = string extends keyof V
  ? 'variant' extends keyof Props
    ? NonNullable<Props['variant' & keyof Props]>
    : keyof V
  : | keyof V
    | ('variant' extends keyof Props
        ? NonNullable<Props['variant' & keyof Props]>
        : never);

export type TastyProps<
  K extends StyleList,
  V extends VariantMap,
  E extends ElementsDefinition = Record<string, never>,
  DefaultProps = AnyProps,
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = TastyBaseProps<K, V, E, M, TP> & {
  /** The tag name of the element or a React component. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  as?: string | ComponentType<any>;
  /**
   * The variant applied when the `variant` prop is omitted or names no
   * variant: one of `variants`, or one of the base component's.
   */
  variant?: ExtensionVariantName<V, DefaultProps>;
} & Partial<
    Omit<
      DefaultProps,
      | 'as'
      | 'styles'
      | 'styleProps'
      | 'modProps'
      | 'tokenProps'
      | 'tokens'
      | 'variant'
    >
  >;

/**
 * Resolves the props of a polymorphic `as` value (intrinsic tag or component).
 * - For intrinsic tags (`'div'`, `'button'`, ...): returns `JSX.IntrinsicElements[Tag]`.
 * - For React component types: returns the component's own props.
 * - Falls back to an empty record for anything else.
 */
export type ResolveAsProps<AsType extends ElementType> =
  AsType extends keyof JSX.IntrinsicElements
    ? JSX.IntrinsicElements[AsType]
    : AsType extends ComponentType<infer P>
      ? P
      : Record<string, never>;

/**
 * TastyElementOptions is used for the element-creation overload of tasty().
 * It includes an `AsType` generic that allows TypeScript to infer the correct
 * element type from the `as` prop — both for intrinsic tags and for React
 * components (so the wrapped component's prop API is preserved).
 *
 * Note: Uses a separate index signature with `unknown` instead of an `any`
 * record to ensure strict type checking for styles.
 */
export type TastyElementOptions<
  K extends StyleList,
  V extends VariantMap,
  E extends ElementsDefinition = Record<string, never>,
  AsType extends ElementType = 'div',
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = TastyBaseProps<K, V, E, M, TP> &
  WithVariant<V> & {
    /** The tag name of the element or a React component. */
    as?: AsType;
  } & Record<string, unknown>;

export type AllBasePropsWithMods<
  K extends StyleList,
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = AllBaseProps & {
  [key in K[number]]?:
    StyleValue<StylesInterface[key]> | StyleValueStateMap<StylesInterface[key]>;
} & BaseStyleProps &
  ExtraBaseStyleProps &
  Partial<TastyCustomProps> &
  ResolveModProps<M> &
  ResolveTokenProps<TP>;

/**
 * Props consumed by Tasty rather than forwarded to the `as` component.
 * Event handlers are resolved from JSX.IntrinsicElements or the component's own props.
 */
type TastySpecificKeys =
  | keyof BaseStyleProps
  | 'as'
  | 'qa'
  | 'qaVal'
  | 'element'
  | 'styles'
  | 'mods'
  | 'isHidden'
  | 'isDisabled'
  | 'isChecked'
  | 'style'
  | 'theme'
  | 'tokens'
  | 'ref';

/** Extract prop key names from a ModPropsInput (array elements or object keys). */
type ModPropsKeys<M extends ModPropsInput> = M extends readonly (infer K)[]
  ? K & string
  : keyof M & string;

/** Extract prop key names from a TokenPropsInput (array elements or object keys). */
type TokenPropsKeys<TP extends TokenPropsInput> =
  TP extends readonly (infer K)[] ? K & string : keyof TP & string;

/**
 * Props type for tasty elements that combines:
 * - AllBasePropsWithMods for style props with strict tokens type
 * - HTML attributes for flexibility (properly typed based on `as`)
 * - Variant support
 *
 * AllBasePropsWithMods carries generic AllHTMLAttributes which can conflict
 * with element-specific types (e.g. `src` is `string` in AllHTMLAttributes but
 * `string | Blob` in ImgHTMLAttributes, or the custom props on a third-party
 * component like Next.js `Link`). To avoid intersection-narrowing, we Omit
 * element-specific keys from AllBasePropsWithMods (keeping TastySpecificKeys,
 * style props, mod props, and token props) and let the resolved `as` props
 * supply the authoritative attribute types. The `AllHTMLAttributes<HTMLElement>`
 * baseline is preserved so generic HTML attributes still work even when `as`
 * is a component type with a narrower prop API.
 */
export type TastyElementProps<
  K extends StyleList,
  V extends VariantMap,
  AsType extends ElementType = 'div',
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = Omit<
  AllBasePropsWithMods<K, M, TP>,
  Exclude<
    keyof ResolveAsProps<AsType>,
    | TastySpecificKeys
    | keyof TastyCustomProps
    | keyof ExtraBaseStyleProps
    | K[number]
    | ModPropsKeys<M>
    | TokenPropsKeys<TP>
  >
> &
  WithVariant<V> &
  Omit<
    Omit<AllHTMLAttributes<HTMLElement>, keyof ResolveAsProps<AsType>> &
      ResolveAsProps<AsType>,
    | TastySpecificKeys
    | keyof TastyCustomProps
    | keyof ExtraBaseStyleProps
    | K[number]
    | ModPropsKeys<M>
    | TokenPropsKeys<TP>
  >;

/** Statics React itself reads, as a type (see `REACT_STATICS`). */
type ReactStaticKey =
  | '$$typeof'
  | 'render'
  | 'type'
  | 'compare'
  | 'displayName'
  | 'defaultProps'
  | 'propTypes'
  | 'contextType'
  | 'contextTypes'
  | 'childContextTypes'
  | 'getDerivedStateFromProps'
  | 'getDerivedStateFromError';

/**
 * The statics of a component that are components themselves — a `tasty()`
 * base's sub-elements (`Card.Title`) — which its extension keeps.
 */
export type ComponentStatics<C> = {
  [
    Key in keyof C as Key extends ReactStaticKey
      ? never
      : C[Key] extends string
        ? never
        : C[Key] extends ElementType
          ? Key
          : never
  ]: C[Key];
};

/** Prop names the extension form's own options claim from the base's props. */
type ExtensionClaimedKeys<
  K extends StyleList,
  V extends VariantMap,
  M extends ModPropsInput,
  TP extends TokenPropsInput,
> =
  | K[number]
  | ModPropsKeys<M>
  | TokenPropsKeys<TP>
  | (string extends keyof V ? never : 'variant');

/**
 * Props of a `tasty(Component, options)` extension: the base's props, plus
 * whatever its own `styleProps`, `modProps`, `tokenProps` and `variants` add.
 * Its variants extend the base's: `variant` accepts either set.
 */
export type TastyExtensionProps<
  Props extends PropsWithStyles,
  DefaultProps extends Partial<Props>,
  K extends StyleList = readonly never[],
  V extends VariantMap = VariantMap,
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = [ExtensionClaimedKeys<K, V, M, TP>] extends [never]
  ? TastyComponentPropsWithDefaults<Props, DefaultProps>
  : Omit<
      TastyComponentPropsWithDefaults<Props, DefaultProps>,
      ExtensionClaimedKeys<K, V, M, TP>
    > & {
      [key in K[number]]?:
        | StyleValue<StylesInterface[key]>
        | StyleValueStateMap<StylesInterface[key]>;
    } & ResolveModProps<M> &
      ResolveTokenProps<TP> &
      (string extends keyof V
        ? unknown
        : {
            variant?:
              | keyof V
              | ('variant' extends keyof Props
                  ? NonNullable<Props['variant']>
                  : never);
          });

export type TastyComponentPropsWithDefaults<
  Props extends PropsWithStyles,
  DefaultProps extends Partial<Props>,
> = keyof DefaultProps extends never
  ? Props
  : // Defaults for every prop (the extension form's own default) make them all
    // optional. `Partial` keeps the base's props named in declarations, where
    // the mapped type below expands each one and needs every type it uses.
    keyof Props extends keyof DefaultProps
    ? Partial<Props>
    : {
        [key in Extract<keyof Props, keyof DefaultProps>]?: Props[key];
      } & {
        [key in keyof Omit<Props, keyof DefaultProps>]: Props[key];
      };

/**
 * The component type returned by the `tasty(options)` element-factory overload.
 *
 * It's a regular React forward-ref component whose props are typed from the
 * factory-time `as` value. Polymorphism is at factory time: each call to
 * `tasty({ as: X })` produces a component whose prop API includes `X`'s own
 * props (so `tasty({ as: NextLink })` exposes `href`, `replace`, `prefetch`,
 * etc.) alongside the Tasty-specific props (`mods`, `tokens`, `styleProps`,
 * `modProps`, `tokenProps`).
 *
 * Note: a render-time `<X as={SomeComponent} />` does not re-infer props from
 * `SomeComponent`; create another `tasty({ as: SomeComponent })` for that.
 */
export type TastyPolymorphicComponent<
  DefaultAs extends ElementType,
  K extends StyleList,
  V extends VariantMap,
  M extends ModPropsInput,
  TP extends TokenPropsInput,
> = ForwardRefExoticComponent<
  PropsWithoutRef<TastyElementProps<K, V, DefaultAs, M, TP>> &
    RefAttributes<unknown>
>;

// An omitted styleProps list must not infer the entire StyleList constraint:
// that would claim every CSS name, including the `as` component's own props.
export function tasty<
  K extends StyleList = readonly never[],
  V extends VariantMap = VariantMap,
  E extends ElementsDefinition = Record<string, never>,
  AsType extends ElementType = 'div',
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
>(
  options: TastyElementOptions<K, V, E, AsType, M, TP>,
  secondArg?: never,
): TastyPolymorphicComponent<AsType, K, V, M, TP> & SubElementComponents<E>;
export function tasty<
  Props extends PropsWithStyles,
  DefaultProps extends Partial<Props> = Partial<Props>,
  K extends StyleList = readonly never[],
  V extends VariantMap = VariantMap,
  // `const`: the base's props in the options type would widen tag names.
  const E extends ElementsDefinition = Record<string, never>,
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
  C extends ComponentType<Props> = ComponentType<Props>,
>(
  Component: C & ComponentType<Props>,
  options?: TastyProps<K, V, E, Props, M, TP>,
): ComponentType<TastyExtensionProps<Props, DefaultProps, K, V, M, TP>> &
  ComponentStatics<C> &
  (string extends keyof E ? unknown : SubElementComponents<E>);

/* eslint-disable @typescript-eslint/no-explicit-any */
// Implementation
export function tasty<
  K extends StyleList,
  V extends VariantMap,
  _C = Record<string, unknown>,
>(Component: any, options?: any) {
  if (isValidElementType(Component)) {
    return tastyWrap(Component as ComponentType<any>, options);
  }

  return tastyElement(Component as TastyProps<K, V>);
}

function tastyWrap<
  P extends PropsWithStyles,
  DefaultProps extends Partial<P> = Partial<P>,
  K extends StyleList = readonly never[],
  V extends VariantMap = VariantMap,
  E extends ElementsDefinition = Record<string, never>,
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
>(
  Component: ComponentType<P>,
  options?: TastyProps<K, V, E, P, M, TP>,
): ComponentType<TastyComponentPropsWithDefaults<P, DefaultProps>> {
  // The wrap path forwards props to `Component`; it does not re-run the base
  // factory. Its own `styleProps`, `modProps`, `tokenProps` and `variants`
  // resolve here into the `styles`, `mods` and `tokens` it forwards, and the
  // `variant` it forwards still selects the base's own variants. Other options
  // are default props, with `styles` and `*Styles` merged under instance ones.
  const {
    as: extendTag,
    element: extendElement,
    styleProps,
    modProps: modPropsDef,
    tokenProps: tokenPropsDef,
    variants,
    variant: defaultVariant,
    elements,
    ...defaultProps
  } = (options ?? {}) as TastyProps<K, V, E, P, M, TP>;

  const defaultStyles = (defaultProps as { styles?: Styles }).styles;
  const variantStylesMap = variants
    ? buildVariantStylesMap(defaultStyles, variants)
    : undefined;
  const fallbackVariant = (defaultVariant as string | undefined) ?? 'default';
  const stylePropNames = styleProps as readonly string[] | undefined;
  const modPropsKeys = modPropsDef ? getModPropsKeys(modPropsDef) : undefined;
  const tokenPropsMapping = tokenPropsDef
    ? buildTokenPropsMapping(tokenPropsDef)
    : undefined;

  const propsWithStyles = ['styles'];
  for (const prop of Object.keys(defaultProps)) {
    if (prop.endsWith('Styles')) propsWithStyles.push(prop);
  }

  const mergedCache: MergedStylesCache = new WeakMap();

  const _WrappedComponent = forwardRef<any, any>((props, ref) => {
    const { as, element, ...restProps } = props as Record<string, unknown>;

    const propStyles = stylePropNames
      ? takeProps(restProps, stylePropNames)
      : undefined;
    const propMods = modPropsKeys
      ? takeProps(restProps, modPropsKeys)
      : undefined;
    const propTokens = tokenPropsMapping
      ? takeTokenProps(restProps, tokenPropsMapping)
      : undefined;

    const variant = (restProps.variant as string | undefined) ?? defaultVariant;
    const baseStyles = variantStylesMap
      ? (variantStylesMap[(variant as string) || fallbackVariant] ??
        variantStylesMap[fallbackVariant] ??
        variantStylesMap['default'])
      : defaultStyles;

    // Unchanged instance styles keep the merged object stable across renders,
    // so the base can answer from its class name cache.
    const mergedStylesMap: Record<string, unknown> = {};
    for (const prop of propsWithStyles) {
      const restValue = restProps[prop] as Styles | undefined;
      const defaultValue =
        prop === 'styles'
          ? baseStyles
          : ((defaultProps as Record<string, unknown>)[prop] as
              Styles | undefined);

      mergedStylesMap[prop] =
        restValue != null && defaultValue != null
          ? getMergedStyles(mergedCache, defaultValue, restValue).styles
          : (restValue ?? defaultValue);
    }

    if (propStyles) {
      mergedStylesMap.styles = mergeStyles(
        mergedStylesMap.styles as Styles | undefined,
        propStyles as Styles,
      );
    }

    const elementProps = {
      ...(defaultProps as unknown as Record<string, unknown>),
      ...restProps,
      ...mergedStylesMap,
      as: (as as string | undefined) ?? extendTag,
      element: (element as string | undefined) || extendElement,
      ref,
    } as Record<string, unknown>;

    if (variant !== undefined) elementProps.variant = variant;
    if (propMods) {
      elementProps.mods = { ...(elementProps.mods as Mods), ...propMods };
    }
    if (propTokens) {
      elementProps.tokens = {
        ...(elementProps.tokens as Tokens),
        ...propTokens,
      };
    }

    return createElement(
      Component as ComponentType<P>,
      elementProps as unknown as P,
    );
  });

  _WrappedComponent.displayName = `TastyWrappedComponent(${getDisplayName(
    Component,
    (defaultProps as any).qa ?? (extendTag as any) ?? 'Anonymous',
  )})`;

  // Keep the base's sub-elements, then add (or replace with) this one's own.
  hoistComponentStatics(_WrappedComponent, Component);
  if (elements) {
    Object.assign(_WrappedComponent, createSubElements(elements));
  }

  return _WrappedComponent as unknown as ComponentType<
    TastyComponentPropsWithDefaults<P, DefaultProps>
  >;
}

function tastyElement<
  K extends StyleList,
  V extends VariantMap,
  E extends ElementsDefinition,
>(tastyOptions: TastyProps<K, V, E>) {
  const {
    as: originalAs = 'div',
    element: defaultElement,
    styles: defaultStyles,
    styleProps,
    modProps: modPropsDef,
    tokenProps: tokenPropsDef,
    variants,
    variant: defaultVariant,
    tokens: defaultTokens,
    elements,
    ...defaultProps
  } = tastyOptions;

  // Pre-compute merged styles for each variant (if variants are defined)
  // This avoids creating separate component instances per variant
  const variantStylesMap = variants
    ? buildVariantStylesMap(defaultStyles, variants)
    : undefined;
  // The variant applied when the prop is omitted or names no variant: the
  // `variant` option, else `default`.
  const fallbackVariant = (defaultVariant as string | undefined) ?? 'default';
  const fallbackStyles = variantStylesMap
    ? (variantStylesMap[fallbackVariant] ?? variantStylesMap['default'])
    : defaultStyles;

  const {
    qa: defaultQa,
    qaVal: defaultQaVal,
    ...otherDefaultProps
  } = defaultProps;

  // Fixed at factory-creation time — no dependency on global config.
  const ownPropsToCheck: readonly string[] = styleProps
    ? (styleProps as StyleList).concat(BASE_STYLES)
    : BASE_STYLES;

  // Resolved lazily and refreshed on registry version change. `configure()` can
  // run *after* this factory was created (module eval order — see `Element` at
  // the bottom of this file), and `resetConfig()` reopens configuration, so a
  // one-shot lazy init would go stale. Starts at -1 to force first resolution.
  let propsToCheck: readonly string[] = ownPropsToCheck;
  let propsToCheckVersion = -1;

  const modPropsKeys: string[] | undefined = modPropsDef
    ? getModPropsKeys(modPropsDef as ModPropsInput)
    : undefined;

  const tokenPropsMapping: [string, string][] | undefined = tokenPropsDef
    ? buildTokenPropsMapping(tokenPropsDef as TokenPropsInput)
    : undefined;

  // Factory-level caches from styles to the class names computeStyles() gave
  // them, so a re-render skips the pipeline (client only):
  // - classNameCache: the factory's own styles, per variant.
  // - mergedCache: instance styles that stay the same object between renders —
  //   an extension's defaults, a module-level constant, a memoized object —
  //   merged over the variant's styles.
  // Both are dropped when the injector deletes rules (`gc()`, `cleanup()`,
  // `destroy()`) or is replaced, since a cached name may have lost its CSS.
  let classNameCache = new Map<Styles | undefined, string>();
  let mergedCache: MergedStylesCache = new WeakMap();
  let cacheInjector: StyleInjector | undefined;
  let cacheEvictions = 0;

  // Passed when the styles object handed to computeStyles() is the factory's
  // own AND computeStyles() will see it again — which is only true where
  // classNameCache is unavailable, i.e. the server. On the client that cache
  // answers every render after the first, so memoizing chunk keys during that
  // first render would write entries nothing ever reads back. Hoisted so the
  // hot path does not allocate it.
  const STABLE_STYLES: ComputeStylesOptions = { stableStyles: true };

  const _TastyComponent = forwardRef<
    unknown,
    AllBasePropsWithMods<K> & WithVariant<V>
  >((incomingProps, ref) => {
    // Global props middleware (`configure({ propHandlers })`). Runs before any
    // destructuring so a handler can rewrite every tasty prop — `styles`, `mods`,
    // `tokens`, `variant`, `as`, `element`, `qa` — and strip its own custom props
    // so they never reach the DOM. `ref` is out of reach: forwardRef separates it.
    // Fast path while nothing is registered: one property load and one branch.
    const applyPropHandlers = propHandlerRegistry.apply;
    const allProps = applyPropHandlers
      ? (applyPropHandlers(
          incomingProps as unknown as PropHandlerProps,
        ) as unknown as typeof incomingProps)
      : incomingProps;

    const {
      as,
      styles: rawStyles,
      variant,
      mods,
      element,
      qa,
      qaVal,
      className: userClassName,
      tokens,
      style,
      theme,
      ...otherProps
    } = allProps as Record<string, unknown> as AllBasePropsWithMods<K> &
      WithVariant<V> & {
        className?: string;
        tokens?: Tokens;
        style?: Record<string, unknown>;
        theme?: string;
      };

    const styles = rawStyles;

    let propStyles: Styles | null = null;

    if (propsToCheckVersion !== baseStylePropsRegistry.version) {
      const promoted = baseStylePropsRegistry.list;

      propsToCheck =
        promoted.length === 0
          ? ownPropsToCheck
          : ownPropsToCheck.concat(promoted);
      propsToCheckVersion = baseStylePropsRegistry.version;
    }

    for (const prop of propsToCheck) {
      const key = prop as unknown as string;

      if (key in otherProps) {
        if (!propStyles) propStyles = {};
        const value = (otherProps as any)[key];
        (propStyles as any)[key] = value;
        delete (otherProps as any)[key];
      }
    }

    const propMods = modPropsKeys
      ? (takeProps(otherProps as Record<string, unknown>, modPropsKeys) as
          Record<string, ModValue> | undefined)
      : undefined;

    const propTokens = tokenPropsMapping
      ? takeTokenProps(otherProps as Record<string, unknown>, tokenPropsMapping)
      : undefined;

    const baseStyles = variantStylesMap
      ? (variant && variantStylesMap[variant as string]) || fallbackStyles
      : defaultStyles;

    const hasInstanceStyles =
      !!styles && hasKeys(styles as Record<string, unknown>);

    // Use factory-level caches for stable style references (client only).
    // On the server they must be skipped: both the SSR collector and the RSC
    // inline-style paths are per-request, so every request must call
    // computeStyles() to ensure CSS is actually collected/emitted.
    const useFactoryCache = typeof document !== 'undefined';

    if (useFactoryCache) {
      const injector = getGlobalInjector();
      if (injector !== cacheInjector || injector.evictions !== cacheEvictions) {
        classNameCache = new Map();
        mergedCache = new WeakMap();
        cacheInjector = injector;
        cacheEvictions = injector.evictions;
      }
    }

    let allStyles: Styles | undefined;
    let generatedClassName: string | undefined;
    let mergedEntry: MergedStylesEntry | undefined;

    if (propStyles) {
      // Style props are fresh values every render; nothing to reuse.
      allStyles = mergeStyles(baseStyles, styles as Styles, propStyles);
    } else if (hasInstanceStyles) {
      if (useFactoryCache) {
        mergedEntry = getMergedStyles(
          mergedCache,
          baseStyles,
          styles as Styles,
        );
        allStyles = mergedEntry.styles;
        generatedClassName = mergedEntry.className;
      } else {
        allStyles = mergeStyles(baseStyles, styles as Styles);
      }
    } else {
      allStyles = baseStyles;
      if (useFactoryCache) generatedClassName = classNameCache.get(baseStyles);
    }

    let rscCSS: string | undefined;

    if (generatedClassName !== undefined) {
      touch(generatedClassName);
    } else {
      const result = computeStyles(
        allStyles,
        !useFactoryCache && allStyles === baseStyles
          ? STABLE_STYLES
          : undefined,
      );
      generatedClassName = result.className;
      rscCSS = result.css;
      if (mergedEntry) {
        mergedEntry.className = generatedClassName;
      } else if (useFactoryCache && allStyles === baseStyles) {
        classNameCache.set(allStyles, generatedClassName);
      }
    }

    // Merge tokens: default -> instance -> tokenProps
    let mergedTokens: Tokens | undefined;
    if (defaultTokens || tokens || propTokens) {
      if (!defaultTokens && !propTokens) {
        mergedTokens = tokens as Tokens;
      } else if (!tokens && !propTokens) {
        mergedTokens = defaultTokens;
      } else {
        mergedTokens = {
          ...defaultTokens,
          ...(tokens as Tokens),
          ...propTokens,
        } as Tokens;
      }
    }

    const processedTokenStyle = processTokens(mergedTokens);

    let mergedStyle: Record<string, unknown> | undefined;
    if (processedTokenStyle || style) {
      if (!processedTokenStyle) {
        mergedStyle = style;
      } else if (!style) {
        mergedStyle = processedTokenStyle as Record<string, unknown>;
      } else {
        mergedStyle = {
          ...(processedTokenStyle as Record<string, unknown>),
          ...style,
        };
      }
    }

    const mergedMods = propMods
      ? { ...(mods as Record<string, ModValue>), ...propMods }
      : (mods as Record<string, ModValue> | undefined);

    let modDataAttrs: Record<string, unknown> | undefined;
    if (mergedMods) {
      modDataAttrs = modAttrs(mergedMods as unknown as Mods) as Record<
        string,
        unknown
      >;
    }

    let finalClassName = generatedClassName;
    if (userClassName) {
      finalClassName = finalClassName
        ? `${userClassName} ${finalClassName}`
        : userClassName;
    }

    const elementProps = {
      'data-element': (element as string | undefined) || defaultElement,
      'data-qa': (qa as string | undefined) || defaultQa,
      'data-qaval': (qaVal as string | undefined) || defaultQaVal,
      'data-theme': theme,
      ...(otherDefaultProps as unknown as Record<string, unknown>),
      ...(modDataAttrs || {}),
      ...(otherProps as unknown as Record<string, unknown>),
      className: finalClassName,
      style: mergedStyle,
      ref,
    } as Record<string, unknown>;

    handleIsProperties(elementProps);

    if (elementProps['data-theme'] === undefined) {
      delete elementProps['data-theme'];
    }

    const el = createElement(
      (as as string | 'div') ?? originalAs,
      elementProps,
    );

    // RSC mode: wrap element with inline <style> tag.
    // Class names are extracted from these tags on the client via
    // the doubled-specificity pattern (.tXXX.tXXX), so no <script> is needed.
    if (rscCSS) {
      checkRequestScope();
      const nonce = getConfig().nonce;

      return createElement(
        Fragment,
        null,
        createElement('style', {
          'data-tasty-rsc': '',
          nonce,
          dangerouslySetInnerHTML: { __html: rscCSS },
        }),
        el,
      );
    }

    return el;
  });

  _TastyComponent.displayName = `TastyComponent(${
    (defaultProps as any).qa || originalAs
  })`;

  // Attach sub-element components if elements are defined
  if (elements) {
    return Object.assign(_TastyComponent, createSubElements(elements));
  }

  return _TastyComponent;
}

export const Element = /* @__PURE__ */ tasty({});
