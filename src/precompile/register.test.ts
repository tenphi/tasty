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

import { configure, getNamePrefix, resetConfig } from '../config';
import { computeStyles } from '../compute-styles';
import { tastyDebug } from '../debug';
import { destroy, getCSSText, injector } from '../injector';
import { useGlobalStyles } from '../hooks';
import { ServerStyleCollector } from '../ssr/collector';
import { hydrateTastyClasses } from '../ssr/hydrate';
import { disableDevWarnings, enableDevWarnings } from '../test/dev-env';
import { TASTY_VERSION } from '../version';

import { captureCompilationConfig } from './fingerprint';
import { installTastyPrecompiled, registerTastyPrecompiled } from './register';
import { beginPrecompileBuild, endPrecompileBuild } from './runtime';
import type { TastyPrecompiledManifest } from './types';

const styles = {
  '@property': {
    $catalogProgress: {
      syntax: '<number>',
      inherits: false,
      initialValue: 0,
    },
  },
  display: 'flex',
} as const;

function compileManifest(
  stylesToCompile: Parameters<typeof computeStyles>[0] = styles,
): {
  css: string;
  manifest: TastyPrecompiledManifest;
} {
  const collector = new ServerStyleCollector();
  collector.enablePrecompileRecording();
  beginPrecompileBuild();
  try {
    computeStyles(stylesToCompile, { ssrCollector: collector });
  } finally {
    endPrecompileBuild();
  }
  const css = collector
    .getArtifacts()
    .filter(({ source }) => source === 'component')
    .map(({ css: artifactCSS }) => artifactCSS)
    .join('\n');

  return {
    css,
    manifest: {
      schemaVersion: 2,
      id: '@test/browser-catalog',
      tastyVersion: TASTY_VERSION,
      namePrefix: getNamePrefix(),
      cssHash: 'browser-catalog-hash',
      compilationConfig: captureCompilationConfig(),
      stats: {
        cssSize: css.length,
        ruleCount: collector.getPrecompiledRuleCount(),
      },
      chunks: collector.getPrecompiledChunks(),
      dependencies: collector.getPrecompiledDependencies(),
    },
  };
}

/**
 * A chunk records its class name only when it cannot be derived from its key,
 * so a manifest reader has to resolve it the way the runtime does.
 */
function classNamesOf(manifest: TastyPrecompiledManifest): string[] {
  return manifest.chunks.map(
    (chunk) => chunk.className ?? manifest.namePrefix + chunk.key,
  );
}

beforeEach(() => {
  resetConfig();
  enableDevWarnings();
  configure({ forceTextInjection: true });
  renderCalls.value = 0;
});

afterEach(() => {
  destroy();
  document
    .querySelectorAll('[data-tasty-precompiled]')
    .forEach((element) => element.remove());
  disableDevWarnings();
  resetConfig();
});

describe('precompiled browser registration', () => {
  it('skips the pipeline for a normally hydrated non-keyframe chunk', () => {
    const artifact = compileManifest();
    const classNames = classNamesOf(artifact.manifest);
    hydrateTastyClasses(classNames);
    renderCalls.value = 0;

    const result = computeStyles(styles);

    expect(result.className).toBe(classNames.join(' '));
    expect(renderCalls.value).toBe(0);
  });

  it('returns a registered class without rendering or injecting its chunk', () => {
    const artifact = compileManifest();
    const expectedCalls = renderCalls.value;
    expect(expectedCalls).toBeGreaterThan(0);
    registerTastyPrecompiled(artifact.manifest);
    renderCalls.value = 0;

    const result = computeStyles(styles);

    expect(result.className).toBe(classNamesOf(artifact.manifest).join(' '));
    expect(renderCalls.value).toBe(0);
    expect(getCSSText()).not.toContain(`.${result.className}.`);
  });

  it('reports precompiled rules and cache hits separately in tastyDebug', () => {
    const artifact = compileManifest();
    installTastyPrecompiled(artifact);
    renderCalls.value = 0;

    computeStyles(styles);

    const summary = tastyDebug.summary({ raw: true });
    const installed = document.querySelector<HTMLStyleElement>(
      'style[data-tasty-precompiled]',
    );
    expect(summary.precompiledManifestCount).toBe(1);
    expect(summary.precompiledClasses).toEqual(
      classNamesOf(artifact.manifest).sort(),
    );
    expect(summary.precompiledCSSSize).toBe(artifact.css.length);
    expect(summary.precompiledRuleCount).toBe(
      artifact.manifest.stats.ruleCount,
    );
    expect(installed?.sheet?.cssRules.length).toBe(
      artifact.manifest.stats.ruleCount,
    );
    expect(summary.totalRuleCount).toBeGreaterThanOrEqual(
      artifact.manifest.stats.ruleCount,
    );
    expect(summary.metrics?.precompiledHits).toBe(
      artifact.manifest.chunks.length,
    );
    const uniqueClasses = [...new Set(classNamesOf(artifact.manifest))].sort();
    expect(summary.metrics?.precompiledUniqueHits).toBe(uniqueClasses.length);
    expect(summary.precompiledUsedClasses).toEqual(uniqueClasses);
    expect(summary.metrics?.hits).toBe(summary.metrics?.precompiledHits);
  });

  it('separates active runtime and precompiled coverage from repeated hits', () => {
    const artifact = compileManifest({ ...styles, color: 'red' });
    registerTastyPrecompiled(artifact.manifest);

    const result = computeStyles({ ...styles, color: 'blue' });
    computeStyles({ ...styles, color: 'blue' });
    const element = document.createElement('div');
    element.className = result.className;
    document.body.append(element);

    const summary = tastyDebug.summary({ raw: true });
    const status = tastyDebug.cache({ raw: true });

    expect(summary.activeClasses).toHaveLength(2);
    expect(summary.runtimeActiveClasses).toHaveLength(1);
    expect(summary.precompiledActiveClasses).toHaveLength(1);
    expect(summary.precompiledInactiveClasses).toHaveLength(1);
    expect(summary.precompiledUsedClasses).toEqual(
      summary.precompiledActiveClasses,
    );
    expect(summary.metrics?.precompiledHits).toBe(2);
    expect(summary.metrics?.precompiledUniqueHits).toBe(1);
    expect(status.classes.runtimeActive).toEqual(summary.runtimeActiveClasses);
    expect(status.classes.precompiledActive).toEqual(
      summary.precompiledActiveClasses,
    );
    expect(status.classes.precompiledInactive).toEqual(
      summary.precompiledInactiveClasses,
    );
    expect(status.classes.precompiledUsed).toEqual(
      summary.precompiledUsedClasses,
    );

    injector.instance.resetMetrics();
    const reset = tastyDebug.summary({ raw: true });
    expect(reset.precompiledUsedClasses).toEqual([]);
    expect(reset.metrics?.precompiledUniqueHits).toBe(0);
    element.remove();
  });

  it('reuses covered chunks and renders only an uncovered override chunk', () => {
    const artifact = compileManifest();
    registerTastyPrecompiled(artifact.manifest);
    renderCalls.value = 0;

    const result = computeStyles({ ...styles, color: 'blue' });

    expect(result.className).toContain(classNamesOf(artifact.manifest)[0]);
    expect(renderCalls.value).toBe(1);
    expect(getCSSText()).toContain('color: blue');
  });

  it('falls back to runtime generation inside a shadow root', () => {
    const artifact = compileManifest();
    registerTastyPrecompiled(artifact.manifest);
    renderCalls.value = 0;
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    document.body.append(host);

    const result = computeStyles(styles, { root });

    expect(renderCalls.value).toBeGreaterThan(0);
    expect(getCSSText({ root })).toContain(`.${result.className}.`);
    destroy(root);
    host.remove();
  });

  it('installs one immutable text block without suppressing runtime globals', () => {
    const artifact = compileManifest();
    const insertRule = vi.spyOn(CSSStyleSheet.prototype, 'insertRule');
    const textContent = vi.spyOn(Node.prototype, 'textContent', 'set');

    installTastyPrecompiled(artifact, { nonce: 'catalog-nonce' });
    installTastyPrecompiled(artifact, { nonce: 'catalog-nonce' });

    const installed = document.querySelectorAll<HTMLStyleElement>(
      'style[data-tasty-precompiled]',
    );
    expect(installed).toHaveLength(1);
    expect(installed[0].textContent).toBe(artifact.css);
    expect(installed[0].nonce).toBe('catalog-nonce');
    expect(installed[0].hasAttribute('data-tasty-ssr')).toBe(false);
    expect(insertRule).not.toHaveBeenCalled();
    expect(textContent).toHaveBeenCalledTimes(1);
    textContent.mockRestore();

    computeStyles(styles);
    useGlobalStyles('body', { color: 'red' });
    const css = Array.from(document.querySelectorAll('style'))
      .map((element) => element.textContent ?? '')
      .join('\n');
    expect(css.match(/@property --catalogProgress/g)).toHaveLength(1);
    expect(css).toContain('body');
    expect(css).toContain('color: red');
    expect(insertRule).not.toHaveBeenCalled();
    insertRule.mockRestore();
  });

  it('keeps precompiled properties strong over configured definitions', () => {
    const artifact = compileManifest();
    resetConfig();
    installTastyPrecompiled(artifact);
    configure({
      forceTextInjection: true,
      properties: {
        $catalogProgress: {
          syntax: '<number>',
          inherits: false,
          initialValue: 99,
        },
      },
    });

    computeStyles(styles);

    const css = Array.from(document.querySelectorAll('style'))
      .map((element) => element.textContent ?? '')
      .join('\n');
    expect(css.match(/@property --catalogProgress/g)).toHaveLength(1);
    expect(css).not.toContain('initial-value: 99');
  });

  it('supports registration before configure and rejects late text installation', () => {
    const artifact = compileManifest();
    resetConfig();
    registerTastyPrecompiled(artifact.manifest);
    configure({ forceTextInjection: true });

    renderCalls.value = 0;
    expect(computeStyles(styles).className).toBeTruthy();
    expect(renderCalls.value).toBe(0);

    expect(() => installTastyPrecompiled(artifact)).toThrow(
      'must run before the first Tasty render',
    );
  });
});
