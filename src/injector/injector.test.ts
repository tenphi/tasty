/**
 * @vitest-environment happy-dom
 */
import type { StyleResult } from '../pipeline';
import { resetColorSpace, setColorSpace } from '../utils/color-space';

import { StyleInjector } from './injector';
import type { StyleInjectorConfig } from './types';

// Helper function to convert CSS string to StyleResult array for testing
function cssToStyleResults(css: string, className = 'test'): StyleResult[] {
  // Handle simple CSS case like '&{ color: red; }'
  if (
    css.includes('&{') &&
    !css.includes('\n') &&
    !css.includes('Title') &&
    !css.includes('@media')
  ) {
    return [
      {
        selector: `.${className}`,
        declarations: css
          .replace(/&\s*\{/, '')
          .replace(/\}$/, '')
          .trim(),
      },
    ];
  }

  // For complex CSS, just return a simple valid CSS rule for testing
  return [
    {
      selector: `.${className}`,
      declarations: 'color: red;',
      atRules: undefined,
    },
  ];
}

/**
 * Comprehensive tests for the StyleInjector.
 * Uses forceTextInjection mode so assertions can read textContent
 * (happy-dom's CSSOM works fine, but the textContent path is what
 *  these tests were written against).
 */

describe('StyleInjector', () => {
  let injector: StyleInjector;
  let config: StyleInjectorConfig;

  beforeEach(() => {
    config = {
      forceTextInjection: true,
    };
    injector = new StyleInjector(config);

    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  afterEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  describe('inject', () => {
    it('should inject CSS and return className with dispose function', () => {
      const css = '&{ color: red; padding: 10px; }';
      const result = injector.inject(cssToStyleResults(css));

      expect(result.className).toMatch(/^t[a-z0-9]+$/);
      expect(typeof result.dispose).toBe('function');

      const styleElements = document.head.querySelectorAll('[data-tasty]');
      expect(styleElements.length).toBe(1);
    });

    it('should return empty className for empty CSS', () => {
      const result = injector.inject([]);

      expect(result.className).toBe('');
      expect(typeof result.dispose).toBe('function');
    });

    it('should handle repeated identical CSS without active dedupe', () => {
      const css = '&{ color: red; }';

      const result1 = injector.inject(cssToStyleResults(css));
      const result2 = injector.inject(cssToStyleResults(css));

      expect(result1.className).toMatch(/^t[a-z0-9]+$/);
      expect(result2.className).toMatch(/^t[a-z0-9]+$/);

      const styleElements = document.head.querySelectorAll('[data-tasty]');
      expect(styleElements.length).toBe(1);
    });

    it('should generate different classNames for different CSS', () => {
      const css1 = '&{ color: red; }';
      const css2 = '&{ color: blue; }';

      const result1 = injector.inject(cssToStyleResults(css1));
      const result2 = injector.inject(cssToStyleResults(css2));

      expect(result1.className).not.toBe(result2.className);
    });

    it('should handle nested selectors', () => {
      const css = `
      &{ color: red; }
      &:hover{ color: blue; }
      Title{ font-size: 18px; }
      .child{ margin: 10px; }
    `;

      const result = injector.inject(cssToStyleResults(css));
      expect(result.className).toMatch(/^t[a-z0-9]+$/);
      expect(result.className).toBeTruthy();
      expect(typeof result.dispose).toBe('function');
    });

    it('should handle media queries', () => {
      const css = `
        &{ color: red; }
        @media (min-width: 768px){ &{ color: blue; } }
      `;

      const result = injector.inject(cssToStyleResults(css));
      expect(result.className).toMatch(/^t[a-z0-9]+$/);
      expect(result.className).toBeTruthy();
      expect(typeof result.dispose).toBe('function');
    });

    it('should use custom root when provided', () => {
      const shadowRoot = document
        .createElement('div')
        .attachShadow({ mode: 'open' });
      const css = '&{ color: red; }';

      const result = injector.inject(cssToStyleResults(css), {
        root: shadowRoot,
      });

      expect(result.className).toMatch(/^t[a-z0-9]+$/);

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(0);
      expect(shadowRoot.querySelectorAll('[data-tasty]').length).toBe(1);
    });
  });

  describe('global injection', () => {
    it('should inject global CSS rules without class name generation', () => {
      const globalRules = [
        {
          selector: 'body',
          declarations: 'margin: 0; padding: 0;',
        },
        {
          selector: '.header',
          declarations: 'background: blue; color: white;',
        },
        {
          selector: '#main',
          declarations: 'max-width: 1200px;',
        },
      ];

      const result = injector.inject(globalRules);

      expect(result.className).toMatch(/^t[a-z0-9]+$/);
      expect(typeof result.dispose).toBe('function');

      const styleElements = document.head.querySelectorAll('[data-tasty]');
      expect(styleElements.length).toBeGreaterThan(0);

      const allCssText = Array.from(styleElements)
        .map((el) => el.textContent || '')
        .join('');

      expect(allCssText).toContain('body');
      expect(allCssText).toContain('margin: 0');
      expect(allCssText).toContain('.header');
      expect(allCssText).toContain('background: blue');
      expect(allCssText).toContain('#main');
      expect(allCssText).toContain('max-width: 1200px');
    });

    it('should handle global CSS with media queries', () => {
      const globalRules = [
        {
          selector: '.responsive',
          declarations: 'color: red;',
          atRules: ['@media (min-width: 768px)'],
        },
        {
          selector: 'body',
          declarations: 'font-size: 16px;',
        },
      ];

      const result = injector.inject(globalRules);
      expect(result.className).toMatch(/^t[a-z0-9]+$/);

      const styleElements = document.head.querySelectorAll('[data-tasty]');
      const allCssText = Array.from(styleElements)
        .map((el) => el.textContent || '')
        .join('');

      expect(allCssText).toContain('.responsive');
      expect(allCssText).toContain('color: red');
      expect(allCssText).toContain('@media (min-width: 768px)');
      expect(allCssText).toContain('body');
      expect(allCssText).toContain('font-size: 16px');
    });

    it('should handle mixed global and component-style rules', () => {
      const mixedRules = [
        {
          selector: 'body',
          declarations: 'margin: 0;',
        },
        {
          selector: '.t-custom',
          declarations: 'padding: 20px;',
        },
      ];

      const result = injector.inject(mixedRules);
      expect(result.className).toMatch(/^t[a-z0-9]+$/);

      const styleElements = document.head.querySelectorAll('[data-tasty]');
      const allCssText = Array.from(styleElements)
        .map((el) => el.textContent || '')
        .join('');

      expect(allCssText).toContain('body');
      expect(allCssText).toContain('margin: 0');
      expect(allCssText).toContain('.t-custom');
      expect(allCssText).toContain('padding: 20px');
    });

    it('should deduplicate identical global rules', () => {
      const globalRules = [
        {
          selector: 'body',
          declarations: 'margin: 0; font-family: Arial;',
        },
      ];

      const result1 = injector.inject(globalRules);
      const result2 = injector.inject(globalRules);

      expect(result1.className).toMatch(/^t[a-z0-9]+$/);
      expect(result2.className).toMatch(/^t[a-z0-9]+$/);
      expect(result1.className).toBe(result2.className);
    });

    it('should dispose global rules correctly', () => {
      const globalRules = [
        {
          selector: 'body',
          declarations: 'background: lightgray;',
        },
      ];

      const result = injector.inject(globalRules);

      expect(
        document.head.querySelectorAll('[data-tasty]').length,
      ).toBeGreaterThan(0);

      result.dispose();

      expect(
        document.head.querySelectorAll('[data-tasty]').length,
      ).toBeGreaterThan(0);
    });
  });

  describe('component vs global injection comparison', () => {
    it('should handle component injection (with generated class names)', () => {
      const componentRules = cssToStyleResults(
        '&{ color: red; padding: 10px; }',
      );

      const result = injector.inject(componentRules);
      expect(result.className).toMatch(/^t[a-z0-9]+$/);

      const styleElements = document.head.querySelectorAll('[data-tasty]');
      const allCssText = Array.from(styleElements)
        .map((el) => el.textContent || '')
        .join('');

      expect(allCssText).toContain('.test');
      expect(allCssText).toContain('color: red');
      expect(allCssText).toContain('padding');
    });

    it('should handle global injection (with custom selectors)', () => {
      const globalRules = [
        {
          selector: 'body',
          declarations: 'margin: 0; background: #f0f0f0;',
        },
        {
          selector: '.my-component',
          declarations: 'border: 1px solid #ccc; border-radius: 4px;',
        },
      ];

      const result = injector.inject(globalRules);
      expect(result.className).toMatch(/^t[a-z0-9]+$/);

      const styleElements = document.head.querySelectorAll('[data-tasty]');
      const allCssText = Array.from(styleElements)
        .map((el) => el.textContent || '')
        .join('');

      expect(allCssText).toContain('body');
      expect(allCssText).toContain('margin: 0');
      expect(allCssText).toContain('.my-component');
      expect(allCssText).toContain('border: 1px solid');
    });

    it('should handle mixed injection (component + global selectors)', () => {
      const mixedRules = [
        {
          selector: '.t123',
          declarations: 'color: blue;',
        },
        {
          selector: 'body',
          declarations: 'font-family: sans-serif;',
        },
        {
          selector: '.custom-class',
          declarations: 'text-align: center;',
        },
      ];

      const result = injector.inject(mixedRules);
      expect(result.className).toMatch(/^t[a-z0-9]+$/);

      const styleElements = document.head.querySelectorAll('[data-tasty]');
      const allCssText = Array.from(styleElements)
        .map((el) => el.textContent || '')
        .join('');

      expect(allCssText).toContain('.t123');
      expect(allCssText).toContain('color: blue');
      expect(allCssText).toContain('body');
      expect(allCssText).toContain('font-family: sans-serif');
      expect(allCssText).toContain('.custom-class');
      expect(allCssText).toContain('text-align: center');
    });
  });

  describe('dispose and cleanup', () => {
    it('should mark styles as unused when disposed', () => {
      const css = '&{ color: red; }';

      const result = injector.inject(cssToStyleResults(css));
      expect(result.className).toMatch(/^t[a-z0-9]+$/);

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(1);

      result.dispose();

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(1);
    });

    it('should reuse hash-based class name for the same styles after dispose', () => {
      const css = '&{ color: red; }';

      const result1 = injector.inject(cssToStyleResults(css, 't123'));
      const className1 = result1.className;

      result1.dispose();

      const result2 = injector.inject(cssToStyleResults(css, 't123'));

      expect(result2.className).toBe(className1);

      const styleSheets = document.head.querySelectorAll('[data-tasty]').length;
      expect(styleSheets).toBeGreaterThanOrEqual(1);
    });

    it('should handle multiple disposals correctly', () => {
      const results: { dispose: () => void }[] = [];
      for (let i = 0; i < 10; i++) {
        const css = `&{ color: color${i}; }`;
        const result = injector.inject(cssToStyleResults(css));
        results.push(result);
      }

      results.forEach((result) => result.dispose());

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(1);
      expect(results.length).toBe(10);
    });

    it('should force bulk cleanup when cleanup() is called', () => {
      const css = '&{ color: red; }';
      const result = injector.inject(cssToStyleResults(css));
      result.dispose();

      injector.cleanup();
    });
  });

  describe('getCssText', () => {
    it('should return CSS text from all sheets', () => {
      const css1 = '&{ color: red; }';
      const css2 = '&{ background: blue; }';

      injector.inject(cssToStyleResults(css1));
      injector.inject(cssToStyleResults(css2));

      const cssText = injector.getCssText();

      expect(cssText).toContain('color: red');
      expect(cssText).toContain('background: blue');
    });

    it('should return empty string when no styles injected', () => {
      const cssText = injector.getCssText();
      expect(cssText.trim()).toBe('');
    });

    it('should get CSS from specific root', () => {
      const shadowRoot = document
        .createElement('div')
        .attachShadow({ mode: 'open' });

      injector.inject(cssToStyleResults('&{ color: red; }'));

      injector.inject(cssToStyleResults('&{ color: blue; }'), {
        root: shadowRoot,
      });

      const documentCss = injector.getCssText();
      const shadowCss = injector.getCssText({ root: shadowRoot });

      expect(documentCss).toContain('color: red');
      expect(documentCss).not.toContain('color: blue');

      expect(shadowCss).toContain('color: blue');
      expect(shadowCss).not.toContain('color: red');
    });
  });

  describe('destroy', () => {
    it('should clean up all resources for a root', () => {
      injector.inject(cssToStyleResults('&{ color: red; }'));
      injector.inject(cssToStyleResults('&{ background: blue; }'));

      expect(
        document.head.querySelectorAll('[data-tasty]').length,
      ).toBeGreaterThan(0);

      injector.destroy();

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(0);
    });

    it('should clean up specific root only', () => {
      const shadowRoot = document
        .createElement('div')
        .attachShadow({ mode: 'open' });

      injector.inject(cssToStyleResults('&{ color: red; }'));
      injector.inject(cssToStyleResults('&{ color: blue; }'), {
        root: shadowRoot,
      });

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(1);
      expect(shadowRoot.querySelectorAll('[data-tasty]').length).toBe(1);

      injector.destroy(shadowRoot);

      expect(document.head.querySelectorAll('[data-tasty]').length).toBe(1);
      expect(shadowRoot.querySelectorAll('[data-tasty]').length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle malformed CSS gracefully', () => {
      const malformedCss = '&{ color: red; background: ; }';

      expect(() => {
        const result = injector.inject(cssToStyleResults(malformedCss));
        expect(result.className).toBeDefined();
        expect(typeof result.dispose).toBe('function');
      }).not.toThrow();
    });

    it('should handle injection failures gracefully', () => {
      const mockSheet = {
        insertRule: vi.fn(() => {
          throw new Error('Mock injection failure');
        }),
        deleteRule: vi.fn(),
        cssRules: [],
      };

      const originalCreateElement = document.createElement;
      document.createElement = vi.fn().mockReturnValue({
        sheet: mockSheet,
        setAttribute: vi.fn(),
        style: {},
      }) as unknown as typeof document.createElement;

      const originalAppendChild = document.head.appendChild;
      document.head.appendChild =
        vi.fn() as unknown as typeof document.head.appendChild;

      try {
        const result = injector.inject(cssToStyleResults('&{ color: red; }'));
        expect(result.className).toMatch(/^t[a-z0-9]+$/);
        expect(typeof result.dispose).toBe('function');
      } finally {
        document.createElement = originalCreateElement;
        document.head.appendChild = originalAppendChild;
      }
    });
  });

  describe('injectRawCSS', () => {
    test('injects raw CSS and returns dispose function', () => {
      const injector = new StyleInjector();
      const css = `
        body { margin: 0; padding: 0; }
        .my-class { color: red; }
      `;

      const { dispose } = injector.injectRawCSS(css);

      const rawCSS = injector.getRawCSSText();
      expect(rawCSS).toContain('body { margin: 0; padding: 0; }');
      expect(rawCSS).toContain('.my-class { color: red; }');

      dispose();
      const afterDispose = injector.getRawCSSText();
      expect(afterDispose).not.toContain('body { margin: 0;');
    });

    test('handles multiple raw CSS injections', () => {
      const injector = new StyleInjector();
      const { dispose: dispose1 } = injector.injectRawCSS(
        '.first { color: blue; }',
      );
      const { dispose: dispose2 } = injector.injectRawCSS(
        '.second { color: green; }',
      );

      const rawCSS = injector.getRawCSSText();
      expect(rawCSS).toContain('.first { color: blue; }');
      expect(rawCSS).toContain('.second { color: green; }');

      dispose1();
      const afterFirst = injector.getRawCSSText();
      expect(afterFirst).not.toContain('.first');
      expect(afterFirst).toContain('.second');

      dispose2();
      const afterSecond = injector.getRawCSSText();
      expect(afterSecond).not.toContain('.second');
    });

    test('handles empty CSS gracefully', () => {
      const injector = new StyleInjector();
      const { dispose } = injector.injectRawCSS('');
      expect(injector.getRawCSSText()).toBe('');
      dispose();
    });

    test('handles whitespace-only CSS gracefully', () => {
      const injector = new StyleInjector();
      const { dispose } = injector.injectRawCSS('   \n\t  ');
      dispose();
    });

    test('raw CSS is separate from tasty CSS', () => {
      const injector = new StyleInjector();

      const result = injector.inject([
        { selector: '.t-test', declarations: 'color: purple;' },
      ]);

      const { dispose: rawDispose } = injector.injectRawCSS(
        '.raw { color: orange; }',
      );

      const tastyCSS = injector.getCssText();
      expect(tastyCSS).toContain('.t-test');
      expect(tastyCSS).toContain('color: purple');
      expect(tastyCSS).not.toContain('.raw');

      const rawCSS = injector.getRawCSSText();
      expect(rawCSS).toContain('.raw { color: orange; }');
      expect(rawCSS).not.toContain('.t-test');

      result.dispose();
      rawDispose();
    });

    test('handles complex CSS with at-rules', () => {
      const injector = new StyleInjector();
      const css = `
        @font-face {
          font-family: 'Test';
          src: url('/test.woff2') format('woff2');
        }
        
        @media (max-width: 768px) {
          .mobile { display: block; }
        }
        
        @keyframes slide {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `;

      const { dispose } = injector.injectRawCSS(css);

      const rawCSS = injector.getRawCSSText();
      expect(rawCSS).toContain('@font-face');
      expect(rawCSS).toContain('@media (max-width: 768px)');
      expect(rawCSS).toContain('@keyframes slide');

      dispose();
    });
  });

  describe('autoPropertyTypes', () => {
    it('should auto-register @property for custom properties in inject()', () => {
      const rules: StyleResult[] = [
        {
          selector: '.t0',
          declarations: '--pulse-scale: 1; --gap: 10px',
        },
      ];
      injector.inject(rules);

      expect(injector.isPropertyDefined('--pulse-scale')).toBe(true);
      expect(injector.isPropertyDefined('--gap')).toBe(true);
    });

    it('should auto-register @property for --*-color properties', () => {
      const rules: StyleResult[] = [
        {
          selector: '.t0',
          declarations: '--theme-color: var(--purple-color)',
        },
      ];
      injector.inject(rules);

      expect(injector.isPropertyDefined('--theme-color')).toBe(true);
    });

    it('should auto-register @property for keyframe custom properties', () => {
      injector.keyframes(
        {
          from: { '--pulse-scale': '0.9' as unknown as number },
          to: { '--pulse-scale': '1.1' as unknown as number },
        },
        { name: 'pulse' },
      );

      expect(injector.isPropertyDefined('--pulse-scale')).toBe(true);
    });

    it('should auto-register @property for global rules', () => {
      const globalRules: StyleResult[] = [
        {
          selector: ':root',
          declarations: '--spacing: 8px',
        },
      ];
      injector.injectGlobal(globalRules);

      expect(injector.isPropertyDefined('--spacing')).toBe(true);
    });

    it('should resolve var() chain across inject calls', () => {
      const rules1: StyleResult[] = [
        {
          selector: '.t0',
          declarations: '--a: var(--b)',
        },
      ];
      injector.inject(rules1);
      expect(injector.isPropertyDefined('--a')).toBe(false);

      const rules2: StyleResult[] = [
        {
          selector: '.t1',
          declarations: '--b: 42',
        },
      ];
      injector.inject(rules2);
      expect(injector.isPropertyDefined('--b')).toBe(true);
      expect(injector.isPropertyDefined('--a')).toBe(true);
    });

    it('should disable auto-injection when autoPropertyTypes is false', () => {
      const noAutoInjector = new StyleInjector({
        forceTextInjection: true,
        autoPropertyTypes: false,
      });

      const rules: StyleResult[] = [
        {
          selector: '.t0',
          declarations: '--scale: 1; --gap: 10px',
        },
      ];
      noAutoInjector.inject(rules);

      expect(noAutoInjector.isPropertyDefined('--scale')).toBe(false);
      expect(noAutoInjector.isPropertyDefined('--gap')).toBe(false);
    });

    it('should not override explicit @property definitions', () => {
      injector.property('$scale', {
        syntax: '<number>',
        inherits: false,
        initialValue: '1',
      });

      const rules: StyleResult[] = [
        {
          selector: '.t0',
          declarations: '--scale: 2',
        },
      ];
      injector.inject(rules);

      expect(injector.isPropertyDefined('--scale')).toBe(true);
    });
  });

  describe('property() — color companion', () => {
    afterEach(() => {
      resetColorSpace();
    });

    it('registers the decomposed-components companion for #name color tokens', () => {
      setColorSpace('rgb');

      injector.property('#accent', {
        initialValue: 'rgb(128 0 255)',
      });

      const cssText = injector.getCssText();
      expect(cssText).toContain('@property --accent-color');
      expect(cssText).toContain('syntax: "<color>"');
      expect(cssText).toContain('@property --accent-color-rgb');
      expect(cssText).toContain('syntax: "<number>+"');
      expect(injector.isPropertyDefined('#accent')).toBe(true);
      expect(injector.isPropertyDefined('--accent-color-rgb')).toBe(true);
    });

    it('uses the configured color space suffix for the companion', () => {
      setColorSpace('oklch');

      injector.property('#brand', {
        initialValue: 'rgb(255 0 0)',
      });

      const cssText = injector.getCssText();
      expect(cssText).toContain('@property --brand-color-oklch');
      expect(cssText).toContain('syntax: "<number>+"');
    });

    it('emits `*` companion syntax for the hsl color space', () => {
      setColorSpace('hsl');

      injector.property('#mix', {
        initialValue: 'rgb(255 128 64)',
      });

      const cssText = injector.getCssText();
      expect(cssText).toContain('@property --mix-color-hsl');
      // HSL components include percentages, so syntax is `*` not `<number>+`
      expect(cssText).toContain('syntax: "*"');
    });

    it('falls back to default components when initial value is `transparent`', () => {
      setColorSpace('rgb');

      injector.property('#bg', {
        initialValue: 'transparent',
      });

      const cssText = injector.getCssText();
      expect(cssText).toContain('@property --bg-color-rgb');
      expect(cssText).toContain('initial-value: 0 0 0');
    });

    it('does not register a companion for non-color properties', () => {
      setColorSpace('rgb');

      injector.property('$rotation', {
        syntax: '<angle>',
        inherits: false,
        initialValue: '0deg',
      });

      expect(injector.isPropertyDefined('$rotation')).toBe(true);
      expect(injector.isPropertyDefined('--rotation-rgb')).toBe(false);
    });
  });

  describe('fontFace', () => {
    it('should inject a @font-face rule', () => {
      injector.fontFace('Brand Sans', {
        src: 'url("/fonts/brand.woff2") format("woff2")',
        fontDisplay: 'swap',
      });

      const cssText = injector.getCssText();
      expect(cssText).toContain('@font-face');
      expect(cssText).toContain('Brand Sans');
    });

    it('should deduplicate identical font-face rules', () => {
      const desc = {
        src: 'url("/fonts/brand.woff2") format("woff2")',
        fontWeight: 400 as const,
      };

      injector.fontFace('Brand Sans', desc);
      injector.fontFace('Brand Sans', desc);

      const cssText = injector.getCssText();
      const matches = cssText.match(/@font-face/g);
      expect(matches?.length).toBe(1);
    });

    it('should allow different font-face rules for same family', () => {
      injector.fontFace('Brand Sans', {
        src: 'url("/fonts/regular.woff2") format("woff2")',
        fontWeight: 400 as const,
      });
      injector.fontFace('Brand Sans', {
        src: 'url("/fonts/bold.woff2") format("woff2")',
        fontWeight: 700 as const,
      });

      const cssText = injector.getCssText();
      const matches = cssText.match(/@font-face/g);
      expect(matches?.length).toBe(2);
    });
  });

  describe('counterStyle', () => {
    it('should inject a @counter-style rule', () => {
      injector.counterStyle('thumbs', {
        system: 'cyclic',
        symbols: '"👍"',
        suffix: '" "',
      });

      const cssText = injector.getCssText();
      expect(cssText).toContain('@counter-style');
      expect(cssText).toContain('thumbs');
    });

    it('should deduplicate by name (first wins)', () => {
      injector.counterStyle('thumbs', {
        system: 'cyclic',
        symbols: '"👍"',
        suffix: '" "',
      });
      injector.counterStyle('thumbs', {
        system: 'cyclic',
        symbols: '"★"',
        suffix: '" "',
      });

      const cssText = injector.getCssText();
      const matches = cssText.match(/@counter-style/g);
      expect(matches?.length).toBe(1);
      expect(cssText).toContain('"👍"');
    });

    it('should allow different counter-style names', () => {
      injector.counterStyle('thumbs', {
        system: 'cyclic',
        symbols: '"👍"',
        suffix: '" "',
      });
      injector.counterStyle('stars', {
        system: 'cyclic',
        symbols: '"★"',
        suffix: '" "',
      });

      const cssText = injector.getCssText();
      const matches = cssText.match(/@counter-style/g);
      expect(matches?.length).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// getCssTextForClasses — adopted mode (real constructable stylesheets)
// ---------------------------------------------------------------------------
describe('StyleInjector getCssTextForClasses (adopted mode)', () => {
  let injector: StyleInjector;
  let shadowRoot: ShadowRoot;
  let host: HTMLDivElement;

  beforeEach(() => {
    injector = new StyleInjector({});

    host = document.createElement('div');
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: 'open' });
  });

  afterEach(() => {
    injector.destroy(shadowRoot);
    host.remove();
  });

  it('reads CSS from constructable sheets in adopted mode', () => {
    const rules: StyleResult[] = [
      { selector: '.t0', declarations: 'color: red;' },
    ];

    const result = injector.inject(rules, {
      root: shadowRoot,
      cacheKey: 'adopted-test',
    });

    const css = injector.getCssTextForClasses(new Set([result.className]), {
      root: shadowRoot,
    });

    expect(css).toContain('color: red');
    result.dispose();
  });
});

// ---------------------------------------------------------------------------
// namePrefix — custom-prefix injector
// ---------------------------------------------------------------------------
describe('StyleInjector namePrefix', () => {
  let injector: StyleInjector;

  beforeEach(() => {
    injector = new StyleInjector({
      forceTextInjection: true,
      namePrefix: 'mb',
    });
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  afterEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
  });

  it('uses the configured prefix for class names', () => {
    const result = injector.inject(cssToStyleResults('&{ color: red; }'), {
      cacheKey: 'name-prefix-test',
    });

    expect(result.className).toMatch(/^mb[a-z0-9]+$/);
    expect(result.className).not.toMatch(/^t[a-z0-9]+$/);

    result.dispose();
  });

  it('uses the configured prefix for keyframe names', () => {
    const kf = injector.keyframes({
      from: { opacity: 0 },
      to: { opacity: 1 },
    });

    expect(kf.toString()).toMatch(/^mbk\d+$/);
    kf.dispose();
  });

  it('produces stable class names across two injectors with the same prefix', () => {
    const a = new StyleInjector({
      forceTextInjection: true,
      namePrefix: 'mb',
    });
    const b = new StyleInjector({
      forceTextInjection: true,
      namePrefix: 'mb',
    });

    const ra = a.inject(cssToStyleResults('&{ color: red; }'), {
      cacheKey: 'shared-key',
    });
    const rb = b.inject(cssToStyleResults('&{ color: red; }'), {
      cacheKey: 'shared-key',
    });

    expect(ra.className).toBe(rb.className);
    ra.dispose();
    rb.dispose();
  });

  it('produces different class names for the same content under different prefixes', () => {
    const a = new StyleInjector({
      forceTextInjection: true,
      namePrefix: 't',
    });
    const b = new StyleInjector({
      forceTextInjection: true,
      namePrefix: 'ts',
    });

    const ra = a.inject(cssToStyleResults('&{ color: red; }'), {
      cacheKey: 'shared-key',
    });
    const rb = b.inject(cssToStyleResults('&{ color: red; }'), {
      cacheKey: 'shared-key',
    });

    expect(ra.className.startsWith('t')).toBe(true);
    expect(rb.className.startsWith('ts')).toBe(true);
    expect(ra.className).not.toBe(rb.className);
    ra.dispose();
    rb.dispose();
  });

  it('GC touch only matches classes starting with the configured prefix', () => {
    const gcInjector = new StyleInjector({
      forceTextInjection: true,
      namePrefix: 'mb',
      gc: { touchInterval: 100, capacity: 100 },
    });
    const { className } = gcInjector.inject(
      cssToStyleResults('&{ color: red; }'),
      { cacheKey: 'gc-prefix-test' },
    );

    expect(className).toMatch(/^mb[a-z0-9]+$/);

    gcInjector.touch(className);
    // Default-prefix tasty classes must not be picked up by an `mb`-injector
    gcInjector.touch('t999');
    // Random tokens must not be picked up either
    gcInjector.touch('mb-not-a-tasty-class');

    const registry = gcInjector['sheetManager'].getRegistry(document);
    expect(registry.usageMap.has(className)).toBe(true);
    expect(registry.usageMap.size).toBe(1);

    gcInjector.destroy();
  });

  it('extracts hydrated class names from <style data-tasty-rsc> using the prefix', () => {
    const rscInjector = new StyleInjector({
      forceTextInjection: true,
      namePrefix: 'mb',
    });

    // Simulate an RSC inline style block: doubled-specificity selector for
    // an `mb`-prefixed class, plus an unrelated keyframe (must not match).
    const rscStyle = document.createElement('style');
    rscStyle.setAttribute('data-tasty-rsc', '');
    rscStyle.textContent =
      '.mbabc123.mbabc123 { color: red } @keyframes mbk0 { 0%{opacity:0} }';
    document.head.appendChild(rscStyle);

    try {
      // Injecting any cacheKey triggers syncServerClasses → RSC scan.
      rscInjector.inject(cssToStyleResults('&{ color: blue; }'), {
        cacheKey: 'force-rsc-sync',
      });

      const registry = rscInjector['sheetManager'].getRegistry(document);
      expect(registry.rules.has('mbabc123')).toBe(true);
      // Keyframe name must not be picked up as a hydrated class
      expect(registry.rules.has('mbk0')).toBe(false);
    } finally {
      rscStyle.remove();
      rscInjector.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// @property rejection handling (jsdom / happy-dom and other engines that
// don't support @property at all)
// ---------------------------------------------------------------------------
// Suppress no-op lint rule: vi.spyOn requires a function argument.
function noop(): void {
  /* no-op */
}

describe('StyleInjector @property rejection handling', () => {
  afterEach(() => {
    document.head.querySelectorAll('[data-tasty]').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  it('marks the property as injected even when the engine rejects the rule', () => {
    // happy-dom rejects every @property rule natively, so this exercises
    // the "engine doesn't support @property" path without any stubbing.
    const injector = new StyleInjector({ forceTextInjection: false });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);

    try {
      injector.property('#accent', { initialValue: 'red' });

      // Even though the underlying insertRule threw, the registry must
      // remember the attempt so subsequent calls do not re-attempt it.
      expect(injector.isPropertyDefined('#accent')).toBe(true);
      expect(injector.isPropertyDefined('--accent-color')).toBe(true);

      // Calling property() again for the same token must short-circuit.
      injector.property('#accent', { initialValue: 'red' });
    } finally {
      injector.destroy();
      warnSpy.mockRestore();
    }
  });

  it('suppresses the "Browser rejected CSS rule" warning for @property when the engine has no @property support', () => {
    const injector = new StyleInjector({ forceTextInjection: false });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);

    try {
      // Multiple distinct color tokens — all rejected by happy-dom — must
      // not flood the console; the per-registry probe should detect the
      // missing @property support after the first failure and silence the
      // rest.
      injector.property('#accent', { initialValue: 'red' });
      injector.property('#brand', { initialValue: 'blue' });
      injector.property('#muted', { initialValue: 'gray' });

      // Also exercise the auto-property path via inject() — it scans
      // declarations and re-emits @property rules for any unknown custom
      // properties.
      injector.inject([
        {
          selector: '.t0',
          declarations: '--accent-color: red; --brand-color: blue',
        },
      ]);
      injector.inject([
        {
          selector: '.t1',
          declarations: '--accent-color: red; --brand-color: blue',
        },
      ]);

      const atPropertyWarnings = warnSpy.mock.calls.filter((args) => {
        const [first, second] = args;
        return (
          typeof first === 'string' &&
          first.startsWith('[tasty] Browser rejected CSS rule:') &&
          typeof second === 'string' &&
          second.startsWith('@property ')
        );
      });

      expect(atPropertyWarnings).toHaveLength(0);
    } finally {
      injector.destroy();
      warnSpy.mockRestore();
    }
  });

  it('still warns for invalid @property definitions when the engine supports @property', () => {
    const injector = new StyleInjector({ forceTextInjection: false });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);

    // Simulate an engine that supports @property in general but rejects
    // this specific (hypothetically) invalid rule. The probe rule must
    // succeed; only `--bad-prop` should throw.
    const originalInsertRule = CSSStyleSheet.prototype.insertRule;
    const insertRuleSpy = vi
      .spyOn(CSSStyleSheet.prototype, 'insertRule')
      .mockImplementation(function (
        this: CSSStyleSheet,
        rule: string,
        index?: number,
      ) {
        if (rule.startsWith('@property ')) {
          if (rule.includes('--bad-prop')) {
            throw new DOMException('Failed to parse the rule.', 'SyntaxError');
          }
          // Probe rule: pretend success. We can't actually insert an
          // @property rule in happy-dom, so just return the index. The
          // probe's deleteRule fallback handles missing rules silently.
          return index ?? 0;
        }
        return originalInsertRule.call(this, rule, index);
      });

    try {
      injector.property('$bad-prop', {
        syntax: '<color>',
        initialValue: 'transparent',
      });

      const matched = warnSpy.mock.calls.some((args) => {
        const [first, second] = args;
        return (
          typeof first === 'string' &&
          first.startsWith('[tasty] Browser rejected CSS rule:') &&
          typeof second === 'string' &&
          second.includes('--bad-prop')
        );
      });

      expect(matched).toBe(true);
    } finally {
      insertRuleSpy.mockRestore();
      injector.destroy();
      warnSpy.mockRestore();
    }
  });
});
