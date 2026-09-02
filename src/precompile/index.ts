import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

import { getNamePrefix } from '../config';
import { getSSRCollector, runWithCollector } from '../ssr/async-storage';
import { ServerStyleCollector } from '../ssr/collector';
import { findUnsafeCSSResource } from '../ssr/css-resources';
import { registerSSRCollectorGetterGlobal } from '../ssr/ssr-collector-ref';
import { TASTY_VERSION } from '../version';

import { captureCompilationConfig } from './fingerprint';
import {
  beginPrecompileBuild,
  endPrecompileBuild,
  resolveChunkClassName,
} from './runtime';
import type {
  TastyPrecompileCase,
  TastyPrecompileCaseReport,
  TastyPrecompileResult,
} from './types';

registerSSRCollectorGetterGlobal(getSSRCollector);

export type {
  PrecompiledCounterStyleCacheEntry,
  PrecompiledKeyframeCacheEntry,
  PrecompiledPropertyCacheEntry,
  TastyPrecompileCase,
  TastyCompilationConfig,
  TastyPrecompileCaseReport,
  TastyPrecompileResult,
  TastyPrecompiledChunk,
  TastyPrecompiledDependencies,
  TastyPrecompiledManifest,
  TastyPrecompiledStats,
  TastyStyleArtifactSource,
} from './types';

export { registerTastyPrecompiled, installTastyPrecompiled } from './register';

/**
 * The class names a collector has covered so far.
 *
 * A chunk records its class name only when it cannot be derived from its key,
 * so the report has to resolve it the same way the runtime does.
 */
function collectedClassNames(collector: ServerStyleCollector): string[] {
  const namePrefix = getNamePrefix();
  return collector
    .getPrecompiledChunks()
    .map((chunk) => resolveChunkClassName(chunk, namePrefix));
}

export async function precompileTastyStyles(options: {
  id: string;
  cases: readonly TastyPrecompileCase[];
}): Promise<TastyPrecompileResult> {
  if (!options.id.trim()) {
    throw new Error('[Tasty] precompileTastyStyles() requires a non-empty id.');
  }

  const caseIds = new Set<string>();
  for (const item of options.cases) {
    if (!item.id.trim()) {
      throw new Error(
        '[Tasty] Every precompile catalog case requires a non-empty id.',
      );
    }
    if (caseIds.has(item.id)) {
      throw new Error(
        `[Tasty] Duplicate precompile catalog case id "${item.id}".`,
      );
    }
    caseIds.add(item.id);
  }

  // Captured before any case renders. Rendering registers style handlers
  // lazily, so a snapshot taken afterwards would record which styles the
  // catalog happened to use rather than how the host configured Tasty.
  const compilationConfig = captureCompilationConfig();

  const collector = new ServerStyleCollector();
  collector.enablePrecompileRecording();
  collector.collectInternals();

  const reports: TastyPrecompileCaseReport[] = [];
  beginPrecompileBuild();
  try {
    for (const item of options.cases) {
      const classesBefore = new Set(collectedClassNames(collector));
      const artifactsBefore = new Set(
        collector
          .getArtifacts()
          .filter(({ source }) => source === 'component')
          .map(({ id }) => id),
      );

      await runWithCollector(collector, async () => {
        const tree = await item.render();
        renderToStaticMarkup(tree);
      });

      const addedClasses = collectedClassNames(collector).filter(
        (className) => !classesBefore.has(className),
      );
      const addedArtifacts = collector
        .getArtifacts()
        .filter(
          ({ id, source }) =>
            source === 'component' && !artifactsBefore.has(id),
        )
        .map(({ id }) => id);

      reports.push({ caseId: item.id, addedClasses, addedArtifacts });
    }
  } finally {
    endPrecompileBuild();
  }

  const artifacts = collector
    .getArtifacts()
    .filter(({ source }) => source === 'component');

  for (const artifact of artifacts) {
    const unsafe = findUnsafeCSSResource(artifact.css, false);
    if (unsafe) {
      throw new Error(
        `[Tasty] Precompiled stylesheet "${options.id}" cannot preserve page-relative CSS URL "${unsafe.url}" in ${artifact.kind} artifact ${artifact.id}. Use an absolute URL, a data URL, or a root-relative URL such as url(/path/to/asset).`,
      );
    }
  }

  const css = artifacts.map(({ css }) => css).join('\n');
  const cssHash = createHash('sha256').update(css).digest('hex');

  return {
    css,
    manifest: {
      schemaVersion: 2,
      id: options.id,
      tastyVersion: TASTY_VERSION,
      namePrefix: getNamePrefix(),
      cssHash,
      compilationConfig,
      stats: {
        cssSize: css.length,
        ruleCount: collector.getPrecompiledRuleCount(),
      },
      chunks: collector.getPrecompiledChunks(),
      dependencies: collector.getPrecompiledDependencies(),
    },
    report: reports,
  };
}
