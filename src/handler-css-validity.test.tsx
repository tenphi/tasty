/**
 * Handler output the engine has to accept.
 *
 * Each case here once compiled to CSS that looked plausible as text but that
 * Chromium dropped, ignored, or resolved to something else: a transition on a
 * property that does not exist, a query bound written with a custom property,
 * a comma-joined fallback list, two rules racing for `background-image`. Only
 * `getComputedStyle` can tell, so every case is asserted on computed values,
 * through both the runtime injector and the SSR collector.
 */
import { render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { configure, resetConfig } from './config';
import { destroy } from './injector';
import { createServerStyleCollector } from './ssr/collector';
import type { Styles } from './styles/types';
import { tasty } from './tasty';

type RenderPath = 'runtime' | 'ssr';

/** Render `styles` onto an element inside `parent`, through either path. */
function mount(
  styles: Styles,
  path: RenderPath,
  parent: HTMLElement = document.body,
): HTMLElement {
  if (path === 'runtime') {
    const Box = tasty({ styles });
    // Rendered straight into a sized parent: an intermediate wrapper would be
    // the box `stretch` and container queries resolve against.
    const options =
      parent === document.body ? undefined : { container: parent };
    return render(<Box />, options).container.firstElementChild as HTMLElement;
  }

  const element = div();
  const style = document.createElement('style');

  const collector = createServerStyleCollector();
  element.className = computeStyles(styles, {
    ssrCollector: collector,
  }).className;
  style.textContent = collector.getCSS();

  style.dataset.handlerCssProbe = '';
  document.head.append(style);
  parent.append(element);
  return element;
}

function div(css = ''): HTMLDivElement {
  const element = document.createElement('div');
  element.style.cssText = css;
  return element;
}

/** A sized wrapper appended to the body, for cases that depend on the parent. */
function parentBox(css: string): HTMLDivElement {
  return document.body.appendChild(div(css));
}

function computed(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property);
}

const DATA_GIF = 'url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)';

describe.each<RenderPath>(['runtime', 'ssr'])(
  'handler output is valid CSS through %s',
  (path) => {
    afterEach(() => {
      document.querySelectorAll('[data-handler-css-probe]').forEach((el) => {
        el.remove();
      });
      document.body.replaceChildren();
      destroy();
      resetConfig();
    });

    describe('transition', () => {
      it('transitions `zIndex` as `z-index`', () => {
        const element = mount({ transition: 'zIndex' }, path);

        // The parser lowercases the name; `zindex` is a valid ident to
        // `transition-property` but names no property, so nothing transitioned.
        expect(computed(element, 'transition-property')).toBe('z-index');
        expect(computed(element, 'transition-duration')).toBe('0.08s');
      });
    });

    describe('a group that names no value uses the unit default', () => {
      it.each<[string, Styles, string, string]>([
        ['padding', { padding: 'top' }, 'padding-top', '8px'],
        ['margin', { margin: 'top' }, 'margin-top', '8px'],
        [
          'blockPadding',
          { blockPadding: 'start' },
          'padding-block-start',
          '8px',
        ],
        ['blockMargin', { blockMargin: 'start' }, 'margin-block-start', '8px'],
        ['width min', { width: 'min' }, 'min-width', '8px'],
        [
          'radius corner',
          { radius: 'top-right' },
          'border-top-right-radius',
          '6px',
        ],
        ['border side', { border: 'dotted left' }, 'border-left-width', '1px'],
        // With a color: `--outline-color` has no default, so without one the
        // declaration fails to resolve and the outline is not drawn at all.
        ['outline', { outline: 'dotted #black' }, 'outline-width', '3px'],
      ])('%s', (_, styles, property, expected) => {
        const element = mount({ display: 'block', ...styles }, path);

        expect(computed(element, property)).toBe(expected);
      });

      it('fade', () => {
        const element = mount({ fade: 'top' }, path);

        // `2x`, the documented default fade width.
        expect(computed(element, 'mask-image')).toContain('16px');
      });
    });

    describe('units in query conditions', () => {
      // The test viewport is a few hundred pixels wide: 1000x (8000px) holds,
      // 1x (8px) does not. A `calc(var(--gap) * n)` bound matched neither way.
      it.each<[string, string]>([
        ['x', '@media(w < 1000x)'],
        ['r', '@media(w < 2000r)'],
        ['bw', '@media(w < 9000bw)'],
        ['decimal', '@media(w < 999.5x)'],
      ])('resolves the `%s` unit in @media', (_, query) => {
        const element = mount({ order: { '': 1, [query]: 2 } }, path);

        expect(computed(element, 'order')).toBe('2');
      });

      it('keeps the default when the bound does not hold', () => {
        const element = mount({ order: { '': 1, '@media(w < 1x)': 2 } }, path);

        expect(computed(element, 'order')).toBe('1');
      });

      it('resolves a configured unit', () => {
        configure({ units: { bp: '1000px' } });

        const element = mount(
          { order: { '': 1, '@media(w < 10bp)': 2, '@media(w < 0.001bp)': 3 } },
          path,
        );

        expect(computed(element, 'order')).toBe('2');
      });

      it('resolves units in @container', () => {
        const container = parentBox(
          'container-type: inline-size; width: 400px',
        );
        const element = mount(
          {
            order: {
              '': 1,
              '@(w < 100x)': 2, // 800px: holds
              '@(w < 10x)': 3, // 80px: does not
            },
          },
          path,
          container,
        );

        expect(computed(element, 'order')).toBe('2');
      });
    });

    describe('stretch', () => {
      it('fills the available inline space on `width`', () => {
        const parent = parentBox('width: 300px');
        const element = mount(
          { display: 'inline-block', width: 'stretch', margin: '10px' },
          path,
          parent,
        );

        // Unlike `100%`, `stretch` subtracts the margins. An inline-block left
        // with a dropped declaration shrinks to its (empty) content instead.
        expect(computed(element, 'width')).toBe('280px');
      });

      it.each<[string, string]>([
        ['height', 'height'],
        ['blockSize', 'block-size'],
      ])('fills the available block space on `%s`', (styleName, property) => {
        const parent = parentBox('height: 200px; display: flow-root');
        const element = mount(
          { display: 'block', [styleName]: 'stretch', margin: '10px' },
          path,
          parent,
        );

        // `stretch` used to become `auto` here, which is 0px for an empty box.
        expect(computed(element, property)).toBe('180px');
      });

      it('fills the available inline space on `inlineSize`', () => {
        const parent = parentBox('width: 300px');
        const element = mount(
          { display: 'inline-block', inlineSize: 'stretch', margin: '10px' },
          path,
          parent,
        );

        expect(computed(element, 'inline-size')).toBe('280px');
      });
    });

    describe('fill with image', () => {
      it('layers the image over the second fill color in one declaration', () => {
        const element = mount(
          { fill: '#white #black.10', image: DATA_GIF },
          path,
        );

        // `fill` and `image` used to render in separate chunks, each writing
        // its own `background-image`, so one of them was lost to rule order.
        const image = computed(element, 'background-image');
        expect(image).toMatch(/^url\("data:image\/gif/);
        expect(image).toContain('linear-gradient(');
      });

      it('lets `backgroundColor` take priority over `fill`', () => {
        const element = mount(
          { fill: '#black', backgroundColor: '#white' },
          path,
        );

        expect(computed(element, 'background-color')).toBe(
          'rgb(255, 255, 255)',
        );
      });
    });

    describe('hex literals', () => {
      it('applies a hex literal in `color` and under an opacity suffix', () => {
        const element = mount({ color: '#ddd', fill: '#ddd.5' }, path);

        expect(computed(element, 'color')).toBe('rgb(221, 221, 221)');
        // Without the literal fallback, `var(--ddd-color)` resolved to nothing
        // and the whole declaration was dropped.
        expect(computed(element, 'background-color')).toMatch(/ \/ 0\.5\)$/);
      });

      it('lets a hex-shaped token win in `color` as it does in `fill`', () => {
        configure({ tokens: { '#bad': 'rgb(255 0 0)' } });

        const element = mount({ color: '#bad', fill: '#bad' }, path);

        expect(computed(element, 'color')).toBe('rgb(255, 0, 0)');
        expect(computed(element, 'background-color')).toBe('rgb(255, 0, 0)');
      });
    });
  },
);
