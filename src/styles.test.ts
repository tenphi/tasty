import { resetConfig } from './config';

import { borderStyle } from './styles/border';
import { colorStyle } from './styles/color';
import { createStyle } from './styles/createStyle';
import { fillStyle } from './styles/fill';
import { flowStyle } from './styles/flow';
import { gapStyle } from './styles/gap';
import { insetStyle } from './styles/inset';
import { marginStyle } from './styles/margin';
import { outlineStyle } from './styles/outline';
import { paddingStyle } from './styles/padding';
import { presetStyle } from './styles/preset';
import { radiusStyle } from './styles/radius';
import { shadowStyle } from './styles/shadow';

describe('Tasty style tests', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('should handle border styles', () => {
    expect(borderStyle({ border: '1px solid #000' })).toEqual({
      border: '1px solid var(--000-color, #000)',
    });
  });

  it('should handle color styles with fallbacks', () => {
    // Simple color variable
    expect(colorStyle({ color: 'var(--primary-color)' })).toEqual({
      color: 'var(--primary-color)',
      '--current-color': 'var(--primary-color)',
    });

    // Color with fallback chain
    expect(
      colorStyle({ color: 'var(--placeholder-color, var(--dark-04-color))' }),
    ).toEqual({
      color: 'var(--placeholder-color, var(--dark-04-color))',
      '--current-color': 'var(--placeholder-color, var(--dark-04-color))',
    });

    // Nested fallbacks
    expect(
      colorStyle({
        color:
          'var(--primary-color, var(--secondary-color, var(--tertiary-color)))',
      }),
    ).toEqual({
      color:
        'var(--primary-color, var(--secondary-color, var(--tertiary-color)))',
      '--current-color':
        'var(--primary-color, var(--secondary-color, var(--tertiary-color)))',
    });
  });

  describe('`--current-color` republishing', () => {
    it('does not republish `#current`, which reads the color it inherits', () => {
      // Republishing the keyword would let a descendant resolve it a second
      // time against its own color.
      expect(colorStyle({ color: '#current' })).toEqual({
        color: 'currentcolor',
      });
    });

    it('does not republish a bare `currentColor`', () => {
      // Republishing the keyword would let a descendant resolve it a second
      // time against its own color.
      expect(colorStyle({ color: true })).toEqual({ color: 'currentColor' });
    });

    it('does not republish a faded `#current`', () => {
      // The `color-mix()` composes against the inherited color; resolving it
      // again one level down would fade twice.
      expect(colorStyle({ color: '#current.4' })).toEqual({
        color: 'color-mix(in oklab, currentcolor 40%, transparent)',
      });
    });

    it('republishes a named token', () => {
      expect(colorStyle({ color: '#purple' })).toEqual({
        color: 'var(--purple-color)',
        '--current-color': 'var(--purple-color)',
      });
    });

    it('republishes a literal, so it displaces an ancestor token color', () => {
      // Without this, a descendant's `#current` would read the nearest *token*
      // color rather than this element's actual color.
      expect(colorStyle({ color: 'red' })).toEqual({
        color: 'red',
        '--current-color': 'red',
      });
    });

    it('republishes a keyword', () => {
      // `--current-color: inherit` takes the parent's published value, which is
      // what `color: inherit` does for the color itself.
      expect(colorStyle({ color: 'inherit' })).toEqual({
        color: 'inherit',
        '--current-color': 'inherit',
      });
    });

    it('republishes exactly one property alongside `color`', () => {
      expect(Object.keys(colorStyle({ color: '#purple' })!)).toEqual([
        'color',
        '--current-color',
      ]);
    });
  });

  it('should handle fill styles with fallbacks', () => {
    // Simple fill variable
    expect(fillStyle({ fill: 'var(--primary-color)' })).toEqual({
      'background-color': 'var(--primary-color)',
    });

    // Fill with fallback chain
    expect(
      fillStyle({ fill: 'var(--surface-color, var(--white-color))' }),
    ).toEqual({
      'background-color': 'var(--surface-color, var(--white-color))',
    });

    // Nested fallbacks
    expect(
      fillStyle({
        fill: 'var(--primary-color, var(--secondary-color, var(--tertiary-color)))',
      }),
    ).toEqual({
      'background-color':
        'var(--primary-color, var(--secondary-color, var(--tertiary-color)))',
    });
  });

  it('should handle dual-color fill styles', () => {
    // Two color tokens - second becomes background-image gradient via custom property
    expect(fillStyle({ fill: '#primary #secondary' })).toEqual({
      'background-color': 'var(--primary-color)',
      '--tasty-second-fill-color': 'var(--secondary-color)',
      'background-image':
        'linear-gradient(var(--tasty-second-fill-color), var(--tasty-second-fill-color))',
    });

    // Two colors with explicit backgroundImage - image on top, gradient below
    expect(
      fillStyle({
        fill: '#primary #secondary',
        backgroundImage: 'url(/image.png)',
      }),
    ).toEqual({
      'background-color': 'var(--primary-color)',
      '--tasty-second-fill-color': 'var(--secondary-color)',
      'background-image':
        'url(/image.png), linear-gradient(var(--tasty-second-fill-color), var(--tasty-second-fill-color))',
    });

    // Two colors with explicit image - image on top, gradient below
    expect(
      fillStyle({
        fill: '#primary #secondary',
        image: 'url(/image.png)',
      }),
    ).toEqual({
      'background-color': 'var(--primary-color)',
      '--tasty-second-fill-color': 'var(--secondary-color)',
      'background-image':
        'url(/image.png), linear-gradient(var(--tasty-second-fill-color), var(--tasty-second-fill-color))',
    });

    // Two colors with explicit background - background overrides everything
    expect(
      fillStyle({
        fill: '#primary #secondary',
        background: 'linear-gradient(to right, #red, #blue)',
      }),
    ).toEqual({
      background:
        'linear-gradient(to right, var(--red-color), var(--blue-color))',
    });
  });

  it('should handle outline styles', () => {
    expect(outlineStyle({ outline: '2px dashed #f00' })).toEqual({
      outline: '2px dashed var(--f00-color, #f00)',
    });
  });

  it('should handle padding styles', () => {
    expect(
      paddingStyle({
        padding: '10px',
      }),
    ).toEqual({
      padding: '10px',
    });
  });

  it('should handle margin styles', () => {
    expect(
      marginStyle({
        margin: '5px',
      }),
    ).toEqual({
      margin: '5px',
    });
  });

  it('should handle inset styles', () => {
    // Four-value shorthand
    expect(insetStyle({ inset: '0 10px 20px 30px' })).toEqual({
      inset: '0 10px 20px 30px',
    });

    // Single value (all sides)
    expect(insetStyle({ inset: '0' })).toEqual({
      inset: '0',
    });

    // Two values (vertical horizontal)
    expect(insetStyle({ inset: '10px 20px' })).toEqual({
      inset: '10px 20px',
    });

    // Numeric value
    expect(insetStyle({ inset: 0 })).toEqual({
      inset: '0px',
    });

    // Boolean true
    expect(insetStyle({ inset: true })).toEqual({
      inset: '0',
    });

    // Direction modifiers
    expect(insetStyle({ inset: 'top' })).toEqual({
      inset: '0 auto auto auto',
    });

    expect(insetStyle({ inset: 'top right' })).toEqual({
      inset: '0 0 auto auto',
    });

    expect(insetStyle({ inset: 'bottom left' })).toEqual({
      inset: 'auto auto 0 0',
    });

    expect(insetStyle({ inset: '2x bottom left' })).toEqual({
      inset: 'auto auto 16px 16px',
    });

    // A group that names directions takes one value, applied to every direction
    // it names. Extra values are ignored (dev warning).
    expect(insetStyle({ inset: 'right 1x top 0' })).toEqual({
      inset: '8px 8px auto auto',
    });

    expect(insetStyle({ inset: 'left 2x right 1x' })).toEqual({
      inset: 'auto 16px',
    });

    // Comma groups are the way to give each side its own value.
    expect(insetStyle({ inset: '1x right, 0 top' })).toEqual({
      inset: '0 8px auto auto',
    });

    expect(insetStyle({ inset: '2x left, 1x right' })).toEqual({
      inset: 'auto 8px auto 16px',
    });

    // Individual direction props - output individual CSS properties for proper cascade
    expect(insetStyle({ top: '10px' })).toEqual({
      top: '10px',
    });

    expect(insetStyle({ top: '10px', bottom: '20px' })).toEqual({
      top: '10px',
      bottom: '20px',
    });

    // All four directions as individual props
    expect(
      insetStyle({ top: '0', right: '0', bottom: '0', left: '0' }),
    ).toEqual({
      top: '0',
      right: '0',
      bottom: '0',
      left: '0',
    });

    // Individual prop with 'initial' (common pattern for conditional modifiers)
    expect(insetStyle({ top: 'initial' })).toEqual({
      top: 'initial',
    });

    // Individual physical props override inset inside the physical handler.
    expect(insetStyle({ inset: '0', top: '10px' })).toEqual({
      inset: '10px 0 0 0',
    });

    // null when no props
    expect(insetStyle({})).toBeNull();
  });

  it('should handle radius styles', () => {
    expect(radiusStyle({ radius: '50%' })).toEqual({
      'border-radius': '50%',
    });

    expect(radiusStyle({ radius: 'inherit' })).toEqual({
      'border-radius': 'inherit',
    });

    expect(radiusStyle({ radius: 'revert' })).toEqual({
      'border-radius': 'revert',
    });

    expect(radiusStyle({ radius: 'inherit right' })).toEqual({
      'border-top-right-radius': 'inherit',
      'border-bottom-right-radius': 'inherit',
    });

    expect(radiusStyle({ radius: 'inherit top right' })).toEqual({
      'border-top-left-radius': 'inherit',
      'border-top-right-radius': 'inherit',
      'border-bottom-right-radius': 'inherit',
    });
  });

  it('should handle preset styles', () => {
    expect(
      presetStyle({
        preset: 't3',
      }),
    ).toEqual({
      '--bold-font-weight':
        'var(--t3-bold-font-weight, var(--default-bold-font-weight))',
      '--icon-size': 'var(--t3-icon-size, var(--default-icon-size))',
      'font-size': 'var(--t3-font-size, var(--default-font-size))',
      'font-style': 'var(--t3-font-style, var(--default-font-style))',
      'font-weight': 'var(--t3-font-weight, var(--default-font-weight))',
      'letter-spacing':
        'var(--t3-letter-spacing, var(--default-letter-spacing))',
      'line-height': 'var(--t3-line-height, var(--default-line-height))',
      'font-family':
        'var(--t3-font-family, var(--default-font-family, var(--font-sans, var(--font-sans-fallback)))), var(--font-sans, var(--font-sans-fallback))',
      'text-transform':
        'var(--t3-text-transform, var(--default-text-transform))',
    });
  });

  it('should support slash-separated modifier: t3 / strong', () => {
    expect(
      presetStyle({
        preset: 't3 / strong',
      }),
    ).toEqual(
      expect.objectContaining({
        'font-weight': 'var(--bold-font-weight)',
        'font-size': 'var(--t3-font-size, var(--default-font-size))',
      }),
    );
  });

  it('should support bold as alias for strong via slash: t3 / bold', () => {
    expect(
      presetStyle({
        preset: 't3 / bold',
      }),
    ).toEqual(
      expect.objectContaining({
        'font-weight': 'var(--bold-font-weight)',
        'font-size': 'var(--t3-font-size, var(--default-font-size))',
      }),
    );
  });

  it('should support mod-only shorthand: preset="bold"', () => {
    const result = presetStyle({ preset: 'bold' });
    expect(result).toEqual(
      expect.objectContaining({
        'font-weight': 'var(--bold-font-weight)',
        'font-size': 'inherit',
      }),
    );
  });

  it('should support mod-only shorthand: preset="italic"', () => {
    const result = presetStyle({ preset: 'italic' });
    expect(result).toEqual(
      expect.objectContaining({
        'font-style': 'italic',
        'font-size': 'inherit',
      }),
    );
  });

  it('should support slash modifier: t3 / italic', () => {
    expect(
      presetStyle({
        preset: 't3 / italic',
      }),
    ).toEqual(
      expect.objectContaining({
        'font-style': 'italic',
        'font-size': 'var(--t3-font-size, var(--default-font-size))',
      }),
    );
  });

  it('should support multiple modifiers: t3 / strong italic', () => {
    expect(
      presetStyle({
        preset: 't3 / strong italic',
      }),
    ).toEqual(
      expect.objectContaining({
        'font-weight': 'var(--bold-font-weight)',
        'font-style': 'italic',
        'font-size': 'var(--t3-font-size, var(--default-font-size))',
      }),
    );
  });

  it('should support multiple modifiers: t3 / strong tight', () => {
    expect(
      presetStyle({
        preset: 't3 / strong tight',
      }),
    ).toEqual(
      expect.objectContaining({
        'font-weight': 'var(--bold-font-weight)',
        'line-height': '1em',
        'font-size': 'var(--t3-font-size, var(--default-font-size))',
      }),
    );
  });

  it('should support multiple modifiers: t3 / italic tight', () => {
    expect(
      presetStyle({
        preset: 't3 / italic tight',
      }),
    ).toEqual(
      expect.objectContaining({
        'font-style': 'italic',
        'line-height': '1em',
        'font-size': 'var(--t3-font-size, var(--default-font-size))',
      }),
    );
  });

  it('should support mod-only shorthand with multiple modifiers: bold italic', () => {
    const result = presetStyle({ preset: 'bold italic' });
    expect(result).toEqual(
      expect.objectContaining({
        'font-weight': 'var(--bold-font-weight)',
        'font-style': 'italic',
        'font-size': 'inherit',
      }),
    );
  });

  it('should support normal modifier: t3 / normal', () => {
    expect(
      presetStyle({
        preset: 't3 / normal',
      }),
    ).toEqual(
      expect.objectContaining({
        'line-height': 'normal',
        'font-size': 'var(--t3-font-size, var(--default-font-size))',
      }),
    );
  });

  it('normal modifier should override tight modifier', () => {
    expect(
      presetStyle({
        preset: 't3 / tight normal',
      }),
    ).toEqual(
      expect.objectContaining({
        'line-height': 'normal',
      }),
    );
  });

  it('should handle flow styles', () => {
    expect(flowStyle({ flow: 'row nowrap' })).toEqual(null);
  });

  it('should handle gap styles', () => {
    expect(
      gapStyle({
        gap: '1rem',
      }),
    ).toEqual({
      $: '& > *:not(:last-child)',
      'margin-bottom': '1rem',
    });
  });

  describe('Color token values', () => {
    // Every outcome of `createStyle`'s color branch. A `#name` key declares one
    // custom property, `--name-color`, and what lands in it depends only on
    // whether the value names a token and whether the engine can convert it.
    it('keeps a hex literal as authored', () => {
      const handler = createStyle('#brand');

      expect(handler({ '#brand': '#f80' })).toEqual({
        '--brand-color': '#f80',
      });
    });

    it('keeps a bare CSS color name as authored, without warning', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });
      const handler = createStyle('#brand');

      // Named colors starting with r/h/l/o/v/c/t used to miss `parseColor`'s
      // first-character dispatch and warn; every letter resolves now.
      for (const name of [
        'red',
        'hotpink',
        'lime',
        'orange',
        'violet',
        'coral',
        'teal',
        'blue',
      ]) {
        expect(handler({ '#brand': name })).toEqual({ '--brand-color': name });
      }
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    });

    it('resolves a bare token reference through its own variable', () => {
      const handler = createStyle('#brand');

      expect(handler({ '#brand': '#purple' })).toEqual({
        '--brand-color': 'var(--purple-color)',
      });
    });

    it('keeps a native color function as authored', () => {
      const handler = createStyle('#brand');

      expect(handler({ '#brand': 'hsl(120 100% 50%)' })).toEqual({
        '--brand-color': 'hsl(120 100% 50%)',
      });
    });

    it('keeps a color it cannot convert as authored', () => {
      const handler = createStyle('#brand');

      expect(handler({ '#brand': 'color(display-p3 1 0.5 0)' })).toEqual({
        '--brand-color': 'color(display-p3 1 0.5 0)',
      });
    });

    it('declares an empty value for something that is not a color', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });
      const handler = createStyle('#brand');

      expect(handler({ '#brand': 'not-a-color' })).toEqual({
        '--brand-color': '',
      });

      warn.mockRestore();
    });

    it('resolves every shape a color value can take', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });
      const handler = createStyle('#brand');

      // Nothing is rewritten, so each of these is its own parsed form.
      expect(
        Object.fromEntries(
          [
            '#f80',
            '#ff8040',
            '#purple',
            'red',
            'rgb(0 0 0)',
            'var(--purple-color)',
            'transparent',
            'currentcolor',
            '(#purple, #red)',
            '#purple.5',
            'color-mix(in oklab, #purple 50%, #red)',
          ].map((v) => [v, handler({ '#brand': v })!['--brand-color']]),
        ),
      ).toEqual({
        '#f80': '#f80',
        '#ff8040': '#ff8040',
        '#purple': 'var(--purple-color)',
        red: 'red',
        'rgb(0 0 0)': 'rgb(0 0 0)',
        'var(--purple-color)': 'var(--purple-color)',
        transparent: 'transparent',
        currentcolor: 'currentcolor',
        '(#purple, #red)': 'var(--purple-color, var(--red-color))',
        '#purple.5': 'oklch(from var(--purple-color) l c h / .5)',
        'color-mix(in oklab, #purple 50%, #red)':
          'color-mix(in oklab,var(--purple-color) 50%,var(--red-color))',
      });
      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    });

    it('emits no channel-components companion for any of them', () => {
      const handler = createStyle('#brand');

      for (const value of [
        '#f80',
        '#purple',
        'hsl(120 100% 50%)',
        'color-mix(in oklab, #purple 50%, #red)',
        '(#primary, #fallback)',
        '#purple.5',
      ]) {
        expect(Object.keys(handler({ '#brand': value })!)).toEqual([
          '--brand-color',
        ]);
      }
    });
  });

  describe('Color fallback syntax', () => {
    it('should keep the fallback chain for a color fallback', () => {
      const handler = createStyle('#local-placeholder');
      const result = handler({
        '#local-placeholder': '(#placeholder, #dark-04)',
      });

      expect(result).toEqual({
        '--local-placeholder-color':
          'var(--placeholder-color, var(--dark-04-color))',
      });
    });

    it('should handle nested color fallbacks', () => {
      const handler = createStyle('#theme');
      const result = handler({
        '#theme': '(#primary, (#secondary, #tertiary))',
      });

      expect(result).toEqual({
        '--theme-color':
          'var(--primary-color, var(--secondary-color, var(--tertiary-color)))',
      });
    });

    it('should handle color fallback with hex literal', () => {
      const handler = createStyle('#custom');
      const result = handler({
        '#custom': '(#primary, #fff)',
      });

      expect(result).toEqual({
        '--custom-color': 'var(--primary-color, var(--fff-color, #fff))',
      });
    });

    it('should handle color fallback with CSS function', () => {
      const handler = createStyle('#background');
      const result = handler({
        '#background': '(#theme, rgb(255 0 0))',
      });

      expect(result).toEqual({
        '--background-color': 'var(--theme-color, rgb(255 0 0))',
      });
    });

    it('should handle custom property with -color suffix and fallback', () => {
      const handler = createStyle('$local-placeholder-color');
      const result = handler({
        '$local-placeholder-color': '($placeholder-color, $dark-04-color)',
      });

      expect(result).toEqual({
        '--local-placeholder-color':
          'var(--placeholder-color, var(--dark-04-color))',
      });
    });
  });

  describe('Modern color functions', () => {
    const MIX = 'color-mix(in oklab, #purple 50%, #red)';
    const MIX_CSS =
      'color-mix(in oklab,var(--purple-color) 50%,var(--red-color))';
    const THEME = 'light-dark(#light, #dark)';
    const THEME_CSS = 'light-dark(var(--light-color),var(--dark-color))';

    it('fills with color-mix()', () => {
      expect(fillStyle({ fill: MIX })).toEqual({
        'background-color': MIX_CSS,
      });
    });

    it('fills with light-dark()', () => {
      expect(fillStyle({ fill: THEME })).toEqual({
        'background-color': THEME_CSS,
      });
    });

    it('fills with contrast-color()', () => {
      expect(fillStyle({ fill: 'contrast-color(#purple)' })).toEqual({
        'background-color': 'contrast-color(var(--purple-color))',
      });
    });

    it('takes a color function as the border color', () => {
      expect(borderStyle({ border: `2bw solid ${THEME}` })).toEqual({
        border: `2px solid ${THEME_CSS}`,
      });
    });

    it('takes a color function as the outline color', () => {
      expect(outlineStyle({ outline: `1ow dashed ${MIX}` })).toEqual({
        outline: `3px dashed ${MIX_CSS}`,
      });
    });

    it('keeps a color function whole in a shadow layer', () => {
      // The commas belong to the color function, not to the shadow layer list.
      expect(shadowStyle({ shadow: `0 0 4px ${MIX}` })).toEqual({
        'box-shadow': ` 0 0 4px ${MIX_CSS}`,
      });
    });

    it('still splits shadow layers around a color function', () => {
      expect(
        shadowStyle({ shadow: `0 0 4px ${MIX}, inset 0 1px 2px #dark` }),
      ).toEqual({
        'box-shadow': ` 0 0 4px ${MIX_CSS},inset 0 1px 2px var(--dark-color)`,
      });
    });

    it('resolves the tokens inside a color function for `color`', () => {
      expect(colorStyle({ color: THEME })).toEqual({
        color: THEME_CSS,
        '--current-color': THEME_CSS,
      });
    });

    it('emits a derived color function as the token value', () => {
      const handler = createStyle('#brand');

      expect(handler({ '#brand': MIX })).toEqual({
        '--brand-color': MIX_CSS,
      });
    });

    it('keeps a faded token faded in `--current-color`', () => {
      expect(colorStyle({ color: '#purple.5' })).toEqual({
        color: 'oklch(from var(--purple-color) l c h / .5)',
        '--current-color': 'oklch(from var(--purple-color) l c h / .5)',
      });
    });

    it('defines a token from a faded token', () => {
      const handler = createStyle('#brand');

      expect(handler({ '#brand': '#purple.5' })).toEqual({
        '--brand-color': 'oklch(from var(--purple-color) l c h / .5)',
      });
    });

    it('keeps a light-dark() of lengths out of the color slot', () => {
      expect(paddingStyle({ padding: 'light-dark(1x, 2x)' })).toEqual({
        padding: 'light-dark(8px,16px)',
      });
    });
  });
});
