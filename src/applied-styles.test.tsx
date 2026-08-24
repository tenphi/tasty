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

      // `#black.5` becomes `oklch(from var(--black-color) l c h / .5)` — the
      // channels copied over and the alpha slot written — so this is black at
      // half alpha.
      expect(computed(el, 'background-color')).toBe('oklch(0 0 0 / 0.5)');
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
      control.style.backgroundColor = 'oklch(from rgb(0 0 255) l c h / .5)';
      document.body.append(control);

      expect(computed(el, 'background-color')).toBe(
        computed(control, 'background-color'),
      );
      expect(computed(el, 'background-color')).toMatch(/\/ 0\.5\)$/);

      control.remove();
      sheet.remove();
    });

    it('replaces an alpha the colour already carries', () => {
      // The regression this guards: composing with `color-mix()` against
      // `transparent` would *multiply* the two alphas, so a token holding
      // `rgb(255 0 0 / .8)` faded to `.5` would come out at `.4`. Writing the
      // alpha slot replaces it, which is what the channel-components form did
      // and what a statically-known colour still does.
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(
        <Box styles={{ '#half': 'rgb(255 0 0 / .8)', fill: '#half.5' }} />,
      ).getByTestId('Box');

      expect(computed(el, 'background-color')).toMatch(/\/ 0\.5\)$/);
    });

    it('takes an opacity variable in either number or percentage form', () => {
      // The alpha slot accepts both, and `--*-opacity` properties are registered
      // as `<number> | <percentage>`. Scaling the reference into a percentage
      // would make one of the two forms invalid and drop the declaration.
      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });

      for (const fade of ['0.5', '50%']) {
        const { getByTestId, unmount } = render(
          <Box
            styles={{ '$fade-opacity': fade, fill: '#black.$fade-opacity' }}
          />,
        );

        expect(computed(getByTestId('Box'), 'background-color')).toBe(
          'oklch(0 0 0 / 0.5)',
        );

        unmount();
      }
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
      // The channels are copied, not converted into a gamut-limited space, so a
      // display-p3 red keeps a chroma sRGB cannot hold. `rgb(from …)` — or a mix
      // `in srgb` — would clamp it.
      const p3 = document.createElement('div');
      p3.style.backgroundColor =
        'oklch(from color(display-p3 1 0.2 0) l c h / .5)';
      const srgb = document.createElement('div');
      srgb.style.backgroundColor = 'oklch(from rgb(255 0 0) l c h / .5)';
      document.body.append(p3, srgb);

      const chroma = (el: Element) =>
        parseFloat(
          computed(el, 'background-color').match(/^oklch\([^ ]+ ([^ ]+)/)![1],
        );

      expect(chroma(p3)).toBeGreaterThan(chroma(srgb));
      expect(computed(p3, 'background-color')).toContain('/ 0.5)');

      p3.remove();
      srgb.remove();
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
      // fade — the browser copies its channels.
      expect(computed(el, '--brand-color')).toBe('color(srgb 0.5 0.5 0.5)');

      // Mid-grey at half alpha. Channel precision is up to the engine, so only
      // the lightness band and the alpha are asserted.
      const background = computed(el, 'background-color');
      expect(background).toMatch(/^oklch\(0\.59\d+ /);
      expect(background).toMatch(/\/ 0\.5\)$/);
    });

    it('registers design tokens as inherited custom properties', () => {
      render(<div />);

      // `$gap` is declared `syntax: '<length>'; inherits: true` with a `4px`
      // initial value. An engine without `@property` reports an empty string.
      expect(computed(document.documentElement, '--gap')).toBe('4px');
    });

    it('applies styles injected through the CSSOM rather than as text', () => {
      configure({ forceTextInjection: false });

      const Box = tasty({ qa: 'Box', styles: { display: 'block' } });
      const el = render(<Box styles={{ padding: '3x' }} />).getByTestId('Box');

      expect(computed(el, 'padding')).toBe('24px');
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
  });

  describe('`#current` resolves through `--current-color`', () => {
    // `#current` emits `var(--current-color)` rather than the `currentcolor`
    // keyword, so a token defined as `#current` can be faded: relative colour
    // syntax takes a concrete origin from Safari 16.4, where
    // `oklch(from currentcolor …)` needs Safari 18. These assert the whole
    // chain in a real engine, because every step is a computed-value-time rule
    // that CSS text cannot show.
    it('fades a token defined as `#current`', () => {
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

      // Purple at half alpha — the origin was concrete, not the keyword.
      expect(computed(el, '--ink-color')).toBe('rgb(128, 0, 255)');
      expect(computed(el, 'background-color')).toMatch(/^oklch\(0\.53\d+ /);
      expect(computed(el, 'background-color')).toContain('/ 0.5');
    });

    it('behaves as the keyword where no `color` style published it', () => {
      // The `initial-value: currentcolor` registration is what makes this hold.
      // `transparent` would render an unpublished `#current` invisible.
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

    it('lets a literal colour displace an ancestor token colour', () => {
      // Every colour republishes, not only a named token — otherwise `#current`
      // below would read the nearest *token* rather than the nearest colour.
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
        styles: { display: 'block', fill: '#current' },
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

    it('keeps a nested `#current` fade composing', () => {
      // `#current.4` with `#current.18` under it lands at `.072`. The fade keeps
      // the `currentcolor` keyword inside its `color-mix()` for exactly this —
      // reading the variable would mix the outer fade's operand a second time.
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

    it('does not republish a value that reads the colour it inherits', () => {
      // Publishing `var(--current-color)` into itself is a self-reference, which
      // invalidates the declaration and silently drops the value.
      const Box = tasty({
        qa: 'Box',
        styles: { display: 'block', color: '#current' },
      });

      const el = render(
        <div style={{ color: 'rgb(0 128 0)' }}>
          <Box />
        </div>,
      ).getByTestId('Box');

      expect(computed(el, 'color')).toBe('rgb(0, 128, 0)');
    });
  });

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
