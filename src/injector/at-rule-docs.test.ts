/**
 * Pins the at-rule injection examples in docs/injector.md.
 *
 * Uses text injection so the assertions read back exactly the CSS Tasty emitted,
 * without the engine's reserialization in between — these cases pin the
 * documented output, not the browser's normalization of it.
 */
import { configure, resetConfig } from '../config';

import {
  counterStyle,
  fontFace,
  func,
  getCSSText,
  isPropertyDefined,
  property,
} from './index';

describe('docs/injector.md at-rule injection', () => {
  beforeEach(() => {
    resetConfig();
    configure({ forceTextInjection: true });
  });

  afterEach(() => resetConfig());

  it('property() accepts a $name token', () => {
    property('$card-elevation', { syntax: '<number>', initialValue: '0' });

    expect(isPropertyDefined('--card-elevation')).toBe(true);
  });

  it('fontFace() injects a family', () => {
    fontFace('Inter', { src: 'url(/inter.woff2)', fontWeight: '400 700' });

    const css = getCSSText();
    expect(css).toContain('@font-face');
    expect(css).toContain('Inter');
  });

  it('fontFace() keeps several faces of one family', () => {
    fontFace('Inter', { src: 'url(/inter-400.woff2)', fontWeight: '400' });
    fontFace('Inter', { src: 'url(/inter-700.woff2)', fontWeight: '700' });

    const css = getCSSText();
    expect(css).toContain('inter-400.woff2');
    expect(css).toContain('inter-700.woff2');
  });

  it('counterStyle() injects a counter style', () => {
    counterStyle('dashes', {
      system: 'cyclic',
      symbols: '"—"',
      suffix: ' ',
    });

    expect(getCSSText()).toContain('@counter-style');
  });

  it('func() accepts a $$name token', () => {
    func('$$negative', { args: ['$value'], result: '(-1 * $value)' });

    const css = getCSSText();
    expect(css).toContain('@function --negative');
  });

  it('func() with weak does not override an existing definition', () => {
    func('$$dbl', { args: ['$v'], result: '(2 * $v)' });
    func('$$dbl', { args: ['$v'], result: '(99 * $v)' }, { weak: true });

    const css = getCSSText();
    expect(css).toContain('calc(2 * var(--v))');
    expect(css).not.toContain('99');
  });
});
