/**
 * Handler output that reads a token Tasty registers by default.
 *
 * `outline` with no color reads `#outline`, and `radius: 'leaf'` reads
 * `$sharp-radius` and `$radius`, each as a bare `var()`. They have a value
 * only because every rendering path ships Tasty's default @property set: the
 * runtime injector, the SSR collector, and the Babel plugin's output. Without
 * it the whole declaration is invalid at computed-value time, which reads as
 * `outline-style: none` or square corners rather than as an error. Only
 * `getComputedStyle` can tell, so every case is asserted on computed values
 * through all three paths.
 */
import { render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { resetConfig } from './config';
import { destroy } from './injector';
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

    style.dataset.registeredDefaultsProbe = '';
    document.head.append(style);
    document.body.append(element);
  }

  element.style.color = RED;
  return element;
}

function computed(element: Element, property: string): string {
  return getComputedStyle(element).getPropertyValue(property);
}

function cleanup() {
  document
    .querySelectorAll('[data-registered-defaults-probe]')
    .forEach((el) => {
      el.remove();
    });
  document.body.replaceChildren();
  destroy();
  resetConfig();
}

describe.each<RenderPath>(['runtime', 'ssr', 'zero'])(
  'default-token reads in handler output through %s',
  (path) => {
    afterEach(cleanup);

    it('registers the default set from its own CSS', () => {
      // Nothing is left over from an earlier path, so the cases below pass on
      // what this path emits.
      expect(computed(document.body, '--sharp-radius')).toBe('');
      mount({ outline: true }, path);
      expect(computed(document.body, '--sharp-radius')).toBe('0px');
    });

    it.each<[string, Styles, string, string]>([
      ['outline: true', { outline: true }, 'solid', '3px'],
      ['a width and style', { outline: '2px dashed' }, 'dashed', '2px'],
      ['an offset', { outline: '2px / 4px' }, 'solid', '2px'],
    ])(
      'draws an outline with %s and no color in the text color',
      (_, styles, outlineStyle, outlineWidth) => {
        const element = mount(styles, path);

        expect(computed(element, 'outline-style')).toBe(outlineStyle);
        expect(computed(element, 'outline-width')).toBe(outlineWidth);
        expect(computed(element, 'outline-color')).toBe(RED);
      },
    );

    it('draws an outline in `#outline` when the element defines it', () => {
      const element = mount({ '#outline': GREEN, outline: true }, path);

      expect(computed(element, 'outline-style')).toBe('solid');
      expect(computed(element, 'outline-color')).toBe(GREEN);
    });

    it('draws an outline in `#outline` inherited from an ancestor', () => {
      document.documentElement.style.setProperty('--outline-color', GREEN);

      try {
        const element = mount({ outline: '2px dashed' }, path);

        expect(computed(element, 'outline-style')).toBe('dashed');
        expect(computed(element, 'outline-color')).toBe(GREEN);
      } finally {
        document.documentElement.style.removeProperty('--outline-color');
      }
    });

    it.each<[string, string[]]>([
      ['leaf', ['0px', '6px', '0px', '6px']],
      ['8px leaf', ['0px', '8px', '0px', '8px']],
      ['8px backleaf', ['8px', '0px', '8px', '0px']],
    ])('rounds `radius: %s` with sharp corners', (radius, corners) => {
      const element = mount({ radius }, path);

      expect(
        [
          'border-top-left-radius',
          'border-top-right-radius',
          'border-bottom-right-radius',
          'border-bottom-left-radius',
        ].map((corner) => computed(element, corner)),
      ).toEqual(corners);
    });
  },
);

/**
 * A style that sets `#outline` makes auto-inference meet `--outline-color`.
 * Inferred, it would be a `<color>` starting at `transparent`, which every
 * element without the token then reads. Tasty declares it by default
 * (`initial-value: currentcolor`), and every path leaves a declared property
 * to its own definition.
 */
describe.each<RenderPath>(['runtime', 'ssr', 'zero'])(
  '`#outline` set by one style through %s',
  (path) => {
    afterEach(cleanup);

    it('leaves an outline without it in the text color', () => {
      const tinted = mount({ '#outline': GREEN, outline: true }, path);
      const plain = mount({ outline: '2px dashed' }, path);

      expect(computed(tinted, 'outline-color')).toBe(GREEN);
      expect(computed(plain, 'outline-style')).toBe('dashed');
      expect(computed(plain, 'outline-color')).toBe(RED);
    });
  },
);
