import { computeStyles } from '../compute-styles';
import { configure, resetConfig } from '../config';
import { useGlobalStyles } from '../hooks/useGlobalStyles';
import type * as RSCModule from '../rsc-cache';
import type { RSCStyleCache } from '../rsc-cache';
import type { Styles } from '../styles/types';

// The entry, not its modules: importing it registers the collector lookup.
import { createServerStyleCollector, runWithCollector } from './index';

const { rscTarget } = vi.hoisted(() => ({
  rscTarget: { cache: null as RSCStyleCache | null },
}));

// Without a collector, a DOM-less render is an RSC render; point it at a cache
// the test can read back.
vi.mock('../rsc-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof RSCModule>();
  return {
    ...actual,
    getRSCCache: () => rscTarget.cache ?? actual.getRSCCache(),
    getStyleTarget: () =>
      rscTarget.cache
        ? { mode: 'rsc' as const, cache: rscTarget.cache }
        : actual.getStyleTarget(),
  };
});

const spinner: Styles = {
  animation: 'spin 1s linear infinite',
  '@keyframes': {
    spin: {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  },
};

/** Collected CSS, without the `@property` preamble every collector emits. */
function collect(render: () => void): string {
  const collector = createServerStyleCollector();
  runWithCollector(collector, render);
  return collector
    .getCSS()
    .split('\n')
    .filter((line) => !line.startsWith('@property'))
    .join('\n');
}

afterEach(() => {
  rscTarget.cache = null;
  resetConfig();
});

describe('useGlobalStyles on the server', () => {
  it('wraps @starting values in @starting-style', () => {
    const css = collect(() =>
      useGlobalStyles('.toast', {
        opacity: { '': 1, '@starting': 0 },
        transition: 'opacity 0.2s',
      }),
    );

    expect(css).toBe(
      '.toast { opacity: 1; transition: opacity 0.2s; }\n' +
        '.toast { @starting-style { opacity: 0; } }',
    );
  });

  it('emits local @keyframes under the name the class path uses', () => {
    const css = collect(() => {
      useGlobalStyles('.spinner', spinner);
      computeStyles(spinner);
    });

    const names = [...css.matchAll(/@keyframes (\S+)/g)].map((m) => m[1]);
    expect(names).toEqual([expect.stringMatching(/^spin-\w+$/)]);
    expect(css).toContain(
      `.spinner { animation: ${names[0]} 1s linear infinite; }`,
    );
    expect(css).toMatch(
      new RegExp(`\\.t\\w+\\.t\\w+ \\{ animation: ${names[0]} 1s`),
    );
  });

  it('emits configured keyframes that global styles animate', () => {
    configure({ keyframes: { fade: { from: { opacity: 0 } } } });

    const css = collect(() =>
      useGlobalStyles('.toast', { animation: 'fade 1s' }),
    );

    const name = /@keyframes (\S+)/.exec(css)?.[1];
    expect(name).toMatch(/^fade-\w+$/);
    expect(css).toContain(`.toast { animation: ${name} 1s; }`);
  });

  it('gives every item of a selector list the states and sub-elements', () => {
    const css = collect(() =>
      useGlobalStyles('.card, .panel', {
        fill: { '': '#white', selected: '#blue' },
        Icon: { color: '#red' },
      }),
    );

    expect(css).toContain(
      '.card:where([data-selected]), .panel:where([data-selected]) {',
    );
    expect(css).toContain(
      '.card [data-element="Icon"], .panel [data-element="Icon"] {',
    );
  });
});

describe('configured globals on the server', () => {
  it('defines tokens keyed by @root() states on the root itself', () => {
    configure({
      states: {
        '@dark':
          '@root(schema=dark) | (!@root(schema) & @media(prefers-color-scheme: dark))',
      },
      tokens: { '#primary': { '': '#purple', '@dark': '#light-purple' } },
    });

    const css = collect(() => computeStyles({ fill: '#primary' }));
    const tokenRules = css
      .split('\n')
      .filter((line) => line.includes('--primary-color:'));

    expect(tokenRules).toEqual([
      '@media (not (prefers-color-scheme: dark)) { :root:where(:not([data-schema="dark"])) { --primary-color: var(--purple-color); } }',
      '@media (prefers-color-scheme: dark) { :root:where(:not([data-schema="dark"])[data-schema]) { --primary-color: var(--purple-color); } }',
      ':root:where([data-schema="dark"]) { --primary-color: var(--light-purple-color); }',
      '@media (prefers-color-scheme: dark) { :root:where(:not([data-schema])) { --primary-color: var(--light-purple-color); } }',
    ]);
  });

  it('emits keyframes that configured global styles animate', () => {
    configure({
      keyframes: { fade: { from: { opacity: 0 } } },
      globalStyles: {
        '.spinner': spinner,
        '.toast': { animation: 'fade 1s' },
      },
    });

    const css = collect(() => computeStyles({ display: 'block' }));
    const names = [...css.matchAll(/@keyframes (\S+)/g)].map((m) => m[1]);

    expect(names).toEqual([
      expect.stringMatching(/^spin-\w+$/),
      expect.stringMatching(/^fade-\w+$/),
    ]);
    expect(css).toContain(
      `.spinner { animation: ${names[0]} 1s linear infinite; }`,
    );
    expect(css).toContain(`.toast { animation: ${names[1]} 1s; }`);
  });
});

describe('keyframes configured in another module copy', () => {
  it('resolve the same way for classes and global styles', () => {
    // What a configure() in a separate module graph (Astro) leaves behind.
    (globalThis as Record<string, unknown>).__tasty_cfg_keyframes__ = {
      fade: { from: { opacity: 0 } },
    };

    const css = collect(() => {
      computeStyles({ animation: 'fade 1s' });
      useGlobalStyles('.toast', { animation: 'fade 2s' });
    });
    const names = [...css.matchAll(/@keyframes (\S+)/g)].map((m) => m[1]);

    expect(names).toEqual([expect.stringMatching(/^fade-\w+$/)]);
    expect(css).toMatch(new RegExp(`\\{ animation: ${names[0]} 1s; \\}`));
    expect(css).toContain(`.toast { animation: ${names[0]} 2s; }`);
  });
});

describe('useGlobalStyles in React Server Components', () => {
  const createCache = (): RSCStyleCache => ({
    cacheKeyToClassName: new Map(),
    emittedKeys: new Set(),
    internalsEmitted: false,
    pendingCSS: [],
    keyToIndex: new Map(),
    generatedNames: new Map(),
  });

  it('emits @starting-style and keyframes inline', () => {
    const cache = createCache();
    rscTarget.cache = cache;

    useGlobalStyles('.spinner', {
      ...spinner,
      opacity: { '': 1, '@starting': 0 },
    });

    const css = cache.pendingCSS.join('\n');
    const name = /@keyframes (\S+)/.exec(css)?.[1];

    expect(name).toMatch(/^spin-\w+$/);
    expect(css).toContain(`animation: ${name} 1s linear infinite;`);
    expect(css).toContain('.spinner { @starting-style { opacity: 0; } }');
  });

  it('hands pending CSS to a component that renders no class', () => {
    rscTarget.cache = createCache();

    useGlobalStyles('.spinner', spinner);
    const { className, css } = computeStyles({ fill: false });

    expect(className).toBe('');
    expect(css).toMatch(/@keyframes spin-\w+/);
    expect(css).toContain('.spinner { animation: spin-');
  });
});
