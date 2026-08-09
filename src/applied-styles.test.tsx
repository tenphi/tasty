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

      // `#black.5` resolves through the default oklch colour space:
      // `oklch(var(--black-color-oklch) / .5)`, with `--black-color-oklch`
      // supplied by the token's `@property` initial value.
      expect(computed(el, 'background-color')).toBe('oklch(0 0 0 / 0.5)');
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
