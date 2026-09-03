import { CSS_WIDE_KEYWORDS } from '../parser/const';
import { filterMods, parseStyle } from '../utils/styles';
import type { StyleHandler, StyleValue } from '../utils/styles';
import { parseBorderValue } from './border';
import {
  extractCSSWideKeyword,
  warnExtraGroupValues,
  warnOnceDev,
} from './shared';

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

/** One handler per logical axis/category; native CSS longhands stay ordinary. */
export const logicalStyleHandlers = {
  blockPadding: logicalAxisStyle({
    styleName: 'blockPadding',
    cssProperty: 'padding-block',
    defaultValue: 'var(--gap)',
    trueValue: '1x',
    defaultInit: '0',
  }),
  inlinePadding: logicalAxisStyle({
    styleName: 'inlinePadding',
    cssProperty: 'padding-inline',
    defaultValue: 'var(--gap)',
    trueValue: '1x',
    defaultInit: '0',
  }),
  blockMargin: logicalAxisStyle({
    styleName: 'blockMargin',
    cssProperty: 'margin-block',
    defaultValue: 'var(--gap)',
    trueValue: '1x',
    defaultInit: '0',
  }),
  inlineMargin: logicalAxisStyle({
    styleName: 'inlineMargin',
    cssProperty: 'margin-inline',
    defaultValue: 'var(--gap)',
    trueValue: '1x',
    defaultInit: '0',
  }),
  blockInset: logicalAxisStyle({
    styleName: 'blockInset',
    cssProperty: 'inset-block',
    defaultValue: '0',
    trueValue: '0',
    defaultInit: 'auto',
  }),
  inlineInset: logicalAxisStyle({
    styleName: 'inlineInset',
    cssProperty: 'inset-inline',
    defaultValue: '0',
    trueValue: '0',
    defaultInit: 'auto',
  }),
  blockScrollMargin: logicalAxisStyle({
    styleName: 'blockScrollMargin',
    cssProperty: 'scroll-margin-block',
    defaultValue: '0',
    trueValue: '1x',
    defaultInit: '0',
  }),
  inlineScrollMargin: logicalAxisStyle({
    styleName: 'inlineScrollMargin',
    cssProperty: 'scroll-margin-inline',
    defaultValue: '0',
    trueValue: '1x',
    defaultInit: '0',
  }),
  blockScrollPadding: logicalAxisStyle({
    styleName: 'blockScrollPadding',
    cssProperty: 'scroll-padding-block',
    defaultValue: '0',
    trueValue: '1x',
    defaultInit: '0',
  }),
  inlineScrollPadding: logicalAxisStyle({
    styleName: 'inlineScrollPadding',
    cssProperty: 'scroll-padding-inline',
    defaultValue: '0',
    trueValue: '1x',
    defaultInit: '0',
  }),
  blockBorder: logicalBorderStyle('blockBorder', 'border-block'),
  inlineBorder: logicalBorderStyle('inlineBorder', 'border-inline'),
} as const;
