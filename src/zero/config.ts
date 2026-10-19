/** Build-time configuration without the browser injector/runtime registries. */

import { resetStyleChunks } from '../chunks/style-chunk-map';
import {
  applyStyleConfig,
  normalizeConfig,
  type NormalizedConfig,
} from '../config-normalize';
import {
  isFunctionsPolyfillEnabled,
  resetGlobalPolyfillsState,
  resetStylesGeneratedState,
} from '../config-state';
import { resetFunctionPolyfills } from '../functions';
import { clearPipelineCache } from '../pipeline';
import { clearParseCache } from '../pipeline/parseStateKey';
import { clearGlobalPredefinedStates } from '../states';
import { resetHandlers } from '../styles/predefined';
import { isDevEnv } from '../utils/is-dev-env';
import { validateNamePrefix } from '../utils/name-prefix';
import {
  CUSTOM_UNITS,
  getGlobalParser,
  resetGlobalParseFunctions,
  resetGlobalPredefinedTokens,
} from '../utils/styles';
import { resetStyleWarnings } from '../utils/warnings';

import type { FunctionDefinition } from '../injector/types';
import type { TastyZeroConfig } from './babel-types';

export interface ResolvedZeroConfig {
  source: TastyZeroConfig;
  normalized: NormalizedConfig;
  functions: Record<string, FunctionDefinition>;
}

const emittedWarnings = new Set<string>();
const devMode = isDevEnv();

/**
 * Configuration set through the public `/zero` `configure()`, which the
 * programmatic extractors read for recipes and global keyframes. The Babel
 * plugin passes its configuration explicitly and leaves this unset.
 */
let activeConfig: ResolvedZeroConfig | null = null;

/**
 * The configuration the engine state currently reflects. The state is
 * process-wide, so the Babel plugin, `withTastyNext()` and `/zero`
 * `configure()` can replace one another's; each re-applies its own when this
 * is not it.
 */
let appliedConfig: ResolvedZeroConfig | null = null;

export function getActiveZeroConfig(): ResolvedZeroConfig | null {
  return activeConfig;
}

export function setActiveZeroConfig(config: ResolvedZeroConfig | null): void {
  activeConfig = config;
}

function warnOnce(key: string, message: string): void {
  if (devMode && !emittedWarnings.has(key)) {
    emittedWarnings.add(key);
    console.warn(message);
  }
}

/** Resolve and apply the style-engine subset used during static extraction. */
export function configureZero(config: TastyZeroConfig): ResolvedZeroConfig {
  if (config.namePrefix !== undefined) validateNamePrefix(config.namePrefix);

  const normalized = normalizeConfig(config);
  const functions = applyStyleConfig(config, normalized, warnOnce);

  appliedConfig = { source: config, normalized, functions };
  return appliedConfig;
}

/**
 * Apply `config` again if another configuration replaced it since, and return
 * the configuration now applied (a fresh one when it was re-applied).
 */
export function reapplyZeroConfig(
  config: ResolvedZeroConfig,
): ResolvedZeroConfig {
  if (appliedConfig === config) return config;

  resetZeroConfig();
  return configureZero(config.source);
}

/** Reset only state that the build-time configuration path can mutate. */
export function resetZeroConfig(): void {
  resetStylesGeneratedState();
  resetGlobalPolyfillsState();
  resetGlobalPredefinedTokens();
  resetGlobalParseFunctions();
  // State aliases and units are merged into, never replaced, so a new
  // configuration would otherwise keep the previous one's. Parsed state keys
  // are cached on the assumption that aliases do not change.
  clearGlobalPredefinedStates();
  clearParseCache();
  getGlobalParser().setUnits(CUSTOM_UNITS);
  resetFunctionPolyfills();
  resetHandlers();
  resetStyleChunks();
  clearPipelineCache();
  emittedWarnings.clear();
  resetStyleWarnings();
  appliedConfig = null;
}

export function functionsForExtraction(
  config: ResolvedZeroConfig,
): Record<string, FunctionDefinition> | undefined {
  return isFunctionsPolyfillEnabled() ? undefined : config.functions;
}
