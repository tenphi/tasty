import type * as ChunksModule from '../chunks';
import { createElement } from 'react';

const { renderCalls } = vi.hoisted(() => ({ renderCalls: { value: 0 } }));

vi.mock('../chunks', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ChunksModule;
  return {
    ...actual,
    renderStylesForChunk: (
      ...args: Parameters<typeof actual.renderStylesForChunk>
    ) => {
      renderCalls.value++;
      return actual.renderStylesForChunk(...args);
    },
  };
});

import { configure, getNamePrefix, resetConfig } from '../config';
import { computeStyles } from '../compute-styles';
import {
  useCounterStyle,
  useGlobalStyles,
  useKeyframes,
  useRawCSS,
} from '../hooks';
import { ServerStyleCollector } from '../ssr/collector';
import { TASTY_VERSION } from '../version';

import { precompileTastyStyles } from './index';
import { registerTastyPrecompiled } from './register';
import {
  getPrecompileStore,
  getRegisteredPrecompiledDependencies,
} from './runtime';

const steps = {
  from: { opacity: 0 },
  to: { opacity: 1 },
};

const componentStyles = {
  '@property': {
    $progress: {
      syntax: '<number>',
      inherits: false,
      initialValue: 0,
    },
  },
  '@keyframes': { spin: steps },
  '@font-face': {
    Catalog: {
      src: 'url("/fonts/catalog.woff2") format("woff2")',
      fontDisplay: 'swap' as const,
    },
  },
  '@counter-style': {
    dots: { system: 'cyclic', symbols: '"•"' },
  },
  '@function': {
    $$identity: { args: ['$value'], result: '$value' },
  },
  display: 'flex',
  animation: 'spin 1s linear',
  marginTop: '$$identity(4px)',
} as const;

function ExecuteCatalogCase({ run }: { run: () => void }) {
  run();
  return null;
}

function catalogTree(run: () => void) {
  return createElement(ExecuteCatalogCase, { run });
}

beforeEach(() => {
  resetConfig();
  renderCalls.value = 0;
  configure({
    tokens: { $catalogGap: '8px' },
    globalStyles: { body: { margin: 0 } },
  });
});

afterEach(() => {
  resetConfig();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('precompileTastyStyles', () => {
  it('does not allocate or consult manifest maps on the disabled path', () => {
    const store = getPrecompileStore();
    expect(store.active).toBe(false);
    expect(store.manifests).toBeNull();
    expect(store.chunks).toBeNull();

    computeStyles({ display: 'block' });

    expect(renderCalls.value).toBeGreaterThan(0);
    expect(store.manifests).toBeNull();
    expect(store.chunks).toBeNull();
  });

  it('extracts component artifacts, reports case deltas, and excludes globals', async () => {
    const result = await precompileTastyStyles({
      id: '@test/catalog',
      cases: [
        {
          id: 'default',
          render: () =>
            catalogTree(() => {
              useGlobalStyles('body', { color: 'red' });
              useRawCSS('html { min-height: 100%; }');
              useKeyframes(steps);
              computeStyles(componentStyles);
            }),
        },
        {
          id: 'variant',
          render: () =>
            catalogTree(() =>
              computeStyles({ ...componentStyles, color: 'blue' }),
            ),
        },
      ],
    });

    expect(result.manifest.tastyVersion).toBe(TASTY_VERSION);
    expect(result.manifest.chunks.length).toBeGreaterThan(0);
    expect(result.manifest.stats).toEqual({
      cssSize: result.css.length,
      ruleCount: expect.any(Number),
    });
    expect(result.manifest.stats.ruleCount).toBeGreaterThan(0);
    expect(result.manifest.dependencies.properties).toContainEqual(
      expect.objectContaining({ name: '--progress' }),
    );
    expect(result.manifest.dependencies.keyframes.length).toBeGreaterThan(0);
    expect(result.manifest.dependencies.fontFaces).toHaveLength(1);
    expect(result.manifest.dependencies.counterStyles).toContainEqual(
      expect.objectContaining({ name: 'dots' }),
    );
    expect(result.manifest.dependencies.functions).toContain('--identity');
    expect(result.css).toContain('@keyframes spin-');
    expect(result.css).toContain('@font-face');
    expect(result.css).toContain('@counter-style dots');
    expect(result.css).toContain('@function --identity');
    expect(result.css).not.toContain('min-height: 100%');
    expect(result.css).not.toContain('body');
    expect(result.css).not.toContain('--catalog-gap');
    expect(result.report).toHaveLength(2);
    expect(result.report[0].addedClasses.length).toBeGreaterThan(0);
    expect(result.report[1].addedClasses.length).toBeGreaterThan(0);
  });

  it('retains a dependency also present in build configuration', async () => {
    resetConfig();
    configure({
      fontFaces: componentStyles['@font-face'],
      counterStyles: componentStyles['@counter-style'],
      functions: componentStyles['@function'],
    });

    const result = await precompileTastyStyles({
      id: '@test/shared-config-dependency',
      cases: [
        {
          id: 'default',
          render: () => catalogTree(() => computeStyles(componentStyles)),
        },
      ],
    });

    expect(result.css).toContain('@font-face');
    expect(result.css).toContain('@counter-style dots');
    expect(result.css).toContain('@function --identity');
    expect(result.manifest.dependencies.fontFaces).toHaveLength(1);
    expect(result.manifest.dependencies.counterStyles).toContainEqual(
      expect.objectContaining({ name: 'dots' }),
    );
    expect(result.manifest.dependencies.functions).toContain('--identity');
  });

  it('uses a registered lookup before rendering the pipeline on SSR', async () => {
    const result = await precompileTastyStyles({
      id: '@test/fast-path',
      cases: [
        {
          id: 'default',
          render: () =>
            catalogTree(() => {
              useKeyframes(steps);
              useCounterStyle({ system: 'cyclic', symbols: '"•"' });
              computeStyles(componentStyles);
            }),
        },
      ],
    });
    const compileCalls = renderCalls.value;
    expect(compileCalls).toBeGreaterThan(0);

    registerTastyPrecompiled(result.manifest);
    renderCalls.value = 0;

    const standaloneKeyframes = useKeyframes(steps);
    const standaloneCounter = useCounterStyle({
      system: 'cyclic',
      symbols: '"•"',
    });
    expect(standaloneKeyframes).toMatch(/^tk[a-z0-9]+$/);
    expect(standaloneCounter).toMatch(/^tc[a-z0-9]+$/);

    const rsc = computeStyles(componentStyles);
    expect(rsc.className).toBe(
      result.manifest.chunks.map(({ className }) => className).join(' '),
    );
    expect(rsc.css).toBeUndefined();
    expect(renderCalls.value).toBe(0);

    const collector = new ServerStyleCollector();
    const rendered = computeStyles(componentStyles, {
      ssrCollector: collector,
    });

    expect(rendered.className).toBe(
      result.manifest.chunks.map(({ className }) => className).join(' '),
    );
    expect(renderCalls.value).toBe(0);
    expect(
      collector.getArtifacts().some(({ source }) => source === 'component'),
    ).toBe(false);
    expect(collector.flushCSS()).not.toContain(`.${rendered.className}.`);

    // Model a streaming boundary: configured internals are flushed before the
    // component renders, and a covered component contributes no later chunk or
    // ancillary CSS to the stream.
    const streamingCollector = new ServerStyleCollector();
    streamingCollector.collectInternals();
    streamingCollector.flushCSS();
    renderCalls.value = 0;

    const streamed = computeStyles(componentStyles, {
      ssrCollector: streamingCollector,
    });

    expect(streamed.className).toBe(rendered.className);
    expect(renderCalls.value).toBe(0);
    expect(streamingCollector.flushCSS()).toBe('');
  });

  it('falls back safely for incompatible and conflicting manifests', async () => {
    const result = await precompileTastyStyles({
      id: '@test/conflicts',
      cases: [
        {
          id: 'default',
          render: () => catalogTree(() => computeStyles(componentStyles)),
        },
      ],
    });
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    registerTastyPrecompiled({
      ...result.manifest,
      tastyVersion: '0.0.0-incompatible',
    });
    renderCalls.value = 0;
    expect(computeStyles(componentStyles).className).toBeTruthy();
    expect(renderCalls.value).toBeGreaterThan(0);

    resetConfig();
    configure({ namePrefix: 'x' });
    registerTastyPrecompiled(result.manifest);
    renderCalls.value = 0;
    expect(computeStyles(componentStyles).className).toMatch(/^x/);
    expect(renderCalls.value).toBeGreaterThan(0);

    resetConfig();
    // Same configuration the catalog was compiled under — `beforeEach` sets
    // these, and a dropped token is now a real divergence. This scenario is
    // about conflicting manifests, not configuration drift.
    configure({
      tokens: { $catalogGap: '8px' },
      globalStyles: { body: { margin: 0 } },
    });
    registerTastyPrecompiled(result.manifest);
    registerTastyPrecompiled({
      ...result.manifest,
      cssHash: 'different-css',
      chunks: result.manifest.chunks.map((chunk) => ({
        ...chunk,
        className: `${chunk.className}-conflict`,
      })),
    });
    registerTastyPrecompiled({
      ...result.manifest,
      id: '@test/lookup-conflict',
      cssHash: 'lookup-conflict-css',
      chunks: result.manifest.chunks.map((chunk) => ({
        ...chunk,
        className: `${chunk.className}-other`,
      })),
    });
    renderCalls.value = 0;
    expect(computeStyles(componentStyles).className).toBe(
      result.manifest.chunks.map(({ className }) => className).join(' '),
    );
    expect(renderCalls.value).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it('misses when a keyframe-dependent chunk resolves different animation names', async () => {
    const result = await precompileTastyStyles({
      id: '@test/keyframe-lookup',
      cases: [
        {
          id: 'default',
          render: () => catalogTree(() => computeStyles(componentStyles)),
        },
      ],
    });
    registerTastyPrecompiled(result.manifest);
    renderCalls.value = 0;

    computeStyles({
      ...componentStyles,
      '@keyframes': {
        spin: { from: { opacity: 1 }, to: { opacity: 0 } },
      },
    });

    expect(renderCalls.value).toBeGreaterThan(0);
  });

  it('rejects unsafe extracted resource URLs and duplicate case ids', async () => {
    await expect(
      precompileTastyStyles({
        id: '@test/unsafe',
        cases: [
          {
            id: 'font',
            render: () =>
              catalogTree(() =>
                computeStyles({
                  '@font-face': {
                    Unsafe: { src: 'url("fonts/unsafe.woff2")' },
                  },
                  display: 'block',
                }),
              ),
          },
        ],
      }),
    ).rejects.toThrow('page-relative CSS URL');

    await expect(
      precompileTastyStyles({
        id: '@test/duplicate',
        cases: [
          { id: 'same', render: () => undefined },
          { id: 'same', render: () => undefined },
        ],
      }),
    ).rejects.toThrow('Duplicate precompile catalog case id');
  });
});

/**
 * A lookup key hashes the style *source* (`gap: "1x"`), not the CSS it produced,
 * so a host that redefines what `1x` means still hits every catalog chunk and
 * would be served CSS its own configuration would never generate. Nothing about
 * a unit, recipe, handler or state override changes a key, which is why the
 * manifest carries the configuration it was compiled under.
 */
describe('compilation configuration guard', () => {
  const catalogStyles = { display: 'flex', gap: '1x' } as const;

  async function compileWith(
    setup: () => void,
  ): Promise<Awaited<ReturnType<typeof precompileTastyStyles>>> {
    resetConfig();
    setup();
    return precompileTastyStyles({
      id: '@test/config-guard',
      cases: [
        {
          id: 'default',
          render: () => catalogTree(() => computeStyles(catalogStyles)),
        },
      ],
    });
  }

  it('keeps the catalog when the host only adds names it never compiled', async () => {
    const result = await compileWith(() =>
      configure({ units: { x: 'var(--gap)' } }),
    );

    // Exactly what a design system's consumer does: extra states of its own,
    // nothing the catalog compiled against redefined.
    resetConfig();
    configure({
      units: { x: 'var(--gap)' },
      states: { '@mobile': '@media(w < 920px)' },
      recipes: { appCard: { padding: '1x' } },
    });
    registerTastyPrecompiled(result.manifest);

    renderCalls.value = 0;
    expect(computeStyles(catalogStyles).className).toBe(
      result.manifest.chunks.map(({ className }) => className).join(' '),
    );
    expect(renderCalls.value).toBe(0);
  });

  it('drops the catalog when the host redefines a unit it compiled against', async () => {
    const result = await compileWith(() =>
      configure({ units: { x: 'var(--gap)' } }),
    );

    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    resetConfig();
    configure({ units: { x: 'var(--my-gap)' } });
    registerTastyPrecompiled(result.manifest);

    renderCalls.value = 0;
    const { className } = computeStyles(catalogStyles);

    // The class name is unchanged — it hashes `gap: "1x"`, not the CSS that
    // `1x` expands to. That identity is exactly why serving the catalog here
    // was silent, and why the guard cannot be a lookup-time comparison.
    expect(className).toBe(
      result.manifest.chunks.map((chunk) => chunk.className).join(' '),
    );
    // Rendered rather than served, so the rule carries this host's `--my-gap`.
    expect(renderCalls.value).toBeGreaterThan(0);
    expect(warn.mock.calls.flat().join(' ')).toContain('unit:x changed');
    expect(getPrecompileStore().manifests?.has('@test/config-guard')).toBe(
      false,
    );
  });

  it('drops the catalog when the host overrides a built-in style handler', async () => {
    const result = await compileWith(() => configure({}));

    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    resetConfig();
    configure({
      handlers: { gap: ({ gap }: { gap?: string }) => ({ gap: gap ?? '0' }) },
    });
    registerTastyPrecompiled(result.manifest);

    renderCalls.value = 0;
    computeStyles(catalogStyles);

    expect(renderCalls.value).toBeGreaterThan(0);
    expect(warn.mock.calls.flat().join(' ')).toContain('handler:gap added');
  });

  it('serves this host CSS rather than the catalog CSS it invalidated', async () => {
    const result = await compileWith(() =>
      configure({ units: { x: 'var(--gap)' } }),
    );
    expect(result.css).toContain('var(--gap)');

    resetConfig();
    configure({ units: { x: 'var(--my-gap)' } });
    registerTastyPrecompiled(result.manifest);

    const collector = new ServerStyleCollector();
    computeStyles(catalogStyles, { ssrCollector: collector });
    const css = collector
      .getArtifacts()
      .filter(({ source }) => source === 'component')
      .map(({ css: artifactCSS }) => artifactCSS)
      .join('\n');

    expect(css).toContain('var(--my-gap)');
    expect(css).not.toContain('var(--gap)');
  });

  it('drops the catalog when a replacement token it compiled against changes', async () => {
    // The sharpest version of the same trap as the unit case above: a token's
    // value never reaches a chunk cache key — the key hashes `color: "#brand"`,
    // not what `#brand` resolves to — so without the fingerprint this hits and
    // serves the old colour.
    const result = await compileWith(() =>
      configure({ tokens: { '#brand': '#ff0000' } }),
    );

    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    resetConfig();
    configure({ tokens: { '#brand': '#00ff00' } });
    registerTastyPrecompiled(result.manifest);

    renderCalls.value = 0;
    computeStyles(catalogStyles);

    expect(renderCalls.value).toBeGreaterThan(0);
    expect(warn.mock.calls.flat().join(' ')).toContain('token:');
  });

  it('validates before an incompatible manifest can seed dependencies', async () => {
    // Dependencies are applied before any chunk lookup, and a manifest that
    // only contributes them may never reach a lookup at all. Seeding first let
    // a rejected catalog mark `@property` definitions as already present, so
    // fallback generation skipped the rules it should have emitted.
    const result = await compileWith(() =>
      configure({ units: { x: 'var(--gap)' } }),
    );

    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    resetConfig();
    configure({ units: { x: 'var(--my-gap)' } });
    registerTastyPrecompiled(result.manifest);

    // Asking for dependencies — what the injector, SSR and RSC paths all do
    // first — must already have rejected it.
    getRegisteredPrecompiledDependencies(getNamePrefix());

    expect(getPrecompileStore().manifests?.size ?? 0).toBe(0);
  });

  it('rejects a manifest that predates the recorded configuration', async () => {
    const result = await compileWith(() => configure({}));

    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { compilationConfig: _dropped, ...legacy } = result.manifest;
    registerTastyPrecompiled(legacy as typeof result.manifest);

    expect(getPrecompileStore().manifests?.size ?? 0).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});
