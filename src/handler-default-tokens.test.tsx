/**
 * Handler output that reads one of Tasty's default tokens.
 *
 * Runtime and SSR register the default @property set, so `--transition`,
 * `--bold-font-weight`, `--font-sans-fallback` and `--border-color` have a
 * value there even when the app never defines them. Zero-runtime CSS ships
 * without that set. A `var()` with neither a value nor a fallback makes its
 * whole declaration invalid at computed-value time, which reads as no
 * transition, a normal weight, or the inherited font rather than as an error.
 * Only `getComputedStyle` can tell, so every case is asserted on computed
 * values through the runtime injector, the SSR collector, and the zero-runtime
 * extractor. The paths agree on every value except the default font stack,
 * which zero-runtime CSS shortens to the same family.
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
import { extractChunks, extractPropertiesFromStyles } from './zero/extractor';

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
      // What the Babel plugin writes: the chunk rules and the @property rules
      // inferred from them, and nothing from Tasty's default set.
      const chunks = extractChunks(styles);
      element.className = chunks.map((chunk) => chunk.className).join(' ');
      style.textContent = [
        ...extractPropertiesFromStyles(styles).map((prop) => prop.css),
        ...chunks.map((chunk) => chunk.css),
      ].join('\n');
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

/** A registered default font stack, as `fontFamily()` reads it back. */
function defaultStack(token: string): string {
  return String(DEFAULT_PROPERTIES[token].initialValue).toLowerCase();
}

describe.each<RenderPath>(['runtime', 'ssr', 'zero'])(
  'default tokens in handler output through %s',
  (path) => {
    afterEach(() => {
      document.querySelectorAll('[data-default-token-probe]').forEach((el) => {
        el.remove();
      });
      document.body.replaceChildren();
      destroy();
      resetConfig();
    });

    if (path === 'zero') {
      it('renders without the default @property set', () => {
        mount({ transition: 'opacity' }, path);
        // Each is registered with an initial value wherever the set is emitted.
        expect(computed(document.body, '--transition')).toBe('');
        expect(computed(document.body, '--bold-font-weight')).toBe('');
        expect(computed(document.body, '--font-sans-fallback')).toBe('');
        expect(computed(document.body, '--border-color')).toBe('');
      });
    }

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
      // Runtime and SSR read the full stacks registered as
      // `$font-sans-fallback` / `$font-mono-fallback`. Zero-runtime CSS falls
      // through to the handler's own short stacks, which keep the family.
      const sans =
        path === 'zero'
          ? 'system-ui, sans-serif'
          : defaultStack('$font-sans-fallback');
      const mono =
        path === 'zero'
          ? 'ui-monospace, monospace'
          : defaultStack('$font-mono-fallback');

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
 * A style that sets `#border` makes auto-inference register `--border-color`.
 * Inferred, it would be a `<color>` starting at `transparent`, which every
 * element without the token then reads instead of the `currentColor`
 * fallback. Tasty declares it itself (`initial-value: currentcolor`), and the
 * runtime injector does not infer a property that is already registered.
 */
describe('`#border` set by one style', () => {
  afterEach(() => {
    document.body.replaceChildren();
    destroy();
    resetConfig();
  });

  it('leaves a border without it in the text color', () => {
    const tinted = mount({ '#border': GREEN, border: true }, 'runtime');
    const plain = mount({ border: '2px dashed' }, 'runtime');

    expect(computed(tinted, 'border-top-color')).toBe(GREEN);
    expect(computed(plain, 'border-top-style')).toBe('dashed');
    expect(computed(plain, 'border-top-color')).toBe(RED);
  });
});
