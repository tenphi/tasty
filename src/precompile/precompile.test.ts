import type * as ChunksModule from '../chunks';

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

import { configure, resetConfig } from '../config';
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
import { getPrecompileStore } from './runtime';

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
          render: () => {
            useGlobalStyles('body', { color: 'red' });
            useRawCSS('html { min-height: 100%; }');
            useKeyframes(steps);
            computeStyles(componentStyles);
          },
        },
        {
          id: 'variant',
          render: () => computeStyles({ ...componentStyles, color: 'blue' }),
        },
      ],
    });

    expect(result.manifest.tastyVersion).toBe(TASTY_VERSION);
    expect(result.manifest.chunks.length).toBeGreaterThan(0);
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
      cases: [{ id: 'default', render: () => computeStyles(componentStyles) }],
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
          render: () => {
            useKeyframes(steps);
            useCounterStyle({ system: 'cyclic', symbols: '"•"' });
            computeStyles(componentStyles);
          },
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
      cases: [{ id: 'default', render: () => computeStyles(componentStyles) }],
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
    configure({});
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
      cases: [{ id: 'default', render: () => computeStyles(componentStyles) }],
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
              computeStyles({
                '@font-face': {
                  Unsafe: { src: 'url("fonts/unsafe.woff2")' },
                },
                display: 'block',
              }),
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
