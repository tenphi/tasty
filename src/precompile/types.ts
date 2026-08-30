import type { ReactNode } from 'react';

export type TastyStyleArtifactSource = 'config' | 'component' | 'global';

export interface PrecompiledPropertyCacheEntry {
  name: string;
  definition: string;
}

export interface PrecompiledKeyframeCacheEntry {
  name: string;
  contentKey: string;
  /** Deduplication keys used by the RSC standalone/local keyframe paths. */
  rscKeys: readonly string[];
}

export interface PrecompiledCounterStyleCacheEntry {
  name: string;
  /** Deduplication keys used by standalone RSC counter-style calls. */
  rscKeys: readonly string[];
}

export interface TastyPrecompiledDependencies {
  properties: readonly PrecompiledPropertyCacheEntry[];
  keyframes: readonly PrecompiledKeyframeCacheEntry[];
  fontFaces: readonly string[];
  counterStyles: readonly PrecompiledCounterStyleCacheEntry[];
  functions: readonly string[];
  /** Additional exact RSC emitted keys for component-owned at-rules. */
  rscKeys: readonly string[];
}

export interface TastyPrecompiledChunk {
  lookupKey: string;
  className: string;
  animations: readonly string[];
}

export interface TastyPrecompiledStats {
  /** Exact UTF-16 string length of the generated CSS payload. */
  cssSize: number;
  /** Number of top-level rules represented by the generated CSS payload. */
  ruleCount: number;
}

export interface TastyPrecompiledManifest {
  schemaVersion: 1;
  id: string;
  tastyVersion: string;
  namePrefix: string;
  cssHash: string;
  stats: TastyPrecompiledStats;
  chunks: readonly TastyPrecompiledChunk[];
  dependencies: TastyPrecompiledDependencies;
}

export interface TastyPrecompileCase {
  id: string;
  /** Return the React tree to render for this catalog case. */
  render(): ReactNode | Promise<ReactNode>;
}

export interface TastyPrecompileCaseReport {
  caseId: string;
  addedClasses: readonly string[];
  addedArtifacts: readonly string[];
}

export interface TastyPrecompileResult {
  css: string;
  manifest: TastyPrecompiledManifest;
  report: readonly TastyPrecompileCaseReport[];
}
