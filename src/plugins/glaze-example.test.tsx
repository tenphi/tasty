/**
 * Pins the worked `glaze` plugin example from docs/plugins.md.
 *
 * It exercises the whole chain the docs promise: an object-valued custom prop on
 * every component, memoized styles, a plugin-supplied `@property`, the prop being
 * stripped from the DOM, and SSR/client class-name parity.
 */
import { render } from '@testing-library/react';

import { configure, resetConfig } from '../config';
import { computeStyles } from '../compute-styles';
import { getCSSText, isPropertyDefined } from '../injector';
import { ServerStyleCollector } from '../ssr/collector';
import { Element } from '../tasty';
import { mergeStyles } from '../utils/merge-styles';

import type { Styles } from '../styles/types';
import type { TastyPluginFactory } from './types';

interface GlazeConfig {
  tone: string;
  /** 0-100. Default 10. */
  intensity?: number;
}

type GlazeValue = string | GlazeConfig;

const cache = new Map<string, Styles>();

function glazeStyles(value: GlazeValue): Styles {
  const { tone, intensity = 10 } =
    typeof value === 'string' ? { tone: value, intensity: undefined } : value;
  const key = `${tone}:${intensity ?? 10}`;

  let styles = cache.get(key);

  if (!styles) {
    styles = Object.freeze({
      '#glaze-bg': `#${tone}.${intensity ?? 10}`,
      fill: '#glaze-bg',
      transition: 'fill 0.2s',
    }) as Styles;
    cache.set(key, styles);
  }

  return styles;
}

const glazePlugin: TastyPluginFactory = () => ({
  name: 'glaze',

  propHandlers: {
    glaze: (props) => {
      const { glaze, ...rest } = props;
      if (!glaze) return rest;

      return {
        ...rest,
        styles: mergeStyles(
          glazeStyles(glaze as GlazeValue),
          rest.styles as Styles,
        ),
      };
    },
  },

  properties: {
    '#glaze-bg': {
      syntax: '<color>',
      inherits: false,
      initialValue: 'transparent',
    },
  },
});

describe('docs/plugins.md glaze example', () => {
  beforeEach(() => {
    cache.clear();
    resetConfig();
  });

  afterEach(() => resetConfig());

  it('accepts a string value', () => {
    configure({ plugins: [glazePlugin()] });

    const { container } = render(<Element glaze="purple" />);
    const node = container.firstElementChild!;

    expect(node).not.toHaveAttribute('glaze');
    expect(node.className).not.toBe('');
    expect(getCSSText()).toContain('--glaze-bg-color');
  });

  it('accepts an object value — unambiguous because it is a prop', () => {
    configure({ plugins: [glazePlugin()] });

    const { container } = render(
      <Element glaze={{ tone: 'success', intensity: 30 }} />,
    );

    expect(container.firstElementChild!.className).not.toBe('');
    // 30% opacity, not the 10% default.
    expect(getCSSText()).toContain(
      'oklch(from var(--success-color) l c h / .30)',
    );
  });

  it('registers the plugin-supplied @property', () => {
    configure({ plugins: [glazePlugin()] });

    render(<Element glaze="purple" />);

    // @property rules live in the injector's property registry, not the rule
    // sheet that getCSSText() returns.
    expect(isPropertyDefined('--glaze-bg-color')).toBe(true);
  });

  it('returns a reference-stable styles object per value', () => {
    expect(glazeStyles('purple')).toBe(glazeStyles('purple'));
    expect(glazeStyles({ tone: 'purple' })).toBe(glazeStyles('purple'));
    expect(glazeStyles('purple')).not.toBe(glazeStyles('success'));
  });

  it('produces the same class names on the server and the client', () => {
    configure({ plugins: [glazePlugin()] });

    const clientClassName = render(<Element glaze="purple" />).container
      .firstElementChild!.className;

    // Same styles through the SSR collector path.
    const collector = new ServerStyleCollector();
    const server = computeStyles(
      mergeStyles(glazeStyles('purple'), undefined as never),
      { ssrCollector: collector },
    );

    expect(server.className).toBe(clientClassName);
  });
});
