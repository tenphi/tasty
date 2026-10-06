const basePropNames = [
  'role',
  'title',
  'inert',
  'as',
  'element',
  'css',
  'qa',
  'mods',
  'qaVal',
  'hidden',
  'isHidden',
  'disabled',
  'isDisabled',
  'children',
  'style',
  'className',
  'href',
  'target',
  'tabIndex',
] as const;

const BasePropNames = new Set<string>(basePropNames);

const eventRe = /^on[A-Z].+$/;
const ignoredEventPropNames = [
  'onPress',
  'onHoverStart',
  'onHoverEnd',
  'onPressStart',
  'onPressEnd',
] as const;

const ignoredEventProps = new Set<string>(ignoredEventPropNames);

interface PropsFilterOptions {
  // @deprecated
  labelable?: boolean;
  propNames?: ReadonlySet<string>;
  eventProps?: boolean;
}

type ExplicitPropName<O> = O extends {
  propNames?: ReadonlySet<infer P>;
}
  ? Extract<P, string>
  : never;

type EventPropsEnabled<O> = O extends { eventProps?: infer E }
  ? Extract<E, boolean>
  : never;

type Characters<S extends string> = S extends `${infer First}${infer Rest}`
  ? First | Characters<Rest>
  : never;

/** Models DOM-style event keys and the runtime's ignored event names. */
type EventPropName<K extends string> = string extends K
  ? `on${Characters<'ABCDEFGHIJKLMNOPQRSTUVWXYZ'>}${string}`
  : K extends `on${infer Initial}${infer Rest}`
    ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' extends `${string}${Initial}${string}`
      ? Rest extends ''
        ? never
        : Exclude<K, (typeof ignoredEventPropNames)[number]>
      : never
    : never;

type ExplicitNumericPropName<K, O> = K extends number
  ? `${K}` extends ExplicitPropName<O>
    ? K
    : never
  : never;

type RetainedPropName<T, O> =
  | 'id'
  | (typeof basePropNames)[number]
  | `aria-${string}`
  | `data-${string}`
  | ExplicitPropName<O>
  | (true extends EventPropsEnabled<O>
      ? EventPropName<Extract<keyof T, string>>
      : never);

type FilteredProps<T extends object, O> = T extends unknown
  ? Partial<
      Pick<
        T,
        | Extract<keyof T, RetainedPropName<T, O>>
        | Extract<RetainedPropName<T, O>, keyof T>
        | ExplicitNumericPropName<keyof T, O>
      >
    >
  : never;

/**
 * Keeps the built-in base props, ARIA/data attributes, and explicitly allowed props.
 * DOM-style event names are kept only with `eventProps: true`, except the ignored
 * interaction events (which can still be allowed explicitly via `propNames`).
 * The return type preserves the input value types only for potentially retained
 * keys. Props remain optional because only own enumerable string keys are copied.
 * Use a literal union (e.g. `new Set(['name', 'type'] as const)`) for `propNames`
 * to keep precise types; a `Set<string>` can potentially retain any string key.
 * @param props - The component props to be filtered.
 * @param opts - Additional prop names and event forwarding options.
 */
export function filterBaseProps<T extends object>(
  props: T,
  opts?: undefined,
): FilteredProps<T, undefined>;
export function filterBaseProps<
  T extends object,
  O extends PropsFilterOptions | undefined = PropsFilterOptions,
>(props: T, opts: O): FilteredProps<T, O>;
export function filterBaseProps<T extends object>(
  props: T,
  opts: PropsFilterOptions = {},
): Partial<T> {
  const { propNames, eventProps } = opts;
  const filteredProps: Partial<T> = {};

  for (const prop of Object.keys(props) as (keyof T & string)[]) {
    if (
      prop === 'id' ||
      BasePropNames.has(prop) ||
      // Always preserve any ARIA attributes to maintain accessibility support.
      prop.startsWith('aria-') ||
      (eventProps && eventRe.test(prop) && !ignoredEventProps.has(prop)) ||
      propNames?.has(prop) ||
      prop.startsWith('data-')
    ) {
      filteredProps[prop] = props[prop];
    }
  }

  return filteredProps;
}
