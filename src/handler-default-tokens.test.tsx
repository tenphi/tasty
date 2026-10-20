/**
 * Handler output that reads one of Tasty's default tokens.
 *
 * `transition`, `preset: '… / strong'`, `font` and a `border` with no color
 * read `$transition`, `$bold-font-weight`, `$font-sans-fallback` /
 * `$font-mono-fallback` and `#border` as bare `var()`s. They have a value only
 * because every rendering path ships Tasty's default @property set: the
 * runtime injector, the SSR collector, and the Babel plugin's output. Without
 * it the whole declaration is invalid at computed-value time, which reads as
 * no transition, a normal weight, the inherited font, or no border rather than
 * as an error. Only `getComputedStyle` can tell, so every case is asserted on
 * computed values through all three paths, which agree on every value.
 */
import { render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { resetConfig } from './config';
import { destroy } from './injector';
import { DEFAULT_PROPERTIES } from './properties/defaults';
import { createServerStyleCollector } from './ssr/collector';
import type { Styles } from './styles/types';
import { tasty } from './tasty';
import { hashString } from './utils/hash';
import {
  extractChunks,
  extractConfigProperties,
  extractPropertiesFromStyles,
} from './zero/extractor';

// The extractor names classes with Node's `crypto`, which the browser lacks.
// Any stable content hash serves; the CSS it writes is what is under test.
vi.mock('crypto', () => {
  const createHash = () => {
    let input = '';
    const hash = {
      update: (data: string) => {
        input += data;
        return hash;
      },
      digest: () => hashString(input),
    };
    return hash;
  };
  return { createHash, default: { createHash } };
});

type RenderPath = 'runtime' | 'ssr' | 'zero';

const RED = 'rgb(200, 0, 0)';
const GREEN = 'rgb(0, 128, 0)';

/** Render `styles` onto an element drawn in `RED` text, through `path`. */
function mount(styles: Styles, path: RenderPath): HTMLElement {
  let element: HTMLElement;

  if (path === 'runtime') {
    const Box = tasty({ styles });
    element = render(<Box />).container.firstElementChild as HTMLElement;
  } else {
    element = document.createElement('div');
    const style = document.createElement('style');

    if (path === 'ssr') {
      const collector = createServerStyleCollector();
      element.className = computeStyles(styles, {
        ssrCollector: collector,
      }).className;
      style.textContent = collector.getCSS();
    } else {
      // What the Babel plugin writes: Tasty's default @property set, the
      // @property rules inferred from the styles except those already
      // declared, and the chunk rules.
      const declared = extractConfigProperties();
      const inferred = extractPropertiesFromStyles(styles, {
        defined: new Set(declared.map((prop) => prop.name)),
      });
      const chunks = extractChunks(styles);
      element.className = chunks.map((chunk) => chunk.className).join(' ');
      style.textContent = [...declared, ...inferred, ...chunks]
        .map((rule) => rule.css)
        .join('\n');
    }

    style.dataset.defaultTokenProbe = '';
    document.head.append(style);
    document.body.append(element);
  }

  element.style.color = RED;
  return element;
}

function computed(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property);
}

/**
 * The computed `font-family`, lowercased. A registered universal-syntax
 * property hands its value back lowercased, an unregistered one as written,
 * and family names match case-insensitively either way.
 */
function fontFamily(element: Element): string {
  return computed(element, 'font-family').toLowerCase();
}

/** Set `name` on the root element for the duration of `run`. */
function withRootToken(name: string, value: string, run: () => void): void {
  document.documentElement.style.setProperty(name, value);

  try {
    run();
  } finally {
    document.documentElement.style.removeProperty(name);
  }
}

function cleanup() {
  document.querySelectorAll('[data-default-token-probe]').forEach((el) => {
    el.remove();
  });
  document.body.replaceChildren();
  destroy();
  resetConfig();
}

/** A registered default font stack, as `fontFamily()` reads it back. */
function defaultStack(token: string): string {
  return String(DEFAULT_PROPERTIES[token].initialValue).toLowerCase();
}

describe.each<RenderPath>(['runtime', 'ssr', 'zero'])(
  'default tokens in handler output through %s',
  (path) => {
    afterEach(cleanup);

    it('registers the default set from its own CSS', () => {
      // Nothing is left over from an earlier path, so the cases below pass on
      // what this path emits.
      expect(computed(document.body, '--bold-font-weight')).toBe('');
      mount({ transition: 'opacity' }, path);
      expect(computed(document.body, '--bold-font-weight')).toBe('700');
    });

    describe('transition', () => {
      it.each<[string, string, string]>([
        ['opacity', 'opacity', '0.08s'],
        [
          'fill',
          'background-color, background-image, --tasty-second-fill-color',
          '0.08s, 0.08s, 0.08s',
        ],
        ['opacity, fill', 'opacity, background-color', '0.08s, 0.08s'],
      ])(
        'times `transition: %s` with the `$transition` default',
        (transition, properties, durations) => {
          const element = mount({ transition }, path);

          expect(computed(element, 'transition-property')).toMatch(
            new RegExp(`^${properties}`),
          );
          expect(computed(element, 'transition-duration')).toMatch(
            new RegExp(`^${durations}`),
          );
        },
      );

      it('times a transition with `$transition` when the app defines it', () => {
        withRootToken('--transition', '200ms', () => {
          const element = mount({ transition: 'opacity' }, path);

          expect(computed(element, 'transition-duration')).toBe('0.2s');
        });
      });

      it('times a transition with its own `$<name>-transition` first', () => {
        withRootToken('--opacity-transition', '300ms', () => {
          const element = mount({ transition: 'opacity' }, path);

          expect(computed(element, 'transition-duration')).toBe('0.3s');
        });
      });
    });

    describe('preset weight', () => {
      it.each(['h1 / strong', 'h1 / bold', 'strong', 'bold italic'])(
        'bolds `preset: %s` with the `$bold-font-weight` default',
        (preset) => {
          const element = mount({ preset }, path);

          expect(computed(element, 'font-weight')).toBe('700');
        },
      );

      it('bolds with the preset’s own bold weight when the app defines it', () => {
        withRootToken('--h1-bold-font-weight', '600', () => {
          const element = mount({ preset: 'h1 / strong' }, path);

          expect(computed(element, 'font-weight')).toBe('600');
        });
      });
    });

    describe('font family', () => {
      // The full stacks registered as `$font-sans-fallback` /
      // `$font-mono-fallback`.
      const sans = defaultStack('$font-sans-fallback');
      const mono = defaultStack('$font-mono-fallback');

      it.each<[string, Styles, string]>([
        ['font: true', { font: true }, sans],
        ['font: monospace', { font: 'monospace' }, mono],
        ['a custom font', { font: 'Custom' }, `custom, ${sans}`],
        ['a preset', { preset: 'h1' }, `${sans}, ${sans}`],
      ])('renders %s in the default family', (_, styles, family) => {
        const element = mount(styles, path);

        expect(fontFamily(element)).toBe(family);
      });

      it('renders `font: monospace` in `$font-mono-fallback` when the app defines it', () => {
        withRootToken('--font-mono-fallback', 'Courier, monospace', () => {
          const element = mount({ font: 'monospace' }, path);

          expect(fontFamily(element)).toBe('courier, monospace');
        });
      });

      it('renders `font: true` in `$font-sans` when the app defines it', () => {
        withRootToken('--font-sans', 'Georgia, serif', () => {
          const element = mount({ font: true }, path);

          expect(fontFamily(element)).toBe('georgia, serif');
        });
      });
    });

    describe('border color', () => {
      it.each<[string, string, string]>([
        ['border: true', 'true', 'solid'],
        ['a width and style', '2px dashed', 'dashed'],
        ['a side', '2px top', 'solid'],
      ])(
        'draws a border with %s and no color in the text color',
        (_, border, borderStyle) => {
          const element = mount(
            { border: border === 'true' ? true : border },
            path,
          );

          expect(computed(element, 'border-top-style')).toBe(borderStyle);
          expect(computed(element, 'border-top-color')).toBe(RED);
        },
      );

      it('draws a border in `#border` when the element defines it', () => {
        const element = mount({ '#border': GREEN, border: true }, path);

        expect(computed(element, 'border-top-style')).toBe('solid');
        expect(computed(element, 'border-top-color')).toBe(GREEN);
      });

      it('draws a border in `#border` inherited from an ancestor', () => {
        withRootToken('--border-color', GREEN, () => {
          const element = mount({ border: '2px dashed' }, path);

          expect(computed(element, 'border-top-color')).toBe(GREEN);
        });
      });
    });
  },
);

/**
 * A style that sets `#border` makes auto-inference meet `--border-color`.
 * Inferred, it would be a `<color>` starting at `transparent`, which every
 * element without the token then reads. Tasty declares it by default
 * (`initial-value: currentcolor`), and every path leaves a declared property
 * to its own definition.
 */
describe.each<RenderPath>(['runtime', 'ssr', 'zero'])(
  '`#border` set by one style through %s',
  (path) => {
    afterEach(cleanup);

    it('leaves a border without it in the text color', () => {
      const tinted = mount({ '#border': GREEN, border: true }, path);
      const plain = mount({ border: '2px dashed' }, path);

      expect(computed(tinted, 'border-top-color')).toBe(GREEN);
      expect(computed(plain, 'border-top-style')).toBe('dashed');
      expect(computed(plain, 'border-top-color')).toBe(RED);
    });
  },
);
