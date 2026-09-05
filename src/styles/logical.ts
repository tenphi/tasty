import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { parseStyle } from '../utils/styles';
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

const LOGICAL_START = 1;
const LOGICAL_END = 2;
const LOGICAL_LONGHAND = 4;

function logicalModFlags(mods: string[]): number {
  let flags = 0;

  for (const mod of mods) {
    if (mod === 'start') flags |= LOGICAL_START;
    else if (mod === 'end') flags |= LOGICAL_END;
    else if (mod === 'longhand') flags |= LOGICAL_LONGHAND;
  }

  return flags;
}

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
      const modFlags = logicalModFlags(group.mods);
      const hasDirection = modFlags & (LOGICAL_START | LOGICAL_END);
      const keyword = extractCSSWideKeyword(group);
      const values = keyword
        ? [keyword]
        : group.values.length
          ? group.values
          : [defaultValue];
      if (hasDirection && values.length > 1) {
        warnExtraGroupValues(styleName, group.input, 1, LOGICAL_DIRECTIONS);
      } else if (!hasDirection && values.length > 2) {
        warnOnceDev(
          `extra-logical-axis-values:${styleName}:${group.input}`,
          `${styleName}="${group.input}": a logical axis takes at most two ` +
            'values in start/end order. The extra values are ignored.',
        );
      }

      if (modFlags & LOGICAL_LONGHAND) useLonghand = true;

      if (!hasDirection) {
        edges.start = values[0];
        edges.end = values[1] ?? values[0];
      } else {
        if (modFlags & LOGICAL_START) edges.start = values[0];
        if (modFlags & LOGICAL_END) edges.end = values[0];
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

      const modFlags = logicalModFlags(group.mods);
      const hasDirection = modFlags & (LOGICAL_START | LOGICAL_END);

      if (modFlags & LOGICAL_LONGHAND) useLonghand = true;

      if (!hasDirection) {
        edges.start = borderValue;
        edges.end = borderValue;
      } else {
        fallback = zeroBorderValue(borderValue);
        if (modFlags & LOGICAL_START) edges.start = borderValue;
        if (modFlags & LOGICAL_END) edges.end = borderValue;
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
