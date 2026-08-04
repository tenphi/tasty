/**
 * Registration-time behaviour of custom style handlers: chunk alignment, the
 * displacement warning, and dependency-name inference.
 *
 * Components are not involved here, but note for anything that renders: since
 * `resetConfig()` does not clear factory-level caches in `tasty.tsx`, components
 * must be created inside `it()`.
 */
import { CHUNK_NAMES, STYLE_TO_CHUNK } from '../chunks/style-chunk-map';
import { configure, resetConfig } from '../config';
import { renderStyles } from '../pipeline';
import { setWarningHandler } from '../pipeline/warnings';
import { styleHandlers } from '../styles';

import { defineHandler } from './define-handler';

describe('custom handler registration', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetConfig();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    resetConfig();
    vi.unstubAllEnvs();
  });

  describe('chunk alignment', () => {
    it('pulls unknown dependency names into their handler’s chunk', () => {
      // `fill` lives in the appearance chunk; `glaze` is unknown and would
      // otherwise land in `misc`, splitting the handler across two chunks.
      expect(STYLE_TO_CHUNK.get('fill')).toBe(CHUNK_NAMES.APPEARANCE);
      expect(STYLE_TO_CHUNK.get('glaze')).toBeUndefined();

      configure({
        handlers: {
          glaze: [
            ['fill', 'glaze'],
            ({ fill, glaze }) =>
              glaze ? { 'background-color': String(fill ?? glaze) } : undefined,
          ],
        },
      });

      expect(STYLE_TO_CHUNK.get('glaze')).toBe(CHUNK_NAMES.APPEARANCE);
    });

    it('invokes a mixed-dependency handler once with all dependencies', () => {
      const calls: unknown[] = [];

      configure({
        handlers: {
          glaze: [
            ['fill', 'glaze'],
            (props) => {
              calls.push({ ...props });
              return { 'background-color': 'red' };
            },
          ],
        },
      });

      renderStyles({ fill: '#purple', glaze: 'soft' }, '.chunk-test');

      // Before chunk alignment this ran twice — once per chunk — each time with
      // only half of its declared dependencies.
      expect(calls).toEqual([{ fill: '#purple', glaze: 'soft' }]);
    });

    it('keeps all-unknown dependency names together in misc', () => {
      configure({
        handlers: {
          glaze: [
            ['glaze', 'glazeTone'],
            ({ glaze }) => (glaze ? { filter: 'blur(1px)' } : undefined),
          ],
        },
      });

      expect(STYLE_TO_CHUNK.get('glaze')).toBe(CHUNK_NAMES.MISC);
      expect(STYLE_TO_CHUNK.get('glazeTone')).toBe(CHUNK_NAMES.MISC);
    });

    it('warns when a handler bridges two built-in chunks', () => {
      vi.stubEnv('NODE_ENV', 'development');

      // `fill` is appearance, `padding` is position — a genuine conflict that
      // cannot be fixed without re-chunking built-in styles.
      configure({
        handlers: {
          spacing: [['fill', 'padding'], () => ({ color: 'red' })],
        },
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('depends on styles from different chunks'),
      );
    });

    it('restores built-in chunk assignments on resetConfig()', () => {
      configure({
        handlers: {
          glaze: [['fill', 'glaze'], () => ({ color: 'red' })],
        },
      });
      expect(STYLE_TO_CHUNK.get('glaze')).toBe(CHUNK_NAMES.APPEARANCE);

      resetConfig();

      expect(STYLE_TO_CHUNK.get('glaze')).toBeUndefined();
      expect(STYLE_TO_CHUNK.get('fill')).toBe(CHUNK_NAMES.APPEARANCE);
    });
  });

  describe('displacement warning', () => {
    it('names the styles a replaced built-in handler also handled', () => {
      vi.stubEnv('NODE_ENV', 'development');

      // displayStyle also emits hide/overflow/whiteSpace/textOverflow, and
      // gapStyle + flowStyle are registered under `display` too.
      configure({
        handlers: {
          display: ({ display }) =>
            display ? { display: String(display) } : undefined,
        },
      });

      const message = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((text) => text.includes('displaced'));

      expect(message).toBeDefined();
      for (const orphaned of ['flow', 'gap', 'hide', 'whiteSpace']) {
        expect(message).toContain(orphaned);
      }
      expect(message).toContain('configure()');
    });

    it('names the plugin a handler came from', () => {
      vi.stubEnv('NODE_ENV', 'development');

      configure({
        plugins: [
          {
            name: 'my-plugin',
            handlers: {
              display: ({ display }) =>
                display ? { display: String(display) } : undefined,
            },
          },
        ],
      });

      const message = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((text) => text.includes('displaced'));

      expect(message).toContain('plugin "my-plugin"');
    });

    it('does not warn when the replacement covers every displaced style', () => {
      vi.stubEnv('NODE_ENV', 'development');

      // svgFillStyle's only lookup style is `svgFill`, so nothing is orphaned.
      configure({
        handlers: {
          svgFill: ({ svgFill }) =>
            svgFill ? { fill: String(svgFill) } : undefined,
        },
      });

      const message = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((text) => text.includes('displaced'));

      expect(message).toBeUndefined();
    });

    it('warns that overriding `fill` orphans the background-* family', () => {
      vi.stubEnv('NODE_ENV', 'development');

      // Worth pinning: `fill` is the handler most likely to be overridden (it is
      // the worked example in docs/configuration.md), and fillStyle also emits
      // `image` and the whole background-* family.
      configure({
        handlers: {
          fill: ({ fill }) =>
            fill ? { 'background-color': String(fill) } : undefined,
        },
      });

      const message = warnSpy.mock.calls
        .map((call) => String(call[0]))
        .find((text) => text.includes('displaced'));

      expect(message).toBeDefined();
      for (const orphaned of ['image', 'backgroundColor', 'backgroundImage']) {
        expect(message).toContain(orphaned);
      }
    });
  });

  describe('handler results', () => {
    it('accepts numeric declaration values', () => {
      configure({
        handlers: {
          clamp: ({ clamp }) =>
            clamp ? { '-webkit-line-clamp': Number(clamp) } : undefined,
        },
      });

      const rules = renderStyles({ clamp: 3 }, '.num-test');

      expect(rules[0].declarations).toContain('-webkit-line-clamp: 3');
    });

    it('warns when a handler returns a camelCase CSS property name', () => {
      vi.stubEnv('NODE_ENV', 'development');

      const codes: string[] = [];
      setWarningHandler((warning) => codes.push(warning.code));

      try {
        configure({
          handlers: {
            // Wrong: CSS property names must be kebab-case.
            wonky: ({ wonky }) =>
              wonky ? { backgroundColor: String(wonky) } : undefined,
          },
        });

        renderStyles({ wonky: 'red' }, '.camel-test');
      } finally {
        setWarningHandler(null);
      }

      expect(codes).toContain('HANDLER_CAMEL_CASE_KEY');
    });

    it('does not warn for custom properties, which are case-sensitive', () => {
      vi.stubEnv('NODE_ENV', 'development');

      const codes: string[] = [];
      setWarningHandler((warning) => codes.push(warning.code));

      try {
        configure({
          handlers: {
            wonky: ({ wonky }) =>
              wonky ? { '--myGlazeVar': String(wonky) } : undefined,
          },
        });

        renderStyles({ wonky: 'red' }, '.custom-prop-test');
      } finally {
        setWarningHandler(null);
      }

      expect(codes).not.toContain('HANDLER_CAMEL_CASE_KEY');
    });
  });

  describe('documented fill override', () => {
    it('keeps image working when the whole group is declared', () => {
      // Pins the worked example in docs/configuration.md. Declaring the whole
      // group and delegating to styleHandlers.fill is what keeps `image` alive.
      configure({
        handlers: {
          fill: defineHandler(
            [
              'fill',
              'backgroundColor',
              'image',
              'backgroundImage',
              'backgroundPosition',
              'backgroundSize',
              'backgroundRepeat',
            ],
            (props) => {
              if (
                typeof props.fill === 'string' &&
                props.fill.startsWith('gradient:')
              ) {
                return { background: props.fill.slice(9) };
              }
              return styleHandlers.fill(props);
            },
          ),
        },
      });

      expect(
        renderStyles({ fill: 'gradient:red' }, '.doc-a')[0].declarations,
      ).toContain('background: red');

      // The delegated path still handles the rest of the group.
      expect(
        renderStyles({ image: 'url(a.png)' }, '.doc-b')[0].declarations,
      ).toContain('url(a.png)');
    });
  });

  describe('defineHandler', () => {
    it('registers a multi-dependency handler with inferred dependencies', () => {
      configure({
        handlers: {
          spacing: defineHandler(['fill', 'glaze'], ({ fill, glaze }) =>
            glaze ? { 'background-color': String(fill ?? glaze) } : undefined,
          ),
        },
      });

      const rules = renderStyles(
        { fill: 'rgb(1 2 3)', glaze: 'soft' },
        '.define-test',
      );

      expect(rules[0].declarations).toContain('background-color: rgb(1 2 3)');
    });
  });
});
