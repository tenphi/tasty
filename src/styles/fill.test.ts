import { renderStyles } from '../pipeline';
import {
  resetGlobalPredefinedTokens,
  setGlobalPredefinedTokens,
} from '../utils/styles';
import { resetStyleWarnings } from '../utils/warnings';

import { colorStyle } from './color';
import { fillStyle, svgFillStyle } from './fill';

const LAYER =
  'linear-gradient(var(--tasty-second-fill-color), var(--tasty-second-fill-color))';

describe('a comma mixes two fill colors (deprecated)', () => {
  it('compiles to one `color-mix()` in sRGB', () => {
    expect(fillStyle({ fill: '#dark 4%, #surface' })).toEqual({
      'background-color':
        'color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))',
    });
  });

  it('keeps the colors and weights as written', () => {
    expect(fillStyle({ fill: '#surface, #dark 4%' })).toEqual({
      'background-color':
        'color-mix(in srgb, var(--surface-color), var(--dark-color) 4%)',
    });
    expect(fillStyle({ fill: '#dark, #surface' })).toEqual({
      'background-color':
        'color-mix(in srgb, var(--dark-color), var(--surface-color))',
    });
  });

  it('takes a weight from a custom property', () => {
    expect(
      fillStyle({ fill: '#row-overlay $overlay-weight, #row-base' }),
    ).toEqual({
      'background-color':
        'color-mix(in srgb, var(--row-overlay-color) var(--overlay-weight), var(--row-base-color))',
    });
    expect(fillStyle({ fill: '#dark ($hover * 100%), #surface' })).toEqual({
      'background-color':
        'color-mix(in srgb, var(--dark-color) calc(var(--hover) * 100%), var(--surface-color))',
    });
  });

  it('applies to `backgroundColor` too', () => {
    expect(fillStyle({ backgroundColor: '#dark 4%, #surface' })).toEqual({
      'background-color':
        'color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))',
    });
  });

  it('leaves the image as the only background layer', () => {
    expect(
      fillStyle({ fill: '#dark 4%, #surface', image: 'url(/image.png)' }),
    ).toEqual({
      'background-color':
        'color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))',
      'background-image': 'url(/image.png)',
    });
  });

  it('keeps one shape across a state map', () => {
    const rules = renderStyles(
      { fill: { '': '#surface', hovered: '#dark 4%, #surface' } },
      '.t',
    );

    expect(rules.map((rule) => [rule.selector, rule.declarations])).toEqual([
      [
        '.t:where(:not([data-hovered]))',
        'background-color: var(--surface-color);',
      ],
      [
        '.t:where([data-hovered])',
        'background-color: color-mix(in srgb, var(--dark-color) 4%, var(--surface-color));',
      ],
    ]);
  });
});

describe('a compound color', () => {
  it('fills one background color', () => {
    expect(fillStyle({ fill: '#surface+#dark.04' })).toEqual({
      'background-color':
        'color-mix(in srgb, var(--dark-color) 4%, var(--surface-color))',
    });
  });

  it('can be one side of a comma mix', () => {
    expect(fillStyle({ fill: '#surface+#dark.04, #accent 10%' })).toEqual({
      'background-color':
        'color-mix(in srgb, color-mix(in srgb, var(--dark-color) 4%, var(--surface-color)), var(--accent-color) 10%)',
    });
  });
});

describe('a malformed compound', () => {
  it('leaves no declaration rather than the raw input', () => {
    expect(fillStyle({ fill: '#surface+1x' })).toBe(null);
    expect(colorStyle({ color: '#surface+1x' })).toBe(null);
    expect(svgFillStyle({ svgFill: '#surface+1x' })).toBe(null);
  });
});

describe('fill diagnostics', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // `warnOnceDev` records a key even when it stays silent, so each test
    // starts from a clean slate.
    resetStyleWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
  });

  describe('in development', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    it('deprecates two colors separated by a space, keeping the layer', () => {
      expect(fillStyle({ fill: '#surface #dark.04' })).toEqual({
        'background-color': 'var(--surface-color)',
        '--tasty-second-fill-color':
          'color-mix(in oklab, var(--dark-color) 4%, transparent)',
        'background-image': LAYER,
      });

      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'fill="#surface #dark.04": two colors separated by a space are deprecated',
        ),
      );
      // The same two tokens joined with a plus paint the same thing.
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Join them with a plus instead: "#surface+#dark.04"',
        ),
      );
    });

    it('suggests the overlay alone when it has no opacity', () => {
      // `#surface+#accent` would only warn again; the overlay alone is the fix.
      fillStyle({ fill: '#surface #accent' });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('so use it alone: "#accent"'),
      );
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Join them with a plus'),
      );
    });

    it('suggests the base alone when the overlay is transparent', () => {
      fillStyle({ fill: '#surface #clear' });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('so use the first color alone: "#surface"'),
      );
    });

    it('suggests the base alone for an overlay faded to nothing', () => {
      fillStyle({ fill: '#surface #dark.0' });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('so use the first color alone: "#surface"'),
      );
    });

    it('tells a translucent overlay token to become opaque', () => {
      setGlobalPredefinedTokens({ '#overlay': '#dark.04' });

      try {
        fillStyle({ fill: '#surface #overlay' });
      } finally {
        resetGlobalPredefinedTokens();
      }

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '"#overlay" is translucent, which would leave a compound see-through',
        ),
      );
    });

    it('stays quiet for a compound color', () => {
      fillStyle({ fill: '#surface+#dark.04' });

      expect(warn).not.toHaveBeenCalled();
    });

    it('names `backgroundColor` when that is where the colors are', () => {
      fillStyle({ backgroundColor: '#surface #dark.04' });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('backgroundColor="#surface #dark.04"'),
      );
    });

    it.each([
      ['#dark.04, #surface', '"#dark.04"', 'layer it: "#surface+#dark.04"'],
      ['#surface, #dark.04', '"#dark.04"', 'layer it: "#surface+#dark.04"'],
      [
        '#dark.$hover, #surface',
        '"#dark.$hover"',
        'layer it: "#surface+#dark.$hover"',
      ],
      ['#surface, #clear', '"#clear"', 'use "#surface" alone'],
    ])('warns that %s mixes a translucent color by half', (fill, part, fix) => {
      fillStyle({ fill });

      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`${part} is translucent and has no percentage`),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(fix));
    });

    it.each([
      ['#dark 4%, #surface', '#surface+#dark.04'],
      ['#surface, #dark 4%', '#surface+#dark.04'],
      ['#dark 30%, #surface', '#surface+#dark.3'],
      ['#dark 4.5%, #surface.5', '#surface.5+#dark.045'],
      ['#accent 10%, #surface+#dark.04', '#surface+#dark.04+#accent.1'],
    ])('deprecates %s as the compound %s', (fill, compound) => {
      fillStyle({ fill });

      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `fill="${fill}": mixing colors with a comma is deprecated. Layer ` +
            `the colors instead: "${compound}" is the same color.`,
        ),
      );
    });

    it.each([
      '#dark, #surface',
      '#dark.5 20%, #surface',
      '#dark $hover-weight, #surface',
      '#dark ($hover * 100%), #surface',
      'rgb(0 0 0) 4%, #surface',
      '#dark 4%, ($base-color, #surface)',
      '#dark 100%, #surface',
      // A compound would leave the transparent layer out.
      '#clear 10%, #surface',
    ])('deprecates %s as `color-mix()` itself', (fill) => {
      fillStyle({ fill });

      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `Write the mix as color-mix() instead: "color-mix(in srgb, ${fill})" ` +
            `is the same color.`,
        ),
      );
    });

    it('names `backgroundColor` when it is the one mixing', () => {
      fillStyle({ backgroundColor: '#dark 4%, #surface' });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'backgroundColor="#dark 4%, #surface": mixing colors with a comma',
        ),
      );
    });

    it('mixes the first two colors of three and warns', () => {
      expect(fillStyle({ fill: '#a 10%, #b, #c' })).toEqual({
        'background-color':
          'color-mix(in srgb, var(--a-color) 10%, var(--b-color))',
      });
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '"#b+#a.1" is the same color. A mix takes two colors, so the extra ' +
            'ones are ignored.',
        ),
      );
    });
  });

  it('is silent outside development', () => {
    fillStyle({ fill: '#surface #dark.04' });
    fillStyle({ fill: '#dark.04, #surface' });
    fillStyle({ fill: '#a, #b, #c' });

    expect(warn).not.toHaveBeenCalled();
  });
});
