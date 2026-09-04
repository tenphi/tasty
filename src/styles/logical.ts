import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { filterMods, parseStyle } from '../utils/styles';
import type { StyleHandler, StyleValue } from '../utils/styles';
import { warnOnceDev } from '../utils/warnings';
import { parseBorderValue } from './border';
import {
  LOGICAL_BORDER_STYLES,
  LOGICAL_INSET_STYLES,
  LOGICAL_MARGIN_STYLES,
  LOGICAL_PADDING_STYLES,
  LOGICAL_SCROLL_MARGIN_STYLES,
  LOGICAL_SCROLL_PADDING_STYLES,
} from './logical-list';
import { extractCSSWideKeyword, warnExtraGroupValues } from './shared';

type LogicalValue = string | number | boolean | undefined;

const LOGICAL_DIRECTIONS = ['start', 'end'] as const;
type LogicalDirection = (typeof LOGICAL_DIRECTIONS)[number];

interface LogicalAxisConfig<Name extends string> {
  styleName: Name;
  cssProperty: string;
  defaultValue: string;
  trueValue: string;
  defaultInit: string;
}

type LogicalHandlerMap<Names extends readonly string[]> = {
  [Name in Names[number]]: StyleHandler<Partial<Record<Name, LogicalValue>>>;
};

/**
 * Create one enhanced handler for one logical axis/category pair.
 *
 * The handler owns the native axis shorthand and its start/end declarations,
 * but never reads or converts a physical property. The browser remains
 * responsible for resolving logical edges from writing mode and direction.
 */
function logicalAxisStyle<const Name extends string>({
  styleName,
  cssProperty,
  defaultValue,
  trueValue,
  defaultInit,
}: LogicalAxisConfig<Name>): StyleHandler<Partial<Record<Name, LogicalValue>>> {
  const handler = ((styles: Partial<Record<Name, LogicalValue>>) => {
    let value = styles[styleName];

    if (value == null || value === false || value === '') return null;
    if (value === true) value = trueValue;
    if (typeof value === 'number') value = `${value}px`;

    const strValue = String(value);

    if (CSS_WIDE_KEYWORDS.has(strValue)) {
      return { [cssProperty]: strValue };
    }

    const groups = parseStyle(strValue as StyleValue).groups ?? [];
    if (!groups.length) return null;

    const edges: Record<LogicalDirection, string> = {
      start: defaultInit,
      end: defaultInit,
    };
    let useLonghand = false;

    for (const group of groups) {
      const directions = filterMods(
        group.mods,
        LOGICAL_DIRECTIONS,
      ) as LogicalDirection[];
      const keyword = extractCSSWideKeyword(group);
      const values = keyword
        ? [keyword]
        : group.values.length
          ? group.values
          : [defaultValue];
      if (directions.length && values.length > 1) {
        warnExtraGroupValues(styleName, group.input, 1, LOGICAL_DIRECTIONS);
      } else if (!directions.length && values.length > 2) {
        warnOnceDev(
          `extra-logical-axis-values:${styleName}:${group.input}`,
          `${styleName}="${group.input}": a logical axis takes at most two ` +
            'values in start/end order. The extra values are ignored.',
        );
      }

      if (group.mods.includes('longhand')) useLonghand = true;

      if (!directions.length) {
        edges.start = values[0];
        edges.end = values[1] ?? values[0];
      } else {
        for (const direction of directions) {
          edges[direction] = values[0];
        }
      }
    }

    if (useLonghand) {
      return {
        [`${cssProperty}-start`]: edges.start,
        [`${cssProperty}-end`]: edges.end,
      };
    }

    return {
      [cssProperty]:
        edges.start === edges.end ? edges.start : `${edges.start} ${edges.end}`,
    };
  }) as StyleHandler<Partial<Record<Name, LogicalValue>>>;

  handler.__lookupStyles = [styleName];
  return handler;
}

function zeroBorderValue(value: string): string {
  const firstSpace = value.indexOf(' ');

  return firstSpace === -1
    ? '0 solid var(--border-color, currentColor)'
    : `0${value.slice(firstSpace)}`;
}

/** Create one enhanced border handler for one logical axis. */
function logicalBorderStyle<const Name extends string>(
  styleName: Name,
  cssProperty: string,
): StyleHandler<Partial<Record<Name, LogicalValue>>> {
  const handler = ((styles: Partial<Record<Name, LogicalValue>>) => {
    let value = styles[styleName];

    if (value == null || value === false || value === '') return null;
    if (value === true) value = '1bw';
    if (typeof value === 'number') value = `${value}px`;

    const groups = parseStyle(String(value)).groups ?? [];
    if (!groups.length) return null;

    const edges: Record<LogicalDirection, string | null> = {
      start: null,
      end: null,
    };
    let fallback = '0 solid var(--border-color, currentColor)';
    let useLonghand = false;

    for (const group of groups) {
      const borderValue = parseBorderValue(group.input);
      if (borderValue == null) continue;

      const directions = filterMods(
        group.mods,
        LOGICAL_DIRECTIONS,
      ) as LogicalDirection[];

      if (group.mods.includes('longhand')) useLonghand = true;

      if (!directions.length) {
        edges.start = borderValue;
        edges.end = borderValue;
      } else {
        fallback = zeroBorderValue(borderValue);
        for (const direction of directions) {
          edges[direction] = borderValue;
        }
      }
    }

    const start = edges.start ?? fallback;
    const end = edges.end ?? fallback;

    if (!useLonghand && start === end) {
      return { [cssProperty]: start };
    }

    return {
      [`${cssProperty}-start`]: start,
      [`${cssProperty}-end`]: end,
    };
  }) as StyleHandler<Partial<Record<Name, LogicalValue>>>;

  handler.__lookupStyles = [styleName];
  return handler;
}

function logicalAxisStyles<const Names extends readonly [string, string]>(
  styleNames: Names,
  cssProperty: string,
  defaultValue: string,
  trueValue: string,
  defaultInit: string,
): LogicalHandlerMap<Names> {
  return Object.fromEntries(
    styleNames.map((styleName, index) => [
      styleName,
      logicalAxisStyle({
        styleName,
        cssProperty: `${cssProperty}-${index ? 'inline' : 'block'}`,
        defaultValue,
        trueValue,
        defaultInit,
      }),
    ]),
  ) as LogicalHandlerMap<Names>;
}

function logicalBorderStyles<const Names extends readonly [string, string]>(
  styleNames: Names,
): LogicalHandlerMap<Names> {
  return Object.fromEntries(
    styleNames.map((styleName, index) => [
      styleName,
      logicalBorderStyle(styleName, `border-${index ? 'inline' : 'block'}`),
    ]),
  ) as LogicalHandlerMap<Names>;
}

/** One handler per logical axis/category; native CSS longhands stay ordinary. */
export const logicalStyleHandlers = {
  ...logicalAxisStyles(
    LOGICAL_PADDING_STYLES,
    'padding',
    'var(--gap)',
    '1x',
    '0',
  ),
  ...logicalAxisStyles(
    LOGICAL_MARGIN_STYLES,
    'margin',
    'var(--gap)',
    '1x',
    '0',
  ),
  ...logicalAxisStyles(LOGICAL_INSET_STYLES, 'inset', '0', '0', 'auto'),
  ...logicalAxisStyles(
    LOGICAL_SCROLL_MARGIN_STYLES,
    'scroll-margin',
    '0',
    '1x',
    '0',
  ),
  ...logicalAxisStyles(
    LOGICAL_SCROLL_PADDING_STYLES,
    'scroll-padding',
    '0',
    '1x',
    '0',
  ),
  ...logicalBorderStyles(LOGICAL_BORDER_STYLES),
} as const;
