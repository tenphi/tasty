import { getConfig, isConfigLocked } from '../config';

import {
  isPrecompiledManifestRegistered,
  registerPrecompiledManifest,
} from './registry';
import type { TastyPrecompiledManifest } from './types';

export type {
  PrecompiledCounterStyleCacheEntry,
  PrecompiledKeyframeCacheEntry,
  PrecompiledPropertyCacheEntry,
  TastyPrecompiledChunk,
  TastyPrecompiledDependencies,
  TastyPrecompiledManifest,
} from './types';

export function registerTastyPrecompiled(
  manifest: TastyPrecompiledManifest,
): void {
  registerPrecompiledManifest(manifest);
}

export function installTastyPrecompiled(
  artifact: { css: string; manifest: TastyPrecompiledManifest },
  options?: { nonce?: string },
): void {
  if (typeof document === 'undefined') {
    throw new Error(
      '[Tasty] installTastyPrecompiled() is browser-only. Register the manifest and load its stylesheet separately during SSR.',
    );
  }

  const installed = Array.from(
    document.querySelectorAll<HTMLStyleElement>(
      'style[data-tasty-precompiled]',
    ),
  ).find(
    (element) => element.dataset.tastyPrecompiled === artifact.manifest.id,
  );
  if (installed) {
    if (installed.dataset.tastyPrecompiledHash !== artifact.manifest.cssHash) {
      throw new Error(
        `[Tasty] A different precompiled stylesheet is already installed for "${artifact.manifest.id}".`,
      );
    }
    registerPrecompiledManifest(artifact.manifest);
    if (
      !isPrecompiledManifestRegistered(
        artifact.manifest.id,
        artifact.manifest.cssHash,
      )
    ) {
      throw new Error(
        `[Tasty] The installed precompiled stylesheet "${artifact.manifest.id}" is incompatible with this runtime.`,
      );
    }
    return;
  }

  if (isConfigLocked()) {
    throw new Error(
      '[Tasty] installTastyPrecompiled() must run before the first Tasty render.',
    );
  }

  if (!registerPrecompiledManifest(artifact.manifest)) return;

  const style = document.createElement('style');
  style.dataset.tastyPrecompiled = artifact.manifest.id;
  style.dataset.tastyPrecompiledHash = artifact.manifest.cssHash;
  const nonce = options?.nonce ?? getConfig().nonce;
  if (nonce) style.nonce = nonce;
  style.textContent = artifact.css;
  document.head.appendChild(style);
}
