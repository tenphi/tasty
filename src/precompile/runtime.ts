import type { StyleInjector } from '../injector/injector';
import type { RSCStyleCache } from '../rsc-cache';
import { isDevEnv } from '../utils/is-dev-env';

import type {
  TastyPrecompiledChunk,
  TastyPrecompiledDependencies,
  TastyPrecompiledManifest,
} from './types';

export interface RegisteredChunk extends TastyPrecompiledChunk {
  manifestId: string;
  namePrefix: string;
}

export interface PrecompileStore {
  manifests: Map<string, TastyPrecompiledManifest> | null;
  chunks: Map<string, RegisteredChunk> | null;
  dependencies: Map<string, TastyPrecompiledDependencies> | null;
  buildCount: number;
  active: boolean;
  revision: number;
  /**
   * `revision` at which the registered catalogs were last checked against the
   * host's configuration. `-1` means never.
   */
  validatedRevision: number;
  /**
   * Configuration check, installed by the registration module.
   *
   * Held as a reference rather than imported here so that the comparison code
   * ships with `precompile/register` instead of with `core`, which every
   * application pays for whether or not it registers a catalog.
   */
  validate: (() => void) | null;
  warnings: Set<string> | null;
}

const STORE_KEY = Symbol.for('@tenphi/tasty/precompiled/v1');
const globalStore = globalThis as typeof globalThis & {
  [STORE_KEY]?: PrecompileStore;
};

const store = (globalStore[STORE_KEY] ??= {
  manifests: null,
  chunks: null,
  dependencies: null,
  buildCount: 0,
  active: false,
  validatedRevision: -1,
  validate: null,
  revision: 0,
  warnings: null,
});

const EMPTY_DEPENDENCIES: TastyPrecompiledDependencies = Object.freeze({
  properties: Object.freeze([]),
  keyframes: Object.freeze([]),
  fontFaces: Object.freeze([]),
  counterStyles: Object.freeze([]),
  functions: Object.freeze([]),
  rscKeys: Object.freeze([]),
});

export function getPrecompileStore(): PrecompileStore {
  return store;
}

export function warnPrecompileOnce(key: string, message: string): void {
  if (!isDevEnv()) return;
  const warnings = (store.warnings ??= new Set());
  if (warnings.has(key)) return;
  warnings.add(key);
  console.warn(message);
}

/** Shared single-read gate for the unregistered render hot path. */
export const precompileRuntimeState = store;

/** @internal Keep catalog recording on the isolated compiler path. */
export function beginPrecompileBuild(): void {
  store.buildCount = (store.buildCount ?? 0) + 1;
  store.active = true;
}

/** @internal Balance beginPrecompileBuild(), including failed catalog cases. */
export function endPrecompileBuild(): void {
  store.buildCount--;
  if (store.buildCount === 0 && store.chunks === null) store.active = false;
}

export function findPrecompiledChunk(
  lookupKey: string,
  namePrefix: string,
): TastyPrecompiledChunk | null {
  // The first lookup is the first moment the host's configuration is final:
  // registration is a side-effect import that normally runs before the host
  // calls `configure()`. Cheap after that — it returns on a revision check.
  store.validate?.();

  const chunk = store.chunks?.get(lookupKey);
  if (!chunk) return null;
  if (chunk.namePrefix !== namePrefix) {
    warnPrecompileOnce(
      `prefix:${chunk.manifestId}:${namePrefix}`,
      `[Tasty] Ignoring precompiled styles "${chunk.manifestId}": generated with namePrefix "${chunk.namePrefix}", but the runtime uses "${namePrefix}".`,
    );
    return null;
  }
  return chunk;
}

export function getPrecompiledRevision(): number {
  return store.revision;
}

export function getRegisteredPrecompiledDependencies(
  namePrefix: string,
): TastyPrecompiledDependencies {
  // The single choke point for dependency exposure — browser, SSR and RSC all
  // arrive here — and it runs BEFORE any chunk lookup. Validating only at
  // lookup time let an incompatible manifest seed `@property` and keyframe
  // metadata first; fallback generation then saw those definitions as already
  // present and skipped the rules it should have emitted. A manifest that
  // contributes only dependencies may never reach a lookup at all.
  store.validate?.();

  return store.dependencies?.get(namePrefix) ?? EMPTY_DEPENDENCIES;
}

export interface RegisteredPrecompiledStats {
  manifestCount: number;
  classNames: string[];
  cssSize: number;
  ruleCount: number;
}

/** @internal Metadata used by tastyDebug without reading or parsing CSSOM. */
export function getRegisteredPrecompiledStats(
  namePrefix: string,
): RegisteredPrecompiledStats {
  const classNames = new Set<string>();
  let manifestCount = 0;
  let cssSize = 0;
  let ruleCount = 0;

  for (const manifest of store.manifests?.values() ?? []) {
    if (manifest.namePrefix !== namePrefix) continue;
    manifestCount++;
    cssSize += manifest.stats.cssSize;
    ruleCount += manifest.stats.ruleCount;
    for (const chunk of manifest.chunks) classNames.add(chunk.className);
  }

  return {
    manifestCount,
    classNames: [...classNames],
    cssSize,
    ruleCount,
  };
}

export function applyRegisteredDependenciesToInjector(
  injector: StyleInjector,
  namePrefix: string,
): void {
  if (!store.manifests) return;
  injector.registerPrecompiledDependencies(
    getRegisteredPrecompiledDependencies(namePrefix),
    store.revision,
  );
}

export function applyRegisteredDependenciesToRSC(
  cache: RSCStyleCache,
  namePrefix: string,
): void {
  if (cache.precompiledRevision === store.revision) return;
  for (const key of cache.precompiledEmittedKeys) {
    cache.emittedKeys.delete(key);
  }
  for (const [key, name] of cache.precompiledGeneratedNames) {
    if (cache.generatedNames.get(key) === name)
      cache.generatedNames.delete(key);
  }
  cache.precompiledEmittedKeys.clear();
  cache.precompiledGeneratedNames.clear();

  if (!store.manifests) {
    cache.precompiledRevision = store.revision;
    return;
  }
  const dependencies = getRegisteredPrecompiledDependencies(namePrefix);
  for (const key of dependencies.rscKeys) {
    cache.emittedKeys.add(key);
    cache.precompiledEmittedKeys.add(key);
  }
  for (const item of dependencies.keyframes) {
    for (const key of item.rscKeys) {
      cache.emittedKeys.add(key);
      cache.generatedNames.set(key, item.name);
      cache.precompiledEmittedKeys.add(key);
      cache.precompiledGeneratedNames.set(key, item.name);
    }
  }
  for (const item of dependencies.counterStyles) {
    for (const key of item.rscKeys) {
      cache.emittedKeys.add(key);
      cache.generatedNames.set(key, item.name);
      cache.precompiledEmittedKeys.add(key);
      cache.precompiledGeneratedNames.set(key, item.name);
    }
  }
  cache.precompiledRevision = store.revision;
}

/** @internal Test-only reset; resetConfig() calls this to isolate suites. */
export function resetPrecompiledStyles(): void {
  store.manifests = null;
  store.chunks = null;
  store.dependencies = null;
  store.buildCount = 0;
  store.active = false;
  store.revision++;
  store.warnings?.clear();
}
