/**
 * CSS custom-property names are case-sensitive, so `$myVar` has to reference the
 * same `--myVar` a token definition emits. The parser used to lowercase its whole
 * input before classifying, which folded those names too: `$myVar` referenced
 * `var(--myvar)` while the definition emitted `--myVar`, so a camelCase name could
 * never resolve. A leading capital is the one name the DSL does not support, and
 * folds rather than kebab-cases.
 */
import { configure, resetConfig } from '../config';
import { renderStyles } from '../pipeline';
import { processTokens } from '../utils/process-tokens';
import { foldDslCase, normalizeDslName } from '../utils/string';
import { parseStyle } from '../utils/styles';

describe('DSL name case', () => {
  afterEach(() => {
    resetConfig();
  });

  describe('references', () => {
    it('keeps inner case in a custom property name', () => {
      expect(parseStyle('$myVar').output).toBe('var(--myVar)');
      expect(parseStyle('$myLongVarName').output).toBe('var(--myLongVarName)');
    });

    it('folds a leading capital', () => {
      expect(parseStyle('$Foo').output).toBe('var(--foo)');
      expect(parseStyle('$MyVar').output).toBe('var(--myVar)');
    });

    it('applies the same rule to color token names', () => {
      expect(parseStyle('#myBrand').output).toBe('var(--myBrand-color)');
      expect(parseStyle('#Purple').output).toBe('var(--purple-color)');
    });

    it('applies the same rule to literal name forms', () => {
      expect(parseStyle('$$myProp').output).toBe('--myProp');
      expect(parseStyle('##myBrand').output).toBe('--myBrand-color');
    });

    it('keeps case through fallback, alpha and calc forms', () => {
      expect(parseStyle('($myVar, 2x)').output).toBe('var(--myVar, 16px)');
      expect(parseStyle('calc($myVar * 2)').output).toBe(
        'calc(var(--myVar) * 2)',
      );
      expect(parseStyle('#purple.$myAlpha').output).toBe(
        'oklch(from var(--purple-color) l c h / var(--myAlpha))',
      );
    });

    it('still folds everything that is not a name', () => {
      // Keywords, units and hex literals are matched lowercase, so they must fold
      // exactly as they did before.
      expect(parseStyle('DASHED').output).toBe('dashed');
      expect(parseStyle('2X').output).toBe('16px');
      expect(parseStyle('currentColor').output).toBe('currentcolor');
      expect(parseStyle('#FF0000').output).toBe('var(--ff0000-color, #ff0000)');
      expect(parseStyle('#FFF').output).toBe('var(--fff-color, #fff)');
    });
  });

  describe('definitions', () => {
    it('round-trips a camelCase custom property', () => {
      const { rules } = renderStyles({ $myVar: '2x', padding: '$myVar' });
      const css = rules.map((rule) => rule.declarations).join(' ');

      expect(css).toBe('--myVar: 16px; padding: var(--myVar);');
    });

    it('round-trips a camelCase color token', () => {
      const { rules } = renderStyles({
        '#myBrand': '#purple',
        fill: '#myBrand',
      });
      const css = rules.map((rule) => rule.declarations).join(' ');

      expect(css).toContain('--myBrand-color: var(--purple-color);');
      expect(css).toContain('background-color: var(--myBrand-color);');
    });

    it('folds a leading capital on both sides', () => {
      const { rules } = renderStyles({ $Foo: '2x', padding: '$Foo' });
      const css = rules.map((rule) => rule.declarations).join(' ');

      expect(css).toBe('--foo: 16px; padding: var(--foo);');
    });

    it('emits configured tokens under the name a reference resolves to', () => {
      expect(
        processTokens({ $Foo: '2x', $myVar: '3x', '#myBrand': '#purple' }),
      ).toEqual({
        '--foo': '16px',
        '--myVar': '24px',
        '--myBrand-color': 'var(--purple-color)',
      });
      // …which is exactly what a reference to each one asks for.
      expect(parseStyle('$Foo').output).toBe('var(--foo)');
      expect(parseStyle('$myVar').output).toBe('var(--myVar)');
      expect(parseStyle('#myBrand').output).toBe('var(--myBrand-color)');
    });

    it('matches predefined token keys case-insensitively', () => {
      // Lookup stays case-insensitive even though the emitted name keeps case.
      configure({ replaceTokens: { $CardPadding: '4x' } });

      expect(parseStyle('$cardpadding').output).toBe('32px');
      expect(parseStyle('$CardPadding').output).toBe('32px');
    });
  });

  describe('helpers', () => {
    it('normalizeDslName folds only the first character', () => {
      expect(normalizeDslName('Foo')).toBe('foo');
      expect(normalizeDslName('myVar')).toBe('myVar');
      expect(normalizeDslName('MyVar')).toBe('myVar');
      expect(normalizeDslName('my-var')).toBe('my-var');
      expect(normalizeDslName('')).toBe('');
    });

    it('foldDslCase leaves non-name text lowercased', () => {
      expect(foldDslCase('1BW SOLID $myVar')).toBe('1bw solid $myVar');
      expect(foldDslCase('NO SIGILS HERE')).toBe('no sigils here');
      expect(foldDslCase('#FF0000 $Foo')).toBe('#ff0000 $foo');
    });
  });
});
