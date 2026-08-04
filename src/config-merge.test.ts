/**
 * Repeated `configure()` calls must merge, not replace.
 *
 * The common shape is a design-system module calling `configure()` and then an
 * application calling it again. Before this was fixed, `recipes`, `keyframes`,
 * `properties`, `fontFaces`, `counterStyles`, and CSS `@function` definitions all
 * replaced wholesale, so the design system's values vanished — while `tokens` and
 * `globalStyles` merged, making the inconsistency easy to miss.
 */
import {
  configure,
  getEffectiveProperties,
  getGlobalCounterStyles,
  getGlobalFontFaces,
  getGlobalFunctions,
  getGlobalKeyframes,
  getGlobalRecipes,
  isFunctionsPolyfillEnabled,
  resetConfig,
} from './config';

describe('repeated configure() merges', () => {
  beforeEach(() => resetConfig());
  afterEach(() => resetConfig());

  it('merges recipes', () => {
    configure({ recipes: { card: { padding: '4x' } } });
    configure({ recipes: { elevated: { shadow: '1x' } } });

    expect(Object.keys(getGlobalRecipes() ?? {}).sort()).toEqual([
      'card',
      'elevated',
    ]);
  });

  it('merges keyframes', () => {
    configure({ keyframes: { fadeIn: { from: { opacity: 0 } } } });
    configure({ keyframes: { pulse: { '50%': { opacity: 0.5 } } } });

    expect(Object.keys(getGlobalKeyframes() ?? {}).sort()).toEqual([
      'fadeIn',
      'pulse',
    ]);
  });

  it('merges properties without baking in the defaults', () => {
    configure({ properties: { $a: { syntax: '<length>' } } });
    configure({ properties: { $b: { syntax: '<number>' } } });

    const properties = getEffectiveProperties();

    expect(properties['$a']).toBeDefined();
    expect(properties['$b']).toBeDefined();
  });

  it('merges fontFaces', () => {
    configure({ fontFaces: { A: { src: 'url(a.woff2)' } } });
    configure({ fontFaces: { B: { src: 'url(b.woff2)' } } });

    expect(Object.keys(getGlobalFontFaces() ?? {}).sort()).toEqual(['A', 'B']);
  });

  it('merges counterStyles', () => {
    configure({ counterStyles: { a: { system: 'cyclic', symbols: '"x"' } } });
    configure({ counterStyles: { b: { system: 'cyclic', symbols: '"y"' } } });

    expect(Object.keys(getGlobalCounterStyles() ?? {}).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('merges CSS @function definitions', () => {
    configure({ functions: { $$a: { args: ['$v'], result: '$v' } } });
    configure({ functions: { $$b: { args: ['$v'], result: '(-1 * $v)' } } });

    expect(Object.keys(getGlobalFunctions() ?? {}).sort()).toEqual([
      '$$a',
      '$$b',
    ]);
  });

  it('shallow-merges polyfills so a later explicit false still wins', () => {
    configure({ polyfills: { functions: true } });
    expect(isFunctionsPolyfillEnabled()).toBe(true);

    // An unrelated later call must not silently switch it off.
    configure({ polyfills: {} });
    expect(isFunctionsPolyfillEnabled()).toBe(true);

    configure({ polyfills: { functions: false } });
    expect(isFunctionsPolyfillEnabled()).toBe(false);
  });

  it('lets a later call override the same key', () => {
    configure({ recipes: { card: { padding: '4x' } } });
    configure({ recipes: { card: { padding: '8x' } } });

    expect(getGlobalRecipes()?.card).toEqual({ padding: '8x' });
  });
});
