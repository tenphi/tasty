import { TASTY_VERSION } from '../version';

import {
  captureCompilationConfig,
  diffCompilationConfig,
  isCompilationConfigShapeValid,
} from './fingerprint';
import {
  getPrecompileStore,
  resolveChunkClassName,
  warnPrecompileOnce,
} from './runtime';
import type { RegisteredChunk } from './runtime';
import type {
  TastyCompilationConfig,
  TastyPrecompiledDependencies,
  TastyPrecompiledManifest,
} from './types';

const isStringArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const EMPTY_ANIMATIONS: readonly string[] = Object.freeze([]);

/**
 * The documented workflow imports a manifest from JSON and casts it, so the
 * shape is only as good as the file — and the input is `unknown` here for that
 * reason. Checking that a dependency field is an array is not enough:
 * `keyframes: [{}]` would pass and then throw while iterating `item.rscKeys`
 * in `mergeDependencies`, and `chunks: [null]` would throw inside the
 * validator itself. Nor is optional chaining enough at the top level: `null`
 * survives `manifest?.dependencies` and then throws on `manifest.schemaVersion`
 * before registration can warn. A malformed manifest should be warned about
 * and ignored, never crash registration.
 */
function isManifestShapeValid(
  manifest: unknown,
): manifest is TastyPrecompiledManifest {
  if (!isRecord(manifest)) return false;
  const dependencies = manifest.dependencies;
  const stats = manifest.stats;
  return (
    manifest.schemaVersion === 2 &&
    isCompilationConfigShapeValid(
      manifest.compilationConfig as TastyCompilationConfig | undefined,
    ) &&
    typeof manifest.id === 'string' &&
    manifest.id.length > 0 &&
    typeof manifest.tastyVersion === 'string' &&
    typeof manifest.namePrefix === 'string' &&
    typeof manifest.cssHash === 'string' &&
    manifest.cssHash.length > 0 &&
    isRecord(stats) &&
    Number.isSafeInteger(stats.cssSize) &&
    (stats.cssSize as number) >= 0 &&
    Number.isSafeInteger(stats.ruleCount) &&
    (stats.ruleCount as number) >= 0 &&
    Array.isArray(manifest.chunks) &&
    manifest.chunks.every(
      (chunk) =>
        isRecord(chunk) &&
        typeof chunk.key === 'string' &&
        chunk.key.length > 0 &&
        (chunk.className === undefined ||
          typeof chunk.className === 'string') &&
        (chunk.animations === undefined || isStringArray(chunk.animations)),
    ) &&
    isRecord(dependencies) &&
    Array.isArray(dependencies.properties) &&
    dependencies.properties.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === 'string' &&
        typeof item.definition === 'string',
    ) &&
    Array.isArray(dependencies.keyframes) &&
    dependencies.keyframes.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === 'string' &&
        typeof item.contentKey === 'string' &&
        isStringArray(item.rscKeys),
    ) &&
    isStringArray(dependencies.fontFaces) &&
    Array.isArray(dependencies.counterStyles) &&
    dependencies.counterStyles.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === 'string' &&
        isStringArray(item.rscKeys),
    ) &&
    isStringArray(dependencies.functions) &&
    isStringArray(dependencies.rscKeys)
  );
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function mergeDependencies(
  current: TastyPrecompiledDependencies | undefined,
  next: TastyPrecompiledDependencies,
): TastyPrecompiledDependencies {
  const properties = new Map(
    current?.properties.map((item) => [item.name, item.definition]),
  );
  const keyframes = new Map<
    string,
    { name: string; contentKey: string; rscKeys: Set<string> }
  >();
  const counterStyles = new Map<string, Set<string>>();

  for (const item of current?.keyframes ?? []) {
    keyframes.set(item.contentKey, {
      ...item,
      rscKeys: new Set(item.rscKeys),
    });
  }
  for (const item of current?.counterStyles ?? []) {
    counterStyles.set(item.name, new Set(item.rscKeys));
  }

  for (const item of next.properties) {
    if (!properties.has(item.name)) properties.set(item.name, item.definition);
  }
  for (const item of next.keyframes) {
    let entry = keyframes.get(item.contentKey);
    if (!entry) {
      entry = { ...item, rscKeys: new Set() };
      keyframes.set(item.contentKey, entry);
    }
    for (const key of item.rscKeys) entry.rscKeys.add(key);
  }
  for (const item of next.counterStyles) {
    let keys = counterStyles.get(item.name);
    if (!keys) {
      keys = new Set();
      counterStyles.set(item.name, keys);
    }
    for (const key of item.rscKeys) keys.add(key);
  }

  return {
    properties: [...properties].map(([name, definition]) => ({
      name,
      definition,
    })),
    keyframes: [...keyframes.values()].map((item) => ({
      ...item,
      rscKeys: [...item.rscKeys],
    })),
    fontFaces: [...new Set([...(current?.fontFaces ?? []), ...next.fontFaces])],
    counterStyles: [...counterStyles].map(([name, rscKeys]) => ({
      name,
      rscKeys: [...rscKeys],
    })),
    functions: [...new Set([...(current?.functions ?? []), ...next.functions])],
    rscKeys: [...new Set([...(current?.rscKeys ?? []), ...next.rscKeys])],
  };
}

/** Register one immutable stylesheet manifest. Returns whether it is usable. */
export function registerPrecompiledManifest(
  manifest: TastyPrecompiledManifest,
): boolean {
  if (!isManifestShapeValid(manifest)) {
    warnPrecompileOnce(
      `invalid:${(manifest as TastyPrecompiledManifest | null)?.id ?? 'unknown'}`,
      '[Tasty] Ignoring an invalid precompiled style manifest.',
    );
    return false;
  }

  if (manifest.tastyVersion !== TASTY_VERSION) {
    warnPrecompileOnce(
      `version:${manifest.id}:${manifest.tastyVersion}`,
      `[Tasty] Ignoring precompiled styles "${manifest.id}": generated by Tasty ${manifest.tastyVersion}, but the runtime is ${TASTY_VERSION}.`,
    );
    return false;
  }

  const store = getPrecompileStore();
  const existingManifest = store.manifests?.get(manifest.id);
  if (existingManifest) {
    if (existingManifest.cssHash === manifest.cssHash) return true;
    warnPrecompileOnce(
      `manifest-conflict:${manifest.id}`,
      `[Tasty] Ignoring conflicting precompiled styles "${manifest.id}": the id is already registered with a different CSS hash.`,
    );
    return false;
  }

  const manifestChunks = new Map<string, RegisteredChunk>();
  for (const chunk of manifest.chunks) {
    const resolved: RegisteredChunk = {
      className: resolveChunkClassName(chunk, manifest.namePrefix),
      animations: chunk.animations ?? EMPTY_ANIMATIONS,
      manifestId: manifest.id,
      namePrefix: manifest.namePrefix,
    };

    const duplicate = manifestChunks.get(chunk.key);
    if (
      duplicate &&
      (duplicate.className !== resolved.className ||
        !sameStrings(duplicate.animations, resolved.animations))
    ) {
      warnPrecompileOnce(
        `internal-chunk-conflict:${manifest.id}:${chunk.key}`,
        `[Tasty] Ignoring precompiled styles "${manifest.id}": the manifest maps one chunk lookup key more than once with different metadata.`,
      );
      return false;
    }
    manifestChunks.set(chunk.key, resolved);

    const existing = store.chunks?.get(chunk.key);
    if (
      existing &&
      (existing.className !== resolved.className ||
        !sameStrings(existing.animations, resolved.animations))
    ) {
      warnPrecompileOnce(
        `chunk-conflict:${chunk.key}`,
        `[Tasty] Ignoring precompiled styles "${manifest.id}": a chunk lookup key is already mapped to different metadata by "${existing.manifestId}".`,
      );
      return false;
    }
  }

  if (store.manifests) {
    const propertyDefinitions = new Map<string, string>();
    const keyframeNames = new Map<string, string>();
    const keyframeContents = new Map<string, string>();
    for (const registered of store.manifests.values()) {
      for (const item of registered.dependencies.properties) {
        propertyDefinitions.set(item.name, item.definition);
      }
      for (const item of registered.dependencies.keyframes) {
        keyframeNames.set(item.name, item.contentKey);
        keyframeContents.set(item.contentKey, item.name);
      }
    }
    for (const item of manifest.dependencies.properties) {
      const existing = propertyDefinitions.get(item.name);
      if (existing !== undefined && existing !== item.definition) {
        warnPrecompileOnce(
          `property-conflict:${item.name}`,
          `[Tasty] Ignoring precompiled styles "${manifest.id}": @property ${item.name} conflicts with an already registered manifest.`,
        );
        return false;
      }
    }
    for (const item of manifest.dependencies.keyframes) {
      const contentForName = keyframeNames.get(item.name);
      const nameForContent = keyframeContents.get(item.contentKey);
      if (
        (contentForName !== undefined && contentForName !== item.contentKey) ||
        (nameForContent !== undefined && nameForContent !== item.name)
      ) {
        warnPrecompileOnce(
          `keyframes-conflict:${item.name}:${item.contentKey}`,
          `[Tasty] Ignoring precompiled styles "${manifest.id}": its keyframe cache metadata conflicts with an already registered manifest.`,
        );
        return false;
      }
    }
  }

  const manifests = (store.manifests ??= new Map());
  const chunks = (store.chunks ??= new Map());
  const dependencies = (store.dependencies ??= new Map());
  manifests.set(manifest.id, manifest);
  dependencies.set(
    manifest.namePrefix,
    mergeDependencies(
      dependencies.get(manifest.namePrefix),
      manifest.dependencies,
    ),
  );
  for (const [key, chunk] of manifestChunks) {
    if (!chunks.has(key)) chunks.set(key, chunk);
  }
  store.active = true;
  store.revision++;
  store.validate = ensurePrecompiledConfigValidated;
  return true;
}

/**
 * Drop every catalog whose recorded configuration no longer matches this host's.
 *
 * Deferred to the moment the config locks rather than run at registration: the
 * registration module is a side-effect import, so it routinely executes before
 * the host's own `configure()` call and there is nothing final to compare yet.
 *
 * A lookup key is a hash of the style *source*, not of the CSS it produced, so
 * a host that redefines a unit, handler, recipe or chunk assignment the catalog
 * compiled against still hits — and would be served CSS its own configuration
 * would never generate. Disabling the catalog costs the lookup and falls back
 * to runtime generation, which is always correct.
 *
 * @internal
 */
export function validatePrecompiledCompilationConfig(): void {
  const store = getPrecompileStore();
  if (!store.manifests?.size) return;

  const runtime = captureCompilationConfig();
  const rejected: string[] = [];

  for (const manifest of store.manifests.values()) {
    const reasons = diffCompilationConfig(manifest.compilationConfig, runtime);
    if (reasons.length === 0) continue;

    rejected.push(manifest.id);
    warnPrecompileOnce(
      `config-mismatch:${manifest.id}`,
      `[Tasty] Ignoring precompiled styles "${manifest.id}": this application's configuration differs from the one the catalog was compiled under, so its CSS is not what these settings would produce. Falling back to runtime generation. Differences: ${reasons.join(', ')}.`,
    );
  }

  if (rejected.length === 0) return;

  for (const id of rejected) store.manifests.delete(id);

  // Rebuild rather than subtract: a lookup key dropped by one catalog may still
  // be provided by another that is still valid.
  const chunks = (store.chunks ??= new Map());
  const dependencies = (store.dependencies ??= new Map());
  chunks.clear();
  dependencies.clear();

  for (const manifest of store.manifests.values()) {
    dependencies.set(
      manifest.namePrefix,
      mergeDependencies(
        dependencies.get(manifest.namePrefix),
        manifest.dependencies,
      ),
    );
    for (const chunk of manifest.chunks) {
      if (chunks.has(chunk.key)) continue;
      chunks.set(chunk.key, {
        className: resolveChunkClassName(chunk, manifest.namePrefix),
        animations: chunk.animations ?? EMPTY_ANIMATIONS,
        manifestId: manifest.id,
        namePrefix: manifest.namePrefix,
      });
    }
  }

  store.active = store.manifests.size > 0;
  store.revision++;
}

/**
 * Validate the registered catalogs once per registration, on first use.
 *
 * Called from the lookup path rather than from `configure()`: registration is a
 * side-effect import that normally runs before the host configures anything, so
 * there is no final configuration to compare until a render asks for a class.
 */
export function ensurePrecompiledConfigValidated(): void {
  const store = getPrecompileStore();
  if (store.validatedRevision === store.revision) return;

  // Set first: validation rebuilds the store and bumps `revision`, and the
  // result of that rebuild is what we just checked.
  validatePrecompiledCompilationConfig();
  store.validatedRevision = store.revision;
}

export function isPrecompiledManifestRegistered(
  id: string,
  cssHash?: string,
): boolean {
  const manifest = getPrecompileStore().manifests?.get(id);
  return !!manifest && (cssHash === undefined || manifest.cssHash === cssHash);
}
