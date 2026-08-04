/**
 * `configure({ propHandlers })` — props middleware for every tasty component.
 *
 * Components are created **inside** each `it()`: `resetConfig()` does not clear the
 * factory-level `classNameCache` or the `propsToCheck` memo in `tasty.tsx`, so a
 * module-scope component would carry state across tests.
 */
import { render } from '@testing-library/react';

import { configure, resetConfig } from './config';
import { getCSSText } from './injector';
import { propHandlerRegistry, resetPropHandlers } from './prop-handlers';
import { tasty } from './tasty';
import { mergeStyles } from './utils/merge-styles';

describe('propHandlers', () => {
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

  describe('fast path', () => {
    it('leaves the chain null while nothing is registered', () => {
      expect(propHandlerRegistry.apply).toBeNull();
    });

    it('clears the chain on resetConfig()', () => {
      configure({ propHandlers: { glaze: (props) => props } });
      expect(propHandlerRegistry.apply).not.toBeNull();

      resetConfig();

      expect(propHandlerRegistry.apply).toBeNull();
      expect(propHandlerRegistry.list).toHaveLength(0);
    });
  });

  describe('styles injection', () => {
    it('injects styles and strips the custom prop from the DOM', () => {
      configure({
        propHandlers: {
          glaze: (props) => {
            const { glaze, ...rest } = props;
            if (!glaze) return rest;

            return {
              ...rest,
              styles: mergeStyles(
                { '#glaze-bg': '#purple.10', fill: '#glaze-bg' },
                rest.styles as never,
              ),
            };
          },
        },
      });

      const Box = tasty({ qa: 'Box' });
      const { getByTestId } = render(<Box glaze="soft" />);
      const node = getByTestId('Box');

      expect(node).not.toHaveAttribute('glaze');
      expect(node.className).not.toBe('');
      expect(getCSSText()).toContain('--glaze-bg-color');
    });

    it('loses to a style prop and beats a factory default', () => {
      configure({
        propHandlers: {
          glaze: (props) => {
            const { glaze, ...rest } = props;
            if (!glaze) return rest;

            return {
              ...rest,
              styles: mergeStyles({ color: '#purple' }, rest.styles as never),
            };
          },
        },
      });

      // Injected styles occupy the `styles` slot in
      // mergeStyles(baseStyles, styles, propStyles).
      const Text = tasty({
        qa: 'Text',
        styles: { color: '#dark' },
        styleProps: ['color'],
      });

      const first = render(<Text glaze="on" />);
      const beatsDefault = first.getByTestId('Text').className;
      expect(getCSSText()).toContain('--purple-color');
      first.unmount();

      const losesToProp = render(
        <Text glaze="on" color="#success" />,
      ).getByTestId('Text').className;

      expect(beatsDefault).not.toBe(losesToProp);
      expect(getCSSText()).toContain('--success-color');
    });
  });

  describe('reach', () => {
    it('can rewrite mods, tokens, variant and as', () => {
      configure({
        propHandlers: {
          fancy: (props) => {
            const { fancy: _fancy, ...rest } = props;

            return {
              ...rest,
              as: 'section',
              variant: 'special',
              mods: { active: true },
              tokens: { $size: '4px' },
            };
          },
        },
      });

      const Box = tasty({
        qa: 'Box',
        variants: {
          default: { color: '#dark' },
          special: { color: '#purple' },
        },
      });

      const node = render(<Box fancy />).getByTestId('Box');

      expect(node.tagName).toBe('SECTION');
      expect(node).toHaveAttribute('data-active');
      expect(node.getAttribute('style')).toContain('--size');
      expect(getCSSText()).toContain('--purple-color');
    });

    it('can set is* props, which still become HTML attributes', () => {
      configure({
        propHandlers: {
          locked: (props) => {
            const { locked: _locked, ...rest } = props;
            return { ...rest, isDisabled: true };
          },
        },
      });

      const Button = tasty({ as: 'button', qa: 'Button' });
      const node = render(<Button locked />).getByTestId('Button');

      expect(node).toBeDisabled();
      expect(node).toHaveAttribute('data-disabled');
    });
  });

  describe('triggering', () => {
    it('skips a handler whose trigger prop is absent', () => {
      const calls: string[] = [];

      configure({
        propHandlers: {
          glaze: (props) => {
            calls.push('glaze');
            return props;
          },
        },
      });

      const Box = tasty({ qa: 'Box' });

      render(<Box />);
      expect(calls).toEqual([]);

      render(<Box glaze="soft" />);
      expect(calls).toEqual(['glaze']);
    });

    it('runs a `*` handler unconditionally', () => {
      const calls: string[] = [];

      configure({
        propHandlers: {
          audit: [
            '*',
            (props) => {
              calls.push('audit');
              return props;
            },
          ],
        },
      });

      render(<>{createBox()}</>);
      expect(calls).toEqual(['audit']);

      function createBox() {
        const Box = tasty({ qa: 'Box' });
        return <Box />;
      }
    });

    it('accepts several trigger props', () => {
      const seen: string[] = [];

      configure({
        propHandlers: {
          tone: [
            ['glaze', 'tint'],
            (props) => {
              seen.push(Object.keys(props).join(','));
              const { glaze: _g, tint: _t, ...rest } = props;
              return rest;
            },
          ],
        },
      });

      const Box = tasty({ qa: 'Box' });

      render(<Box tint="warm" />);

      expect(seen).toEqual(['tint']);
    });
  });

  describe('chaining', () => {
    it('runs handlers in registration order, plugins before direct config', () => {
      const order: string[] = [];

      configure({
        plugins: [
          {
            name: 'p1',
            propHandlers: {
              a: [
                '*',
                (props) => {
                  order.push('plugin-a');
                  return props;
                },
              ],
            },
          },
        ],
        propHandlers: {
          b: [
            '*',
            (props) => {
              order.push('config-b');
              return props;
            },
          ],
        },
      });

      const Box = tasty({ qa: 'Box' });
      render(<Box />);

      expect(order).toEqual(['plugin-a', 'config-b']);
    });

    it('threads each handler’s output into the next', () => {
      configure({
        propHandlers: {
          first: (props) => {
            const { first: _first, ...rest } = props;
            return { ...rest, second: 'from-first' };
          },
          second: (props) => {
            const { second, ...rest } = props;
            return { ...rest, 'data-seen': String(second) };
          },
        },
      });

      const Box = tasty({ qa: 'Box' });
      const node = render(<Box first />).getByTestId('Box');

      expect(node).toHaveAttribute('data-seen', 'from-first');
    });

    it('lets a later registration replace a key in place', () => {
      const order: string[] = [];

      configure({
        plugins: [
          {
            name: 'p1',
            propHandlers: {
              shared: [
                '*',
                (props) => {
                  order.push('plugin');
                  return props;
                },
              ],
            },
          },
        ],
        propHandlers: {
          shared: [
            '*',
            (props) => {
              order.push('config');
              return props;
            },
          ],
        },
      });

      const Box = tasty({ qa: 'Box' });
      render(<Box />);

      // Last wins, and there is only one handler under that key.
      expect(order).toEqual(['config']);
    });
  });

  describe('invalid returns', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    it.each([
      ['undefined', () => undefined],
      ['null', () => null],
    ])('treats a %s return as unchanged and warns', (label, fn) => {
      resetPropHandlers();
      configure({ propHandlers: { glaze: ['*', fn as never] } });

      const Box = tasty({ qa: 'Box', styles: { color: '#dark' } });
      const node = render(<Box />).getByTestId('Box');

      expect(node.className).not.toBe('');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`returned ${label}`),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('return props'),
      );
    });

    it('ignores a non-object return and warns', () => {
      configure({
        propHandlers: { glaze: ['*', (() => 'nope') as never] },
      });

      const Box = tasty({ qa: 'Box', styles: { color: '#dark' } });
      render(<Box />);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('must return a props object'),
      );
    });

    it('rejects a malformed definition at registration', () => {
      expect(() =>
        configure({ propHandlers: { glaze: ['glaze', 'not-a-fn'] as never } }),
      ).toThrow(/must have a function as the second element/);
    });
  });

  describe('configuration lock', () => {
    it('is rejected after styles have been generated', () => {
      const Box = tasty({ qa: 'Box', styles: { color: '#dark' } });
      render(<Box />);

      configure({ propHandlers: { glaze: (props) => props } });

      // configure() bails wholesale once styles exist, so nothing is registered.
      // The accompanying warning uses config.ts's module-load dev gate, which is
      // off under NODE_ENV=test, so only the effect is asserted here.
      expect(propHandlerRegistry.apply).toBeNull();
      expect(propHandlerRegistry.list).toHaveLength(0);
    });
  });

  describe('sub-elements', () => {
    it('are unaffected — they have no styles prop to inject into', () => {
      const calls: string[] = [];

      configure({
        propHandlers: {
          glaze: [
            '*',
            (props) => {
              calls.push('run');
              return props;
            },
          ],
        },
      });

      const Card = tasty({ qa: 'Card', elements: { Title: 'h3' } });

      render(
        <Card>
          <Card.Title>Hi</Card.Title>
        </Card>,
      );

      // Once for Card, not again for Card.Title.
      expect(calls).toEqual(['run']);
    });
  });
});
