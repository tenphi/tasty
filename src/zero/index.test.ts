/**
 * The `@tenphi/tasty/zero` entry, used the way a Node build script uses it.
 */
import { mergeStyles as mergeStylesCore } from '../utils/merge-styles';

import {
  configure,
  extractStylesForSelector,
  mergeStyles,
  resetConfig,
} from './index';

afterEach(() => {
  resetConfig();
  vi.restoreAllMocks();
});

describe('system colors', () => {
  it('lets a color token hold a system color', () => {
    const warn = vi.spyOn(console, 'warn');
    configure({});

    const { css } = extractStylesForSelector(':root', {
      '#sys-canvas': 'Canvas',
      '$sys-highlight-color': 'Highlight',
      '#sys-gray': 'var(--other, GrayText)',
    });

    expect(css).toBe(
      ':root { --sys-canvas-color: Canvas; --sys-highlight-color: Highlight; ' +
        '--sys-gray-color: var(--other, graytext); }',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a system color in border and outline', () => {
    configure({});

    const { css } = extractStylesForSelector('.x', {
      border: '1bw Highlight',
      outline: '2px Highlight',
      fill: 'Canvas',
      color: 'CanvasText',
    });

    expect(css).toContain('border: 1px solid highlight;');
    expect(css).toContain('outline: 2px solid highlight;');
    expect(css).not.toContain('var(--border-color)');
    expect(css).not.toContain('var(--outline-color)');
  });

  it('writes a forced-colors border from a system color token', () => {
    configure({
      states: { '@forced': '@media(forced-colors: active)' },
    });

    const { css } = extractStylesForSelector('.x', {
      '#sys-highlight': 'Highlight',
      border: { '': '1bw #border', '@forced': '1bw #sys-highlight' },
    });

    expect(css).toContain('--sys-highlight-color: Highlight;');
    expect(css).toContain('border: 1px solid var(--sys-highlight-color);');
  });
});

describe('keywords and false in state maps', () => {
  it('writes `transition: none` under a state', () => {
    configure({
      states: { '@reduced-motion': '@media(prefers-reduced-motion: reduce)' },
    });

    const { css } = extractStylesForSelector('.x', {
      transition: { '': 'opacity 80ms', '@reduced-motion': 'none' },
    });

    expect(css).toContain('.x { transition: none; }');
    expect(css).not.toContain('--none-transition');
  });

  it('writes no padding or margin for false', () => {
    configure({});

    const { css } = extractStylesForSelector('.x', {
      padding: { '': false, hovered: '2x' },
      margin: { '': false, hovered: '2x' },
      fill: { '': false, hovered: '#red' },
    });

    expect(css).toBe(
      '.x:where([data-hovered]) { padding: 16px; margin: 16px; ' +
        'background-color: var(--red-color); }',
    );
  });
});

describe('mergeStyles', () => {
  it('is the same function the React entries export', () => {
    expect(mergeStyles).toBe(mergeStylesCore);
  });

  it('merges overrides into sub-elements and state maps', () => {
    const merged = mergeStyles(
      {
        fill: { '': '#surface', hovered: '#hover' },
        Indicator: { radius: '1r', fill: '#primary' },
      },
      {
        fill: { pressed: '#pressed', hovered: null },
        Indicator: { radius: '0.5r' },
      },
    );

    expect(merged).toEqual({
      fill: { '': '#surface', pressed: '#pressed' },
      Indicator: { radius: '0.5r', fill: '#primary' },
    });
  });
});
