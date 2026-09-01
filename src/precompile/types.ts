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

/**
 * The configuration a catalog was compiled under, recorded per entry so the
 * runtime can tell a harmless addition from a real divergence.
 *
 * Function-valued entries are recorded by presence and arity rather than by
 * body: a catalog is compiled from an unminified build while the runtime may be
 * a minified one, so comparing sources would reject every production bundle.
 * Rewriting a bare parse function's body while keeping its name and arity is
 * therefore not detected; adding, removing or replacing one is. Settings the
 * host declares as data — handlers, props middleware, declarative `$$`
 * function definitions — are recorded from what it passed to `configure()`, so
 * those are compared by value.
 *
 * What is deliberately absent: `configure({ tokens })` and everything else that
 * resolves to a CSS custom property. A chunk using `#brand` compiles to
 * `var(--brand-color)` whatever the palette says, and the `:root` rule that
 * supplies the value is not part of the catalog — so a theme change leaves
 * every compiled chunk correct. `replaceTokens` is the opposite case and is
 * recorded: it substitutes at parse time, baking its value into the
 * declaration.
 */
export interface TastyCompilationConfig {
  /**
   * Entries addressed by name — states, units, recipes, functions. A name the
   * catalog never saw cannot change a chunk it already compiled, so the runtime
   * may add to these; changing or removing one it did see invalidates.
   */
  scoped: Record<string, string>;
  /**
   * Deviations from Tasty's built-in tables — style handlers, props middleware,
   * chunk assignments. `tastyVersion` pins the baseline, so an entry present at
   * runtime but absent here is an override of a built-in the catalog may have
   * compiled against, and invalidates just as a change does.
   */
  exclusive: Record<string, string>;
  /** Settings that apply to every chunk rather than to a named entry. */
  scalars: Record<string, string>;
}

export interface TastyPrecompiledManifest {
  schemaVersion: 2;
  id: string;
  tastyVersion: string;
  namePrefix: string;
  cssHash: string;
  /**
   * Configuration the catalog was compiled under. Compared against the host's
   * once its config locks; a divergence disables the catalog rather than
   * serving CSS this configuration would not have produced.
   */
  compilationConfig: TastyCompilationConfig;
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
