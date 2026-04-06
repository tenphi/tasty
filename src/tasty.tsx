import type {
  AllHTMLAttributes,
  ComponentType,
  ForwardRefExoticComponent,
  JSX,
  PropsWithoutRef,
  RefAttributes,
} from 'react';
import { createElement, forwardRef } from 'react';
import { computeStyles } from './compute-styles';
import { BASE_STYLES } from './styles/list';
import type { Styles, StylesInterface } from './styles/types';
import type {
  AllBaseProps,
  BaseProps,
  BaseStyleProps,
  ModValue,
  Mods,
  Props,
  TokenValue,
  Tokens,
} from './types';
import { getDisplayName } from './utils/get-display-name';
import { isValidElementType } from './utils/is-valid-element-type';
import { mergeStyles } from './utils/merge-styles';
import { isSelector } from './pipeline';
import { hasKeys } from './utils/has-keys';
import { modAttrs } from './utils/mod-attrs';
import { processTokens } from './utils/process-tokens';

import type { StyleValue, StyleValueStateMap } from './utils/styles';

/**
 * Mapping of is* properties to their corresponding HTML attributes
 */
const IS_PROPERTIES_MAP = {
  isDisabled: 'disabled',
  isHidden: 'hidden',
  isChecked: 'checked',
} as const;

/**
 * Precalculated entries for performance optimization
 */
const IS_PROPERTIES_ENTRIES = Object.entries(IS_PROPERTIES_MAP);

/**
 * Helper function to handle is* properties consistently
 * Transforms is* props to HTML attributes and adds corresponding data-* attributes
 */
function handleIsProperties(props: Record<string, unknown>) {
  for (const [isProperty, targetAttribute] of IS_PROPERTIES_ENTRIES) {
    if (isProperty in props) {
      props[targetAttribute] = props[isProperty];
      delete props[isProperty];
    }

    // Add data-* attribute if target attribute is truthy and doesn't already exist
    const dataAttribute = `data-${targetAttribute}`;
    if (!(dataAttribute in props) && props[targetAttribute]) {
      props[dataAttribute] = '';
    }
  }
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
      isDisabled,
      isHidden,
      isChecked,
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

export type PropsWithStyles = {
  styles?: Styles;
} & Omit<Props, 'styles'>;

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
} & Pick<BaseProps, 'qa' | 'qaVal'> &
  WithVariant<V>;

export type TastyProps<
  K extends StyleList,
  V extends VariantMap,
  E extends ElementsDefinition = Record<string, never>,
  DefaultProps = Props,
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = TastyBaseProps<K, V, E, M, TP> & {
  /** The tag name of the element or a React component. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  as?: string | ComponentType<any>;
} & Partial<
    Omit<
      DefaultProps,
      'as' | 'styles' | 'styleProps' | 'modProps' | 'tokenProps' | 'tokens'
    >
  >;

/**
 * TastyElementOptions is used for the element-creation overload of tasty().
 * It includes a Tag generic that allows TypeScript to infer the correct
 * HTML element type from the `as` prop.
 *
 * Note: Uses a separate index signature with `unknown` instead of inheriting
 * from Props (which has `any`) to ensure strict type checking for styles.
 */
export type TastyElementOptions<
  K extends StyleList,
  V extends VariantMap,
  E extends ElementsDefinition = Record<string, never>,
  Tag extends keyof JSX.IntrinsicElements = 'div',
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = TastyBaseProps<K, V, E, M, TP> & {
  /** The tag name of the element or a React component. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  as?: Tag | ComponentType<any>;
} & Record<string, unknown>;

export type AllBasePropsWithMods<
  K extends StyleList,
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = AllBaseProps & {
  [key in K[number]]?:
    | StyleValue<StylesInterface[key]>
    | StyleValueStateMap<StylesInterface[key]>;
} & BaseStyleProps &
  ResolveModProps<M> &
  ResolveTokenProps<TP>;

/**
 * Keys from BasePropsWithoutChildren that should be omitted from HTML attributes.
 * This excludes event handlers so they can be properly typed from JSX.IntrinsicElements.
 */
type TastySpecificKeys =
  | 'as'
  | 'qa'
  | 'qaVal'
  | 'element'
  | 'styles'
  | 'breakpoints'
  | 'block'
  | 'inline'
  | 'mods'
  | 'isHidden'
  | 'isDisabled'
  | 'css'
  | 'style'
  | 'theme'
  | 'tokens'
  | 'ref'
  | 'color';

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
 * - HTML attributes for flexibility (properly typed based on tag)
 * - Variant support
 *
 * AllBasePropsWithMods carries generic AllHTMLAttributes which can conflict
 * with tag-specific types from JSX.IntrinsicElements (e.g. `src` is `string`
 * in AllHTMLAttributes but `string | Blob` in ImgHTMLAttributes). To avoid
 * intersection-narrowing, we Omit tag-specific keys from AllBasePropsWithMods
 * (keeping TastySpecificKeys, style props, mod props, and token props) and let
 * JSX.IntrinsicElements supply the authoritative HTML attribute types.
 */
export type TastyElementProps<
  K extends StyleList,
  V extends VariantMap,
  Tag extends keyof JSX.IntrinsicElements = 'div',
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
> = Omit<
  AllBasePropsWithMods<K, M, TP>,
  Exclude<
    keyof JSX.IntrinsicElements[Tag],
    TastySpecificKeys | K[number] | ModPropsKeys<M> | TokenPropsKeys<TP>
  >
> &
  WithVariant<V> &
  Omit<
    Omit<AllHTMLAttributes<HTMLElement>, keyof JSX.IntrinsicElements[Tag]> &
      JSX.IntrinsicElements[Tag],
    TastySpecificKeys | K[number] | ModPropsKeys<M> | TokenPropsKeys<TP>
  >;

type TastyComponentPropsWithDefaults<
  Props extends PropsWithStyles,
  DefaultProps extends Partial<Props>,
> = keyof DefaultProps extends never
  ? Props
  : {
      [key in Extract<keyof Props, keyof DefaultProps>]?: Props[key];
    } & {
      [key in keyof Omit<Props, keyof DefaultProps>]: Props[key];
    };

export function tasty<
  K extends StyleList,
  V extends VariantMap,
  E extends ElementsDefinition = Record<string, never>,
  Tag extends keyof JSX.IntrinsicElements = 'div',
  M extends ModPropsInput = readonly never[],
  TP extends TokenPropsInput = readonly never[],
>(
  options: TastyElementOptions<K, V, E, Tag, M, TP>,
  secondArg?: never,
): ForwardRefExoticComponent<
  PropsWithoutRef<TastyElementProps<K, V, Tag, M, TP>> & RefAttributes<unknown>
> &
  SubElementComponents<E>;
export function tasty<
  Props extends PropsWithStyles,
  DefaultProps extends Partial<Props> = Partial<Props>,
>(
  Component: ComponentType<Props>,
  options?: TastyProps<never, never, Record<string, never>, Props>,
): ComponentType<TastyComponentPropsWithDefaults<Props, DefaultProps>>;

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
>(
  Component: ComponentType<P>,
  options?: TastyProps<never, never, P>,
): ComponentType<TastyComponentPropsWithDefaults<P, DefaultProps>> {
  const {
    as: extendTag,
    element: extendElement,
    ...defaultProps
  } = (options ?? {}) as TastyProps<never, never, P>;

  const propsWithStyles = ['styles'].concat(
    Object.keys(defaultProps).filter((prop) => prop.endsWith('Styles')),
  );

  const _WrappedComponent = forwardRef<any, any>((props, ref) => {
    const { as, element, ...restProps } = props as Record<string, unknown>;

    const mergedStylesMap = propsWithStyles.reduce(
      (map, prop) => {
        const restValue = (restProps as any)[prop];
        const defaultValue = (defaultProps as any)[prop];

        if (restValue != null && defaultValue != null) {
          (map as any)[prop] = mergeStyles(defaultValue, restValue);
        } else {
          (map as any)[prop] = restValue ?? defaultValue;
        }

        return map;
      },
      {} as Record<string, unknown>,
    );

    const elementProps = {
      ...(defaultProps as unknown as Record<string, unknown>),
      ...(restProps as unknown as Record<string, unknown>),
      ...mergedStylesMap,
      as: (as as string | undefined) ?? extendTag,
      element: (element as string | undefined) || extendElement,
      ref,
    } as unknown as P;

    return createElement(Component as ComponentType<P>, elementProps);
  });

  _WrappedComponent.displayName = `TastyWrappedComponent(${getDisplayName(
    Component,
    (defaultProps as any).qa ?? (extendTag as any) ?? 'Anonymous',
  )})`;

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
    tokens: defaultTokens,
    elements,
    ...defaultProps
  } = tastyOptions;

  // Pre-compute merged styles for each variant (if variants are defined)
  // This avoids creating separate component instances per variant
  let variantStylesMap: Record<string, Styles | undefined> | undefined;
  if (variants) {
    // Split defaultStyles: extend-mode state maps (no '' key, non-selector)
    // are pulled out and applied AFTER variant merge so they survive
    // replace-mode maps in variants.
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

    const variantEntries = Object.entries(variants) as [string, Styles][];
    variantStylesMap = variantEntries.reduce(
      (map, [variant, variantStyles]) => {
        map[variant] = extensionStyles
          ? mergeStyles(baseStyles, variantStyles, extensionStyles)
          : mergeStyles(baseStyles, variantStyles);
        return map;
      },
      {} as Record<string, Styles | undefined>,
    );
    // Ensure 'default' variant always exists
    if (!variantStylesMap['default']) {
      variantStylesMap['default'] = defaultStyles;
    }
  }

  const {
    qa: defaultQa,
    qaVal: defaultQaVal,
    ...otherDefaultProps
  } = defaultProps ?? {};

  const propsToCheck = styleProps
    ? (styleProps as StyleList).concat(BASE_STYLES)
    : BASE_STYLES;

  const modPropsKeys: string[] | undefined = modPropsDef
    ? ((Array.isArray(modPropsDef)
        ? modPropsDef
        : Object.keys(modPropsDef)) as string[])
    : undefined;

  const tokenPropsMapping: [string, string][] | undefined = tokenPropsDef
    ? buildTokenPropsMapping(tokenPropsDef as TokenPropsInput)
    : undefined;

  // Factory-level cache: maps stable style references to computed classNames.
  // For the common case (no instance overrides), this avoids recomputation.
  const classNameCache = new Map<Styles | undefined, string>();

  const _TastyComponent = forwardRef<
    unknown,
    AllBasePropsWithMods<K> & WithVariant<V>
  >((allProps, ref) => {
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
      ...otherProps
    } = allProps as Record<string, unknown> as AllBasePropsWithMods<K> &
      WithVariant<V> & {
        className?: string;
        tokens?: Tokens;
        style?: Record<string, unknown>;
      };

    let styles = rawStyles;

    let propStyles: Styles | null = null;

    for (const prop of propsToCheck) {
      const key = prop as unknown as string;

      if (key in otherProps) {
        if (!propStyles) propStyles = {};
        const value = (otherProps as any)[key];
        (propStyles as any)[key] = value;
        delete (otherProps as any)[key];
      }
    }

    if (!styles || (styles && !hasKeys(styles as Record<string, unknown>))) {
      styles = undefined as unknown as Styles;
    }

    let propMods: Record<string, ModValue> | undefined;
    if (modPropsKeys) {
      for (const key of modPropsKeys) {
        if (key in otherProps) {
          if (!propMods) propMods = {};
          propMods[key] = (otherProps as Record<string, unknown>)[
            key
          ] as ModValue;
          delete (otherProps as Record<string, unknown>)[key];
        }
      }
    }

    let propTokens: Tokens | undefined;
    if (tokenPropsMapping) {
      for (const [propName, tokenKey] of tokenPropsMapping) {
        if (propName in otherProps) {
          if (!propTokens) propTokens = {} as Tokens;
          (propTokens as Record<string, TokenValue>)[tokenKey] = (
            otherProps as Record<string, unknown>
          )[propName] as TokenValue;
          delete (otherProps as Record<string, unknown>)[propName];
        }
      }
    }

    const baseStyles = variantStylesMap
      ? (variantStylesMap[(variant as string) || 'default'] ??
        variantStylesMap['default'])
      : defaultStyles;

    const hasInstanceStyles =
      styles && hasKeys(styles as Record<string, unknown>);
    const hasPropStyles = propStyles && hasKeys(propStyles);

    const allStyles =
      hasInstanceStyles || hasPropStyles
        ? mergeStyles(baseStyles, styles as Styles, propStyles as Styles)
        : baseStyles;

    // Use factory-level cache for stable style references (the common case)
    let stylesClassName: string;
    if (allStyles === baseStyles && classNameCache.has(allStyles)) {
      stylesClassName = classNameCache.get(allStyles)!;
    } else {
      stylesClassName = computeStyles(allStyles).className;
      if (allStyles === baseStyles) {
        classNameCache.set(allStyles, stylesClassName);
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

    const finalClassName = [(userClassName as string) || '', stylesClassName]
      .filter(Boolean)
      .join(' ');

    const elementProps = {
      'data-element': (element as string | undefined) || defaultElement,
      'data-qa': (qa as string | undefined) || defaultQa,
      'data-qaval': (qaVal as string | undefined) || defaultQaVal,
      ...(otherDefaultProps as unknown as Record<string, unknown>),
      ...(modDataAttrs || {}),
      ...(otherProps as unknown as Record<string, unknown>),
      className: finalClassName,
      style: mergedStyle,
      ref,
    } as Record<string, unknown>;

    handleIsProperties(elementProps);

    return createElement((as as string | 'div') ?? originalAs, elementProps);
  });

  _TastyComponent.displayName = `TastyComponent(${
    (defaultProps as any).qa || originalAs
  })`;

  // Attach sub-element components if elements are defined
  if (elements) {
    const subElements = Object.entries(elements).reduce(
      (acc, [name, definition]) => {
        acc[name] = createSubElement(
          name,
          definition as SubElementDefinition<keyof JSX.IntrinsicElements>,
        );
        return acc;
      },
      {} as Record<string, ForwardRefExoticComponent<any>>,
    );

    return Object.assign(_TastyComponent, subElements);
  }

  return _TastyComponent;
}

export const Element = tasty({});
