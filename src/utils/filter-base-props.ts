const BasePropNames = new Set([
  'role',
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
]);

const eventRe = /^on[A-Z].+$/;
const ignoredEventProps = new Set([
  'onPress',
  'onHoverStart',
  'onHoverEnd',
  'onPressStart',
  'onPressEnd',
]);

interface PropsFilterOptions {
  // @deprecated
  labelable?: boolean;
  propNames?: Set<string>;
  eventProps?: boolean;
}

/**
 * Filters out all props that aren't valid DOM props or defined via override prop obj.
 * @param props - The component props to be filtered.
 * @param opts - Props to override.
 */
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
