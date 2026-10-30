/**
 * Proof that the CSS Tasty generates actually *applies*.
 *
 * Every other suite asserts on CSS text — the rules Tasty handed to the engine.
 * This one asserts on `getComputedStyle`, which is the engine reporting what it
 * parsed, cascaded, and resolved. It is the only place that can catch a rule
 * that is well-formed as a string but inert in a browser: an invalid
 * declaration the engine dropped, specificity that loses to a competing rule,
 * a token that resolves to nothing, an at-rule that never matches.
 *
 * None of this is expressible under jsdom or happy-dom, which do not implement
 * `@property`, `@container`, or a real cascade.
 */
import { render } from '@testing-library/react';
import { page } from 'vitest/browser';

import { computeStyles } from './compute-styles';
import { configure, resetConfig } from './config';
import { destroy } from './injector';
import { tasty } from './tasty';

/** Computed value of `property` on the element rendered for `qa`. */
function computed(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property);
}

describe('generated CSS applies in the browser', () => {
  afterEach(() => {
    resetConfig();
  });

  describe('values reach the element', () => {
    it('resolves the built-in `x` unit to real pixels', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(<Box styles={{ padding: '2x' }} />).getByTestId('Box');

      // 1x is 8px, so 2x is 16px — computed, not just emitted.
      expect(computed(el, 'padding')).toBe('16px');
    });

    it('resolves auto-calc expressions', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(<Box styles={{ width: '(2x + 4px)' }} />).getByTestId(
        'Box',
      );

      expect(computed(el, 'width')).toBe('20px');
    });

    it('resolves a color token through its @property initial value', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(<Box styles={{ fill: '#white' }} />).getByTestId('Box');

      // `#white` becomes `var(--white-color)`, and `--white-color` only has a
      // value because Tasty registered it with `@property { initial-value }`.
      expect(computed(el, 'background-color')).toBe('rgb(255, 255, 255)');
    });

    it('applies token opacity as a real alpha channel', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(<Box styles={{ fill: '#black.5' }} />).getByTestId(
        'Box',
      );

      // `#black.5` becomes `color-mix(in oklab, var(--black-color) 50%,
      // transparent)`. The mix is premultiplied, so the channels come through
      // untouched and this is black at half alpha.
      expect(computed(el, 'background-color')).toBe('oklab(0 0 0 / 0.5)');
    });

    it('fades a colour variable Tasty never registered', () => {
      // The token lives only in hand-authored CSS, with no `@property` behind
      // it. Applying the alpha to the colour itself is what makes this resolve.
      const sheet = document.createElement('style');
      sheet.textContent = ':root { --ink-color: rgb(0 0 255); }';
      document.head.append(sheet);

      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(<Box styles={{ fill: '#ink.5' }} />).getByTestId('Box');

      // Compared against the same fade written by hand rather than a literal, so
      // the assertion is about the colour and not the engine's channel precision.
      const control = document.createElement('div');
      control.style.backgroundColor =
        'color-mix(in oklab, rgb(0 0 255) 50%, transparent)';
      document.body.append(control);

      expect(computed(el, 'background-color')).toBe(
        computed(control, 'background-color'),
      );
      expect(computed(el, 'background-color')).toMatch(/\/ 0\.5\)$/);

      control.remove();
      sheet.remove();
    });

    it('composes with an alpha the colour already carries', () => {
      // `color-mix()` against `transparent` multiplies the two alphas, so a
      // token holding `rgb(255 0 0 / .8)` faded to `.5` comes out at `.4`. The
      // channels are untouched: it is still red.
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ '#half': 'rgb(255 0 0 / .8)', fill: '#half.5' }} />,
      ).getByTestId('Box');

      // The same as opaque red at 40%: `.8` faded by `.5`, channels untouched.
      const control = document.createElement('div');
      control.style.backgroundColor =
        'color-mix(in oklab, rgb(255 0 0) 40%, transparent)';
      document.body.append(control);

      expect(computed(el, 'background-color')).toBe(
        computed(control, 'background-color'),
      );
      expect(computed(el, 'background-color')).toMatch(/\/ 0\.4\)$/);

      control.remove();
    });

    it('takes an opacity variable that holds a number', () => {
      // A mix percentage cannot be a `<number>`, so `#black.$fade` scales the
      // property by `100%`: it has to hold a unitless number.
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box
          styles={{ '$fade-opacity': '0.5', fill: '#black.$fade-opacity' }}
        />,
      ).getByTestId('Box');

      expect(computed(el, 'background-color')).toBe('oklab(0 0 0 / 0.5)');
    });

    it('composes a nested `#current` fade instead of replacing it', () => {
      // A ramp built on `#current` depends on this: a label faded to `.4` and a
      // fill authored at `.18` under it land at `.072`, which is what the fill's
      // alpha was chosen against. Replacing would make it 2.5x more opaque.
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const Inner = tasty({ qa: 'Inner', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ color: '#current.4' }}>
          <Inner styles={{ fill: '#current.18' }} />
        </Box>,
      ).getByTestId('Inner');

      expect(computed(el, 'background-color')).toContain('/ 0.072)');
    });

    it('composes a nested `#current` fade instead of replacing it', () => {
      // A ramp built on `#current` depends on this: a label faded to `.4` with a
      // fill authored at `.18` under it lands at `.072`, which is the value that
      // alpha was chosen against. Replacing would make it 2.5x more opaque.
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const Inner = tasty({ qa: 'Inner', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ color: '#current.4' }}>
          <Inner styles={{ fill: '#current.18' }} />
        </Box>,
      ).getByTestId('Inner');

      expect(computed(el, 'background-color')).toContain('/ 0.072)');
    });

    it('fades without clamping a colour to sRGB', () => {
      // The mix is `in oklab`, which is unbounded, so a display-p3 red keeps a
      // chroma sRGB cannot hold. A mix in a gamut-limited space would clamp it.
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const p3 = render(
        <Box
          styles={{ '#wide': 'color(display-p3 1 0.2 0)', fill: '#wide.5' }}
        />,
      ).getByTestId('Box');
      const srgb = render(
        <Box styles={{ '#narrow': 'rgb(255 0 0)', fill: '#narrow.5' }} />,
      ).getAllByTestId('Box')[1];

      const chroma = (el: Element) => {
        const [, a, b] = computed(el, 'background-color')
          .match(/^oklab\(([^ ]+) ([^ ]+) ([^ ]+)/)!
          .slice(1)
          .map(parseFloat);

        return Math.hypot(a, b);
      };

      expect(chroma(p3)).toBeGreaterThan(chroma(srgb));
      expect(computed(p3, 'background-color')).toContain('/ 0.5)');
    });

    describe('fades an opaque colour exactly as relative color syntax did', () => {
      // `color-mix()` replaced `oklch(from <color> l c h / <alpha>)` because it
      // is Baseline widely available. For an opaque colour the two must resolve
      // to the same colour; both are read back in oklab and compared channel by
      // channel.
      const oklab = (value: string) => {
        const probe = document.body.appendChild(document.createElement('div'));
        probe.style.backgroundColor = `color-mix(in oklab, ${value} 100%, transparent)`;
        const channels = computed(probe, 'background-color')
          .match(/^oklab\(([^ ]+) ([^ ]+) ([^ ]+)(?: \/ ([^)]+))?\)$/)!
          .slice(1)
          .map((channel) => (channel === undefined ? 1 : parseFloat(channel)));
        probe.remove();

        return channels;
      };

      it.each([
        ['#ff8800', '.5', '.5'],
        ['rebeccapurple', '.05', '.05'],
        ['hsl(220 90% 50%)', '.9', '.9'],
        ['color(display-p3 1 0.2 0)', '.5', '.5'],
        ['oklch(0.7 0.2 140)', '.25', '.25'],
        ['light-dark(#fff, #000)', '.3', '.3'],
        ['color-mix(in srgb, red 30%, blue)', '.75', '.75'],
      ])('%s at %s', (color, suffix, alpha) => {
        const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
        const el = render(
          <Box styles={{ '#probe': color, fill: `#probe${suffix}` }}>
            <div
              data-qa="Relative"
              style={{
                backgroundColor: `oklch(from var(--probe-color) l c h / ${alpha})`,
              }}
            />
          </Box>,
        ).getByTestId('Box');

        // Both forms read the same token. `--probe-color` is registered as a
        // `<color>`, which stores a legacy color such as `hsl()` as 8-bit
        // `rgb()`, so comparing against the authored literal instead would
        // measure that rounding rather than the fade.
        const mixed = oklab(computed(el, 'background-color'));
        const relative = oklab(
          computed(
            el.querySelector('[data-qa="Relative"]')!,
            'background-color',
          ),
        );

        // Within .00005: what is left is float noise from serializing oklch,
        // where a visible difference in oklab is around .02.
        mixed.forEach((channel, i) => {
          expect(channel).toBeCloseTo(relative[i], 4);
        });
      });
    });

    it('applies a color-mix() as the background colour', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ fill: 'color-mix(in srgb, #black 50%, #white)' }} />,
      ).getByTestId('Box');

      // Half black, half white. Only reaches the engine intact if the parser
      // filed the whole call in the colour slot — commas and all.
      expect(computed(el, 'background-color')).toBe('color(srgb 0.5 0.5 0.5)');
    });

    it('applies opacity to a derived-colour token', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box
          styles={{
            '#brand': 'color-mix(in srgb, #black 50%, #white)',
            fill: '#brand.5',
          }}
        />,
      ).getByTestId('Box');

      // Opacity applies to the token's colour directly, so a colour the engine
      // cannot decompose into channels at build time needs nothing extra to
      // fade — the browser mixes whatever it resolves to.
      expect(computed(el, '--brand-color')).toBe('color(srgb 0.5 0.5 0.5)');

      // Mid-grey at half alpha. Channel precision is up to the engine, so only
      // the lightness band and the alpha are asserted.
      const background = computed(el, 'background-color');
      expect(background).toMatch(/^oklab\(0\.59\d+ /);
      expect(background).toMatch(/\/ 0\.5\)$/);
    });

    it('registers design tokens as inherited custom properties', () => {
      render(<div />);

      // `$gap` is declared `syntax: '<length>'; inherits: true` with an `8px`
      // initial value, the `x` unit's default. An engine without `@property`
      // reports an empty string.
      expect(computed(document.documentElement, '--gap')).toBe('8px');
    });

    it('applies styles injected through the CSSOM rather than as text', () => {
      configure({ forceTextInjection: false });

      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(<Box styles={{ padding: '3x' }} />).getByTestId('Box');

      expect(computed(el, 'padding')).toBe('24px');
    });
  });

  // The colors as tokens of the element itself, so nothing else can change
  // what they resolve to.
  const MIX_TOKENS = {
    '#dark': 'rgb(20 30 40)',
    '#surface': 'rgb(250 250 250)',
    '#accent': 'rgb(80 60 200)',
  };
  const DARK = [20, 30, 40];
  const SURFACE = [250, 250, 250];
  const ACCENT = [80, 60, 200];

  /** Channels of a computed `color(srgb r g b)`, scaled to 0–255. */
  function srgb(value: string): number[] {
    const match = value.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)$/);
    if (!match) throw new Error(`not an opaque sRGB color: ${value}`);
    return match.slice(1).map((channel) => Number(channel) * 255);
  }

  /** `color` drawn at `alpha` over the opaque `base`: what a layer paints. */
  function over(color: number[], alpha: number, base: number[]): number[] {
    return color.map((channel, i) => alpha * channel + (1 - alpha) * base[i]);
  }

  /** Channels and alpha of a computed `color(srgb r g b / a)`. */
  function srgba(value: string): number[] {
    const match = value.match(
      /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/,
    );
    if (!match) throw new Error(`not an sRGB color: ${value}`);
    return [
      ...match.slice(1, 4).map((channel) => Number(channel) * 255),
      Number(match[4] ?? 1),
    ];
  }

  function expectColor(actual: number[], expected: number[]) {
    actual.forEach((channel, i) => expect(channel).toBeCloseTo(expected[i], 3));
  }

  describe('a comma-mixed fill', () => {
    it('paints what the overlay layer painted, as one background color', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ ...MIX_TOKENS, fill: '#dark 4%, #surface' }} />,
      ).getByTestId('Box');

      // `'#surface #dark.04'` drew `#dark` at 4% over `#surface`.
      expectColor(
        srgb(computed(el, 'background-color')),
        over(DARK, 0.04, SURFACE),
      );
      expect(computed(el, 'background-image')).toBe('none');
    });

    it('takes the weight from a token', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box
          styles={{
            ...MIX_TOKENS,
            '$overlay-weight': '12%',
            fill: '#dark $overlay-weight, #surface',
          }}
        />,
      ).getByTestId('Box');

      expectColor(
        srgb(computed(el, 'background-color')),
        over(DARK, 0.12, SURFACE),
      );
    });

    // The rewrites the deprecation warning suggests.
    it.each([
      ['#dark 4%, #surface', '#surface+#dark.04'],
      ['#surface, #dark 4%', '#surface+#dark.04'],
      ['#dark 4.5%, #surface.5', '#surface.5+#dark.045'],
      ['#accent 10%, #surface+#dark.04', '#surface+#dark.04+#accent.1'],
      ['#dark, #surface', 'color-mix(in srgb, #dark, #surface)'],
      [
        '#dark $overlay-weight, #surface',
        'color-mix(in srgb, #dark $overlay-weight, #surface)',
      ],
    ])('paints %s as %s does', (mix, rewrite) => {
      const Box = tasty({ styles: { display: 'block' } });
      const tokens = { ...MIX_TOKENS, '$overlay-weight': '12%' };
      const { getByTestId } = render(
        <>
          <Box qa="Mix" styles={{ ...tokens, fill: mix }} />
          <Box qa="Rewrite" styles={{ ...tokens, fill: rewrite }} />
        </>,
      );
      const [mixed, rewritten] = ['Mix', 'Rewrite'].map((qa) =>
        srgba(computed(getByTestId(qa), 'background-color')),
      );

      expectColor(rewritten, mixed);
    });
  });

  describe('a compound color', () => {
    it('paints each layer over the base, as one background color', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ ...MIX_TOKENS, fill: '#surface+#accent.1+#dark.04' }} />,
      ).getByTestId('Box');

      expectColor(
        srgb(computed(el, 'background-color')),
        over(DARK, 0.04, over(ACCENT, 0.1, SURFACE)),
      );
      expect(computed(el, 'background-image')).toBe('none');
    });

    it('is a color in any color slot', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box
          styles={{
            ...MIX_TOKENS,
            color: '#surface+#dark.5',
            border: '1bw solid #surface+#accent.25',
          }}
        />,
      ).getByTestId('Box');

      expectColor(srgb(computed(el, 'color')), over(DARK, 0.5, SURFACE));
      expectColor(
        srgb(computed(el, 'border-top-color')),
        over(ACCENT, 0.25, SURFACE),
      );
    });

    it('layers over the inherited color with `#current`', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box
          styles={{
            ...MIX_TOKENS,
            color: '#surface',
            fill: '#current+#dark.2',
          }}
        />,
      ).getByTestId('Box');

      expectColor(
        srgb(computed(el, 'background-color')),
        over(DARK, 0.2, SURFACE),
      );
    });

    it('composites over a translucent base exactly', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ ...MIX_TOKENS, fill: '#surface.5+#dark.04' }} />,
      ).getByTestId('Box');

      // `#dark` at 4% source-over a half-transparent `#surface`.
      const alpha = 0.04 + 0.5 * 0.96;
      const premultiplied = DARK.map(
        (channel, i) => 0.04 * channel + 0.96 * 0.5 * SURFACE[i],
      );
      const [r, g, b, a] = srgba(computed(el, 'background-color'));

      expect(a).toBeCloseTo(alpha, 3);
      expectColor(
        [r, g, b],
        premultiplied.map((channel) => channel / alpha),
      );
    });

    it('defines a token, and colors a shadow and an outline', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box
          styles={{
            ...MIX_TOKENS,
            '#hover': '#surface+#dark.5',
            fill: '#hover',
            shadow: '0 0 1x #surface+#accent.5',
            outline: '1bw #surface+#accent.25',
          }}
        />,
      ).getByTestId('Box');

      expectColor(
        srgb(computed(el, 'background-color')),
        over(DARK, 0.5, SURFACE),
      );
      expectColor(
        srgb(computed(el, 'box-shadow').replace(/\).*$/, ')')),
        over(ACCENT, 0.5, SURFACE),
      );
      expectColor(
        srgb(computed(el, 'outline-color')),
        over(ACCENT, 0.25, SURFACE),
      );
    });

    it('is see-through when a layer token is transparent at runtime', () => {
      // Tasty cannot see that `#overlay` holds `transparent`, and the
      // premultiplied mix lowers the alpha of the whole color by the layer's
      // opacity. Layer tokens have to be opaque.
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box
          styles={{
            ...MIX_TOKENS,
            '#overlay': '#clear',
            fill: '#surface+#overlay.04',
          }}
        />,
      ).getByTestId('Box');

      expect(srgba(computed(el, 'background-color'))[3]).toBeCloseTo(0.96, 3);
    });
  });

  describe('cascade', () => {
    it('wins against an equally specific rule that comes later', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(<Box styles={{ padding: '2x' }} />).getByTestId('Box');

      // Appended *after* Tasty injected its own rule, so source order favours
      // the competitor and only the doubled `.tX.tX` selector can win.
      const competitor = document.createElement('style');
      competitor.textContent = `.${el.className.split(' ')[0]} { padding: 99px; }`;
      document.head.appendChild(competitor);

      try {
        expect(computed(el, 'padding')).toBe('16px');
      } finally {
        competitor.remove();
      }
    });

    it('lets a later inline style prop override the class', () => {
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ padding: '2x' }} style={{ padding: '5px' }} />,
      ).getByTestId('Box');

      expect(computed(el, 'padding')).toBe('5px');
    });
  });

  describe('state maps switch computed values', () => {
    const Box = tasty({
      qa: 'Box',
      styles: {
        display: 'block',
        padding: { '': '1x', special: '3x' },
      },
    });

    it('uses the default branch when the mod is absent', () => {
      const el = render(<Box />).getByTestId('Box');

      expect(computed(el, 'padding')).toBe('8px');
    });

    it('uses the mod branch when the mod is present', () => {
      const el = render(<Box mods={{ special: true }} />).getByTestId('Box');

      expect(el).toHaveAttribute('data-special');
      expect(computed(el, 'padding')).toBe('24px');
    });

    it('switches back when the mod is removed', () => {
      const { rerender, getByTestId } = render(
        <Box mods={{ special: true }} />,
      );

      expect(computed(getByTestId('Box'), 'padding')).toBe('24px');

      rerender(<Box mods={{ special: false }} />);

      expect(computed(getByTestId('Box'), 'padding')).toBe('8px');
    });
  });

  // Later keys win. `src/pipeline/state-priority.test.ts` checks this
  // exhaustively; these pin the two reported regressions at component level.
  describe('state maps resolve by key order', () => {
    it('lets a later key equal to the default outrank an earlier key', () => {
      // `disabled` has the default's value; it used to be folded into `''`
      // once the `&` key was present, losing its priority over `checked`.
      const Box = tasty({
        qa: 'Box',
        styles: {
          display: 'block',
          padding: {
            '': '1x',
            checked: '2x',
            'invalid & checked': '3x',
            disabled: '1x',
          },
        },
      });

      const el = render(
        <Box mods={{ checked: true, disabled: true }} />,
      ).getByTestId('Box');

      expect(computed(el, 'padding')).toBe('8px');
    });

    it('keeps components whose maps differ only in key order apart', () => {
      const Base = tasty({ styles: { display: 'block', padding: '1x' } });
      const CheckedWins = tasty(Base, {
        qa: 'CheckedWins',
        styles: { padding: { '': '1x', disabled: '3x', checked: '2x' } },
      });
      const DisabledWins = tasty(Base, {
        qa: 'DisabledWins',
        styles: { padding: { '': '1x', checked: '2x', disabled: '3x' } },
      });

      const mods = { checked: true, disabled: true };
      const { getByTestId } = render(
        <>
          <CheckedWins mods={mods} />
          <DisabledWins mods={mods} />
        </>,
      );

      expect(computed(getByTestId('CheckedWins'), 'padding')).toBe('16px');
      expect(computed(getByTestId('DisabledWins'), 'padding')).toBe('24px');
    });

    it('matches a single-letter modifier only when it is set', () => {
      // A one-letter key used to parse as a state that always applies.
      const Box = tasty({
        qa: 'Box',
        styles: { display: 'block', padding: { '': '1x', x: '2x' } },
      });

      const { getAllByTestId } = render(
        <>
          <Box />
          <Box mods={{ x: true }} />
        </>,
      );
      const [plain, withX] = getAllByTestId('Box');

      expect(computed(plain, 'padding')).toBe('8px');
      expect(computed(withX, 'padding')).toBe('16px');
    });
  });

  describe('sub-elements', () => {
    it('styles a descendant marked with data-element', () => {
      const Card = tasty({
        qa: 'Card',
        styles: {
          display: 'block',
          Title: { padding: '2x', display: 'block' },
        },
      });

      const { getByTestId } = render(
        <Card>
          <span data-element="Title" data-qa="Title">
            Title
          </span>
        </Card>,
      );

      expect(computed(getByTestId('Title'), 'padding')).toBe('16px');
    });

    it('leaves a descendant without the marker alone', () => {
      const Card = tasty({
        qa: 'Card',
        styles: {
          display: 'block',
          Title: { padding: '2x', display: 'block' },
        },
      });

      const { getByTestId } = render(
        <Card>
          <span data-qa="Plain">Plain</span>
        </Card>,
      );

      expect(computed(getByTestId('Plain'), 'padding')).toBe('0px');
    });
  });

  describe('conditional at-rules actually match', () => {
    it('applies the branch whose container query matches', () => {
      const Wrapper = tasty({
        qa: 'Wrapper',
        styles: { display: 'block', containerType: 'inline-size' },
      });
      const Child = tasty({
        qa: 'Child',
        styles: {
          display: 'block',
          padding: { '': '4x', '@(w < 300px)': '1x' },
        },
      });

      const { getByTestId } = render(
        <Wrapper styles={{ width: '200px' }}>
          <Child />
        </Wrapper>,
      );

      // The container is 200px wide, so the `< 300px` branch is the live one.
      expect(computed(getByTestId('Child'), 'padding')).toBe('8px');
    });

    it('applies the other branch when the container is wider', () => {
      const Wrapper = tasty({
        qa: 'Wrapper',
        styles: { display: 'block', containerType: 'inline-size' },
      });
      const Child = tasty({
        qa: 'Child',
        styles: {
          display: 'block',
          padding: { '': '4x', '@(w < 300px)': '1x' },
        },
      });

      const { getByTestId } = render(
        <Wrapper styles={{ width: '600px' }}>
          <Child />
        </Wrapper>,
      );

      expect(computed(getByTestId('Child'), 'padding')).toBe('32px');
    });

    it.each([
      ['400px', '8px'],
      ['100px', '32px'],
    ])(
      'applies an aspect-ratio container query to a %s-wide, 200px-tall container',
      (width, padding) => {
        const Wrapper = tasty({
          qa: 'Wrapper',
          styles: { display: 'block', containerType: 'size', height: '200px' },
        });
        const Child = tasty({
          qa: 'Child',
          styles: {
            display: 'block',
            padding: { '': '4x', '@(aspect-ratio > 1)': '1x' },
          },
        });

        const { getByTestId } = render(
          <Wrapper styles={{ width }}>
            <Child />
          </Wrapper>,
        );

        expect(computed(getByTestId('Child'), 'padding')).toBe(padding);
      },
    );

    it('applies the branch whose media query matches the viewport', async () => {
      const Box = tasty({
        qa: 'Box',
        styles: {
          display: 'block',
          padding: { '': '4x', '@media(w <= 500px)': '1x' },
        },
      });

      const { getByTestId } = render(<Box />);

      await page.viewport(400, 600);
      expect(computed(getByTestId('Box'), 'padding')).toBe('8px');

      await page.viewport(900, 600);
      expect(computed(getByTestId('Box'), 'padding')).toBe('32px');
    });

    it('leaves em and px bounds for the browser to compare', async () => {
      const Box = tasty({
        qa: 'Box',
        styles: {
          display: 'block',
          padding: {
            '': '4x',
            '@media(w < 40em)': '2x',
            '@media(w < 600px)': '1x',
          },
        },
      });

      const { getByTestId } = render(<Box />);

      // 40em is 640px at the default font size, so 620px is only `w < 40em`.
      await page.viewport(620, 600);
      expect(computed(getByTestId('Box'), 'padding')).toBe('16px');

      await page.viewport(500, 600);
      expect(computed(getByTestId('Box'), 'padding')).toBe('8px');

      await page.viewport(900, 600);
      expect(computed(getByTestId('Box'), 'padding')).toBe('32px');
    });

    // `x` here is CSS's resolution unit (an alias of `dppx`), not Tasty's
    // spacing unit. Rewriting it to a length makes the query invalid, so it
    // never matches.
    it.each(['@media(min-resolution: 1x)', '@media(resolution >= 1x)'])(
      'applies the branch whose resolution query matches: %s',
      (stateKey) => {
        // devicePixelRatio is at least 1, so both queries hold.
        expect(window.matchMedia('(min-resolution: 1x)').matches).toBe(true);

        const Box = tasty({
          qa: 'Box',
          styles: {
            display: 'block',
            padding: { '': '4x', [stateKey]: '1x' },
          },
        });

        const el = render(<Box />).getByTestId('Box');

        expect(computed(el, 'padding')).toBe('8px');
      },
    );
  });

  /* eslint-disable tasty/prefer-custom-property-syntax --
     these read the published variable on purpose: `#current` is the keyword, so
     it would not exercise `--current-color` at all. */
  describe('`#current` and `--current-color`', () => {
    // `#current` compiles to the `currentcolor` keyword, and `colorStyle`
    // publishes `--current-color` beside it for readers that need the inherited
    // color as a color. These assert the whole chain in a real engine, because
    // every step is a computed-value-time rule that CSS text cannot show.
    it('resolves against the element that reads it, not the one that set it', () => {
      const Box = tasty({
        qa: 'Box',
        styles: { display: 'block', fill: '#current' },
      });

      const el = render(
        <div style={{ color: 'rgb(0 128 0)' }}>
          <Box />
        </div>,
      ).getByTestId('Box');

      expect(computed(el, 'background-color')).toBe('rgb(0, 128, 0)');
    });

    it('reads the faded color when an ancestor faded its own', () => {
      // The regression that made `#current` a keyword again. A ramp built on
      // `#current` expresses its disabled state once, in `color`, and everything
      // painted from `#current` below has to fade with it. A variable cannot:
      // a faded color is deliberately not published (it would fade twice), so a
      // reader would see through to the unfaded color above.
      const Faded = tasty({
        qa: 'Faded',
        styles: { display: 'block', color: '#current.4' },
      });
      const Chip = tasty({
        qa: 'Chip',
        styles: { display: 'block', fill: '#current' },
      });

      const el = render(
        <div style={{ color: 'rgb(0 128 0)' }}>
          <Faded>
            <Chip />
          </Faded>
        </div>,
      ).getByTestId('Chip');

      expect(computed(el, 'background-color')).toContain('/ 0.4');
    });

    it('keeps a nested `#current` fade composing', () => {
      // `#current.4` with `#current.18` under it lands at `.072`. The fade goes
      // through `color-mix()`, which composes, and the keyword inside it reads
      // the already-faded color that reaches each element.
      const L1 = tasty({
        qa: 'L1',
        styles: { display: 'block', color: '#current.4' },
      });
      const L2 = tasty({
        qa: 'L2',
        styles: { display: 'block', fill: '#current.18' },
      });

      const el = render(
        <div style={{ color: 'rgb(0 128 0)' }}>
          <L1>
            <L2 />
          </L1>
        </div>,
      ).getByTestId('L2');

      expect(computed(el, 'background-color')).toContain('/ 0.072');
    });

    it('publishes `--current-color` for a literal, not only for a token', () => {
      // A reader below takes the nearest *color*, not the nearest token color,
      // so a literal has to displace an ancestor's token.
      configure({ tokens: { '#purple': 'rgb(128 0 255)' } });

      const Outer = tasty({
        qa: 'Outer',
        styles: { display: 'block', color: '#purple' },
      });
      const Mid = tasty({
        qa: 'Mid',
        styles: { display: 'block', color: 'rgb(255 0 0)' },
      });
      const Leaf = tasty({
        qa: 'Leaf',
        styles: { display: 'block', fill: '$current-color' },
      });

      const el = render(
        <Outer>
          <Mid>
            <Leaf />
          </Mid>
        </Outer>,
      ).getByTestId('Leaf');

      expect(computed(el, 'background-color')).toBe('rgb(255, 0, 0)');
    });

    it('stands in for the keyword where nothing published it', () => {
      // What `initial-value: currentcolor` buys: a registered `<color>` property
      // keeps the keyword as its computed value, so an unpublished reader still
      // resolves against its own element. `transparent` would render it invisible.
      const Box = tasty({
        qa: 'Box',
        styles: { display: 'block', fill: '$current-color' },
      });

      const el = render(
        <div style={{ color: 'rgb(0 128 0)' }}>
          <Box />
        </div>,
      ).getByTestId('Box');

      expect(computed(el, 'background-color')).toBe('rgb(0, 128, 0)');
    });

    it('does not republish a value that reads the color it inherits', () => {
      // Republishing `currentcolor` would let a descendant resolve it again
      // against its own color; the ancestor's own color is what has to reach it.
      const Box = tasty({
        qa: 'Box',
        styles: { display: 'block', color: '#current' },
      });
      const Leaf = tasty({
        qa: 'Leaf',
        styles: { display: 'block', fill: '$current-color' },
      });

      const el = render(
        <div style={{ color: 'rgb(0 128 0)' }}>
          <Box>
            <Leaf />
          </Box>
        </div>,
      ).getByTestId('Leaf');

      expect(computed(el, 'background-color')).toBe('rgb(0, 128, 0)');
    });

    it('fades a token defined as `#current`', () => {
      // A token *holding* the keyword is mixed with `currentcolor` inside it,
      // which `color-mix()` has resolved since Safari 16.2.
      configure({ tokens: { '#purple': 'rgb(128 0 255)' } });

      const Outer = tasty({
        qa: 'Outer',
        styles: { display: 'block', color: '#purple' },
      });
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });

      const el = render(
        <Outer>
          <Box styles={{ '#ink': '#current', fill: '#ink.5' }} />
        </Outer>,
      ).getByTestId('Box');

      expect(computed(el, '--ink-color')).toBe('currentcolor');
      expect(computed(el, 'background-color')).toMatch(/^oklab\(0\.53\d+ /);
      expect(computed(el, 'background-color')).toContain('/ 0.5');
    });
  });
  /* eslint-enable tasty/prefer-custom-property-syntax */

  describe('shadow DOM', () => {
    it('applies styles adopted into a shadow root', () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });

      try {
        const { className } = computeStyles(
          { display: 'block', padding: '2x' },
          { root: shadowRoot },
        );

        const inner = document.createElement('div');
        inner.className = className;
        shadowRoot.appendChild(inner);

        expect(computed(inner, 'padding')).toBe('16px');
      } finally {
        destroy(shadowRoot);
        host.remove();
      }
    });

    it('does not leak those styles to the light DOM', () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });

      try {
        const { className } = computeStyles(
          { display: 'block', padding: '7x' },
          { root: shadowRoot },
        );

        const outside = document.createElement('div');
        outside.className = className;
        document.body.appendChild(outside);

        try {
          expect(computed(outside, 'padding')).toBe('0px');
        } finally {
          outside.remove();
        }
      } finally {
        destroy(shadowRoot);
        host.remove();
      }
    });
  });
});
