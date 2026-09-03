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
import { resetHandlers } from '../styles/predefined';
import { isDevEnv } from '../utils/is-dev-env';
import { validateNamePrefix } from '../utils/name-prefix';
import {
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

  return { source: config, normalized, functions };
}

/** Reset only state that the build-time configuration path can mutate. */
export function resetZeroConfig(): void {
  resetStylesGeneratedState();
  resetGlobalPolyfillsState();
  resetGlobalPredefinedTokens();
  resetGlobalParseFunctions();
  resetFunctionPolyfills();
  resetHandlers();
  resetStyleChunks();
  clearPipelineCache();
  emittedWarnings.clear();
  resetStyleWarnings();
}

export function functionsForExtraction(
  config: ResolvedZeroConfig,
): Record<string, FunctionDefinition> | undefined {
  return isFunctionsPolyfillEnabled() ? undefined : config.functions;
}
