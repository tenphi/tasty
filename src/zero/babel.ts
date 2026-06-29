/**
 * Babel plugin for zero-runtime tasty static site generation.
 *
 * Transforms:
 * - `tastyStatic(styles)` → StaticStyle object { className, styles, toString() }
 * - `tastyStatic(base, styles)` → StaticStyle object with merged styles
 * - `tastyStatic(selector, styles)` → removed entirely
 *
 * Usage:
 * ```javascript
 * // babel.config.js
 * module.exports = {
 *   plugins: [
 *     ['@tenphi/tasty/babel-plugin', { output: 'public/tasty.css' }]
 *   ]
 * };
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';

import { declare } from '@babel/helper-plugin-utils';
import * as t from '@babel/types';
import { createJiti } from 'jiti';

import {
  configure,
  getGlobalStyles,
  getGlobalConfigTokens,
  resetConfig,
} from '../config';
import type { TastyConfig } from '../config';
import type { Styles, ConfigTokens } from '../styles/types';
import { mergeStyles } from '../utils/merge-styles';
import { DEFAULT_ZERO_NAME_PREFIX } from '../utils/name-prefix';
import { resolveRecipes } from '../utils/resolve-recipes';

import { CSSWriter } from './css-writer';
import {
  extractCounterStyleFromStyles,
  extractFontFaceFromStyles,
  extractFunctionsFromStyles,
  extractKeyframesFromStyles,
  extractPropertiesFromStyles,
  extractStylesForSelector,
  extractStylesWithChunks,
  setExtractorNamePrefix,
} from './extractor';
import type {
  ExtractedChunk,
  ExtractedCounterStyle,
  ExtractedFontFace,
  ExtractedFunction,
  ExtractedKeyframes,
  ExtractedProperty,
} from './extractor';

import type { NodePath, PluginPass } from '@babel/core';
import type {
  CounterStyleDescriptors,
  FontFaceInput,
  FunctionDefinition,
  KeyframesSteps,
} from '../injector/types';

/**
 * Build-time configuration for zero-runtime mode.
 * Subset of TastyConfig excluding runtime-only DOM options
 * (`nonce`, `maxRulesPerSheet`, `forceTextInjection`, `gc`)
 * and overriding `devMode` default to `false`.
 */
export type TastyZeroConfig = Omit<
  TastyConfig,
  'nonce' | 'maxRulesPerSheet' | 'forceTextInjection' | 'gc' | 'devMode'
> & {
  /**
   * Enable development mode features: source comments in generated CSS.
   * @default false
   */
  devMode?: boolean;
};

export interface TastyZeroBabelOptions {
  /** Output path for generated CSS (default: 'tasty.css') */
  output?: string;
  /**
   * Tasty configuration for build-time processing.
   * Can be a static object or a factory function that returns fresh config.
   * A factory is called on each plugin invocation, enabling hot reload
   * of config values that depend on external files (e.g. theme tokens).
   */
  config?: TastyZeroConfig | (() => TastyZeroConfig);
  /**
   * Absolute path to a TypeScript/JavaScript module that default-exports
   * a `TastyZeroConfig` object. The module is loaded via jiti on each
   * plugin invocation, enabling hot reload when the file changes.
   *
   * This option is JSON-serializable and is the primary way Turbopack
   * passes config to the Babel plugin (since Turbopack loader options
   * must be plain primitives/objects/arrays).
   *
   * When both `config` and `configFile` are set, `config` takes precedence.
   *
   * @example '/absolute/path/to/tasty-zero.config.ts'
   */
  configFile?: string;
  /**
   * Absolute file paths whose content affects the generated CSS.
   * When any of these files change, babel-loader invalidates its cache
   * and re-runs the plugin with fresh config values.
   *
   * Typically includes theme files that define Glaze palettes or token values.
   * Paths must be absolute (resolved by the Next.js wrapper).
   */
  configDeps?: string[];
  /**
   * Automatically replace `@tenphi/tasty/static` imports with an import
   * of the generated CSS file. This eliminates the need for users to
   * manually import the CSS in their app entry point.
   *
   * @default true
   */
  injectImport?: boolean;
  /**
   * Output mode for extracted CSS.
   *
   * - `'file'` (default): CSS is written to a single output file and
   *   the `@tenphi/tasty/static` import is rewritten to import that file.
   * - `'inject'`: CSS is embedded inline in the JS output and injected
   *   at runtime via a tiny injector from `@tenphi/tasty/static/inject`.
   *   No CSS file is written. Each `tastyStatic` call becomes
   *   self-contained. Best for reusable components and extensions.
   *
   * When `mode` is `'inject'`, `output` and `injectImport` are ignored.
   *
   * @default 'file'
   */
  mode?: 'file' | 'inject';
}

/**
 * Registry to track StaticStyle objects by their variable names.
 * Used to resolve base styles when extending.
 */
type StaticStyleRegistry = Record<
  string,
  {
    styles: Styles;
    className: string;
  }
>;

interface PluginState extends PluginPass {
  staticStyleRegistry: StaticStyleRegistry;
  /** Current source file path (for devMode source comments) */
  sourceFile?: string;
  /** Whether this file added CSS blocks to the writer (via tastyStatic calls) */
  _fileAddedCSS?: boolean;
}

function mtime(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function clearRequireCacheTree(filePath: string): void {
  let resolved: string;

  try {
    resolved = require.resolve(filePath);
  } catch {
    return;
  }

  const mod = require.cache[resolved];

  if (!mod) return;

  const dir = resolved.substring(0, resolved.lastIndexOf('/'));

  if (mod.children) {
    for (const child of mod.children) {
      if (child.id.startsWith(dir) && !child.id.includes('node_modules')) {
        clearRequireCacheTree(child.id);
      }
    }
  }

  delete require.cache[resolved];
}

// Shared CSSWriter cache keyed by resolved output path.
// Persists across per-file Babel invocations (Turbopack model) so that
// CSS from all files accumulates instead of being overwritten.
interface WriterCacheEntry {
  writer: CSSWriter;
  configKey: string;
  registry: StaticStyleRegistry;
  config: TastyZeroConfig;
}
const writerCache = new Map<string, WriterCacheEntry>();

/** Clear the shared CSSWriter cache. Exposed for testing. */
export function clearWriterCache(): void {
  writerCache.clear();
}

// @ts-expect-error PluginState vs PluginPass type mismatch in @babel/helper-plugin-utils
export default declare<TastyZeroBabelOptions>((api, options) => {
  api.assertVersion(7);

  const mode = options.mode ?? 'file';
  const outputPath = options.output || 'tasty.css';
  const resolvedOutputPath = path.resolve(outputPath);
  const injectImport = options.injectImport ?? true;

  if (mode === 'file' && injectImport) {
    const dir = path.dirname(resolvedOutputPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(resolvedOutputPath)) {
      fs.writeFileSync(
        resolvedOutputPath,
        '/* Generated by @tenphi/tasty/zero - DO NOT EDIT */\n',
      );
    }
  }

  const configDeps = [
    ...(options.configFile ? [options.configFile] : []),
    ...(options.configDeps || []),
  ];

  // Fingerprint for config deps — used to detect config changes
  // and invalidate the shared CSSWriter cache.
  const configKey =
    configDeps.length > 0 ? configDeps.map(mtime).join(',') : '';

  // Register external dependencies for babel-loader cache invalidation.
  // When any configDeps file changes, babel-loader discards the cached
  // transform result and re-runs the plugin, picking up fresh config.
  if (configDeps.length > 0) {
    api.cache.using(() => configKey);

    for (const dep of configDeps) {
      try {
        (
          api as unknown as { addExternalDependency(path: string): void }
        ).addExternalDependency(dep);
      } catch {
        // addExternalDependency may not be available in all environments
      }
    }
  } else {
    api.cache.forever();
  }

  // When configDeps are set, clear the require cache so we get fresh values.
  if (configDeps.length > 0) {
    for (const dep of configDeps) {
      clearRequireCacheTree(dep);
    }
  }

  // Look up or create the shared CSSWriter for this output path.
  // When config deps change (different configKey), discard the old writer
  // and reset pipeline state so configure() can run again.
  const cached = writerCache.get(resolvedOutputPath);
  const configChanged = !cached || cached.configKey !== configKey;

  if (configChanged) {
    const configOption = options.config;
    let resolvedConfig: TastyZeroConfig;

    if (configOption) {
      resolvedConfig =
        typeof configOption === 'function' ? configOption() : configOption;
    } else if (options.configFile) {
      const jiti = createJiti(path.dirname(options.configFile), {
        moduleCache: false,
      });

      const loaded = jiti(options.configFile) as
        | TastyZeroConfig
        | { default: TastyZeroConfig };
      // jiti returns the ESM namespace, so unwrap `default` when present.
      resolvedConfig =
        loaded && typeof loaded === 'object' && 'default' in loaded
          ? (loaded.default as TastyZeroConfig)
          : (loaded as TastyZeroConfig);
    } else {
      resolvedConfig = {};
    }

    const devMode = resolvedConfig.devMode ?? false;

    if (cached) {
      resetConfig();
    }

    // Default to the zero-runtime prefix ('ts') unless the user opts out.
    // Using the same `namePrefix` config entry as the runtime keeps the
    // API uniform; the different default prevents collisions when both
    // runtime and zero-runtime classes appear on the same page.
    const finalConfig: TastyZeroConfig = {
      namePrefix: DEFAULT_ZERO_NAME_PREFIX,
      ...resolvedConfig,
    };

    configure(finalConfig);
    setExtractorNamePrefix(finalConfig.namePrefix ?? DEFAULT_ZERO_NAME_PREFIX);

    const newWriter = new CSSWriter(outputPath, { devMode });

    // Emit configured tokens and global styles (file mode only;
    // inject mode handles injection per-file in the post hook).
    if (mode !== 'inject') {
      const tokenCSS = extractCSSFromStyles(':root', getGlobalConfigTokens());
      if (tokenCSS) newWriter.add(':root:tokens', tokenCSS);

      const globalStyles = getGlobalStyles();
      if (globalStyles) {
        for (const [selector, styles] of Object.entries(globalStyles)) {
          const css = extractCSSFromStyles(selector, styles);
          if (css) newWriter.add(`global:${selector}`, css);
        }
      }
    }

    writerCache.set(resolvedOutputPath, {
      writer: newWriter,
      configKey,
      registry: {},
      config: finalConfig,
    });
  }

  const entry = writerCache.get(resolvedOutputPath)!;
  const cssWriter = entry.writer;
  const globalRegistry = entry.registry;
  const config = entry.config;
  const devMode = config.devMode ?? false;
  // When the writer entry was reused from a previous Babel invocation
  // (configChanged=false), make sure the extractor's module-level prefix
  // still matches this build's config — module state can outlive a
  // single configure() call across worker reuse.
  setExtractorNamePrefix(config.namePrefix ?? DEFAULT_ZERO_NAME_PREFIX);

  // Precompute token CSS and global styles CSS for inject mode
  let tokenCSS: string | undefined;
  let globalStylesCSS: Map<string, string> | undefined;
  if (mode === 'inject') {
    tokenCSS = extractCSSFromStyles(':root', getGlobalConfigTokens());
    const gs = getGlobalStyles();
    if (gs) {
      globalStylesCSS = new Map();
      for (const [selector, styles] of Object.entries(gs)) {
        const css = extractCSSFromStyles(selector, styles);
        if (css) globalStylesCSS.set(selector, css);
      }
      if (globalStylesCSS.size === 0) globalStylesCSS = undefined;
    }
  }

  return {
    name: 'tasty-zero',

    pre(this: PluginState) {
      // Initialize per-file registry
      this.staticStyleRegistry = {};
      this._fileAddedCSS = false;
      // Extract source filename for devMode comments
      if (devMode && this.filename) {
        // Get relative path or just filename
        this.sourceFile = this.filename.split('/').pop() || this.filename;
      }
    },

    visitor: {
      ImportDeclaration(
        nodePath: NodePath<t.ImportDeclaration>,
        state: PluginState,
      ) {
        const source = nodePath.node.source.value;

        if (
          source === '@tenphi/tasty/static' ||
          source.endsWith('/tasty/static')
        ) {
          if (mode === 'inject') {
            nodePath.replaceWith(
              t.importDeclaration(
                [
                  t.importSpecifier(
                    t.identifier('_$i'),
                    t.identifier('injectCSS'),
                  ),
                ],
                t.stringLiteral('@tenphi/tasty/static/inject'),
              ),
            );
          } else if (injectImport) {
            let importPath = resolvedOutputPath;

            if (state.filename) {
              const sourceDir = path.dirname(state.filename);
              importPath = path.relative(sourceDir, resolvedOutputPath);

              if (!importPath.startsWith('.')) {
                importPath = './' + importPath;
              }
            }

            nodePath.replaceWith(
              t.importDeclaration([], t.stringLiteral(importPath)),
            );
          } else {
            nodePath.remove();
          }
        }
      },

      // Transform tastyStatic() calls
      CallExpression(path: NodePath<t.CallExpression>, state: PluginState) {
        const callee = path.node.callee;

        // Match tastyStatic(...) calls
        if (!t.isIdentifier(callee, { name: 'tastyStatic' })) {
          return;
        }

        state._fileAddedCSS = true;

        const args = path.node.arguments;

        if (args.length === 0) {
          throw path.buildCodeFrameError(
            'tastyStatic() requires at least one argument',
          );
        }

        const firstArg = args[0];

        if (t.isStringLiteral(firstArg)) {
          // Selector mode: tastyStatic(selector, styles)
          handleSelectorMode(
            path,
            args,
            cssWriter,
            mode,
            state.sourceFile,
            config.keyframes,
            config.autoPropertyTypes,
            config.fontFace,
            config.counterStyle,
            config.function,
          );
        } else if (t.isObjectExpression(firstArg)) {
          // Styles mode: tastyStatic(styles)
          handleStylesMode(
            path,
            args,
            cssWriter,
            state,
            globalRegistry,
            mode,
            config.keyframes,
            config.autoPropertyTypes,
            config.fontFace,
            config.counterStyle,
            config.function,
          );
        } else if (t.isIdentifier(firstArg)) {
          // Extension mode: tastyStatic(base, styles)
          handleExtensionMode(
            path,
            args,
            cssWriter,
            state,
            globalRegistry,
            mode,
            config.keyframes,
            config.autoPropertyTypes,
            config.fontFace,
            config.counterStyle,
            config.function,
          );
        } else {
          throw path.buildCodeFrameError(
            'tastyStatic() first argument must be an object (styles), ' +
              'identifier (base StaticStyle), or string (selector)',
          );
        }
      },

      // Track variable declarations to register StaticStyle objects
      VariableDeclarator(
        path: NodePath<t.VariableDeclarator>,
        state: PluginState,
      ) {
        const init = path.node.init;
        const id = path.node.id;

        // Check if this is a StaticStyle object (has className and styles properties)
        if (
          t.isIdentifier(id) &&
          t.isObjectExpression(init) &&
          isStaticStyleObject(init)
        ) {
          const variableName = id.name;
          const styles = extractStylesFromStaticStyleObject(init, path);
          const className = extractClassNameFromStaticStyleObject(init);

          if (styles && className) {
            state.staticStyleRegistry[variableName] = { styles, className };
            globalRegistry[variableName] = { styles, className };
          }
        }
      },
    },

    post(this: PluginState) {
      if (mode === 'inject') {
        // In inject mode, inject token/global CSS as top-level statements
        // when this file had tastyStatic calls and config CSS exists.
        if (this._fileAddedCSS && (tokenCSS || globalStylesCSS)) {
          const program = this.file.ast.program;

          // Find the position after the inject import
          let insertIndex = 0;
          for (let i = 0; i < program.body.length; i++) {
            if (t.isImportDeclaration(program.body[i])) {
              insertIndex = i + 1;
            }
          }

          if (tokenCSS) {
            const injectCall = createInjectCallAST(':root', tokenCSS);
            program.body.splice(
              insertIndex,
              0,
              t.expressionStatement(injectCall),
            );
            insertIndex++;
          }

          if (globalStylesCSS) {
            for (const [selector, css] of globalStylesCSS) {
              const injectCall = createInjectCallAST(selector, css);
              program.body.splice(
                insertIndex,
                0,
                t.expressionStatement(injectCall),
              );
              insertIndex++;
            }
          }
        }
        return;
      }

      // Only write when this file contributed CSS (had tastyStatic calls).
      // In Turbopack, separate workers each have their own CSSWriter with
      // only token CSS. Letting those workers write would overwrite the
      // complete CSS produced by the worker that processed tastyStatic files.
      if (this._fileAddedCSS && cssWriter.size > 0) {
        cssWriter.write();
      }
    },
  };
});

/**
 * Check if an object expression looks like a StaticStyle object
 */
function isStaticStyleObject(node: t.ObjectExpression): boolean {
  const hasClassName = node.properties.some(
    (p) =>
      t.isObjectProperty(p) && t.isIdentifier(p.key, { name: 'className' }),
  );
  const hasStyles = node.properties.some(
    (p) => t.isObjectProperty(p) && t.isIdentifier(p.key, { name: 'styles' }),
  );
  return hasClassName && hasStyles;
}

/**
 * Extract styles object from a StaticStyle object expression
 */
function extractStylesFromStaticStyleObject(
  node: t.ObjectExpression,
  path: NodePath,
): Styles | null {
  for (const prop of node.properties) {
    if (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key, { name: 'styles' }) &&
      t.isObjectExpression(prop.value)
    ) {
      return evaluateObjectExpression(prop.value, path) as Styles;
    }
  }
  return null;
}

/**
 * Extract className from a StaticStyle object expression
 */
function extractClassNameFromStaticStyleObject(
  node: t.ObjectExpression,
): string | null {
  for (const prop of node.properties) {
    if (
      t.isObjectProperty(prop) &&
      t.isIdentifier(prop.key, { name: 'className' }) &&
      t.isStringLiteral(prop.value)
    ) {
      return prop.value.value;
    }
  }
  return null;
}

/**
 * Handle tastyStatic(styles) - returns StaticStyle object
 */
function handleStylesMode(
  path: NodePath<t.CallExpression>,
  args: t.CallExpression['arguments'],
  cssWriter: CSSWriter,
  state: PluginState,
  globalRegistry: StaticStyleRegistry,
  mode: 'file' | 'inject',
  globalKeyframes?: Record<string, KeyframesSteps>,
  autoPropertyTypes?: boolean,
  globalFontFace?: Record<string, FontFaceInput>,
  globalCounterStyle?: Record<string, CounterStyleDescriptors>,
  globalFunction?: Record<string, FunctionDefinition>,
): void {
  const stylesArg = args[0];

  if (!t.isObjectExpression(stylesArg)) {
    throw path.buildCodeFrameError(
      'tastyStatic(styles) argument must be a static object literal',
    );
  }

  // Evaluate styles object at build time
  const rawStyles = evaluateObjectExpression(stylesArg, path) as Styles;

  // Resolve recipes before extraction
  const styles = resolveRecipes(rawStyles);

  // Extract keyframes (deduplicated by content)
  const { keyframes, nameMap } = extractKeyframesFromStyles(
    styles,
    globalKeyframes,
  );

  // Extract and add auto-inferred @property rules
  const properties = extractPropertiesFromStyles(styles, { autoPropertyTypes });

  // Extract @font-face rules
  const fontFaces = extractFontFaceFromStyles(styles, globalFontFace);

  // Extract @counter-style rules
  const counterStyles = extractCounterStyleFromStyles(
    styles,
    globalCounterStyle,
  );

  // Extract @function rules
  const functions = extractFunctionsFromStyles(styles, globalFunction);

  // Extract styles with chunking
  const chunks = extractStylesWithChunks(styles);

  const className =
    chunks.length > 0 ? chunks.map((c) => c.className).join(' ') : '';
  const staticStyleObject = createStaticStyleAST(className, styles);

  if (mode === 'inject') {
    const allCSS = collectAllCSS(
      keyframes,
      properties,
      fontFaces,
      counterStyles,
      functions,
      chunks,
      nameMap,
    );
    const injectCall = createInjectCallAST(className, allCSS);

    path.replaceWith(t.sequenceExpression([injectCall, staticStyleObject]));
  } else {
    writeCSSToWriter(
      cssWriter,
      keyframes,
      properties,
      fontFaces,
      counterStyles,
      functions,
      chunks,
      nameMap,
      state.sourceFile,
    );
    path.replaceWith(staticStyleObject);
  }

  registerIfVariableDeclaration(path, className, styles, state, globalRegistry);
}

/**
 * Handle tastyStatic(base, styles) - extends base with additional styles
 */
function handleExtensionMode(
  path: NodePath<t.CallExpression>,
  args: t.CallExpression['arguments'],
  cssWriter: CSSWriter,
  state: PluginState,
  globalRegistry: StaticStyleRegistry,
  mode: 'file' | 'inject',
  globalKeyframes?: Record<string, KeyframesSteps>,
  autoPropertyTypes?: boolean,
  globalFontFace?: Record<string, FontFaceInput>,
  globalCounterStyle?: Record<string, CounterStyleDescriptors>,
  globalFunction?: Record<string, FunctionDefinition>,
): void {
  if (args.length < 2) {
    throw path.buildCodeFrameError(
      'tastyStatic(base, styles) requires two arguments',
    );
  }

  const baseArg = args[0];
  const stylesArg = args[1];

  if (!t.isIdentifier(baseArg)) {
    throw path.buildCodeFrameError(
      'tastyStatic(base, styles) first argument must be an identifier',
    );
  }

  if (!t.isObjectExpression(stylesArg)) {
    throw path.buildCodeFrameError(
      'tastyStatic(base, styles) second argument must be a static object literal',
    );
  }

  const baseName = baseArg.name;

  // Look up base styles in registry
  const baseEntry =
    state.staticStyleRegistry[baseName] || globalRegistry[baseName];

  if (!baseEntry) {
    throw path.buildCodeFrameError(
      `Cannot find base StaticStyle '${baseName}'. ` +
        'Make sure it is defined before being extended.',
    );
  }

  // Evaluate override styles
  const overrideStyles = evaluateObjectExpression(stylesArg, path) as Styles;

  // Merge styles using mergeStyles, then resolve recipes
  const mergedStyles = resolveRecipes(
    mergeStyles(baseEntry.styles, overrideStyles),
  );

  // Extract keyframes (deduplicated by content)
  const { keyframes, nameMap } = extractKeyframesFromStyles(
    mergedStyles,
    globalKeyframes,
  );

  // Extract auto-inferred @property rules
  const properties = extractPropertiesFromStyles(mergedStyles, {
    autoPropertyTypes,
  });

  // Extract @font-face rules
  const fontFaces = extractFontFaceFromStyles(mergedStyles, globalFontFace);

  // Extract @counter-style rules
  const counterStyles = extractCounterStyleFromStyles(
    mergedStyles,
    globalCounterStyle,
  );

  // Extract @function rules
  const functions = extractFunctionsFromStyles(mergedStyles, globalFunction);

  // Extract styles with chunking
  const chunks = extractStylesWithChunks(mergedStyles);

  const className =
    chunks.length > 0 ? chunks.map((c) => c.className).join(' ') : '';
  const staticStyleObject = createStaticStyleAST(className, mergedStyles);

  if (mode === 'inject') {
    const allCSS = collectAllCSS(
      keyframes,
      properties,
      fontFaces,
      counterStyles,
      functions,
      chunks,
      nameMap,
    );
    const injectCall = createInjectCallAST(className, allCSS);

    path.replaceWith(t.sequenceExpression([injectCall, staticStyleObject]));
  } else {
    writeCSSToWriter(
      cssWriter,
      keyframes,
      properties,
      fontFaces,
      counterStyles,
      functions,
      chunks,
      nameMap,
      state.sourceFile,
    );
    path.replaceWith(staticStyleObject);
  }

  registerIfVariableDeclaration(
    path,
    className,
    mergedStyles,
    state,
    globalRegistry,
  );
}

/**
 * Handle tastyStatic(selector, styles) - removes the call entirely
 */
function handleSelectorMode(
  path: NodePath<t.CallExpression>,
  args: t.CallExpression['arguments'],
  cssWriter: CSSWriter,
  mode: 'file' | 'inject',
  sourceFile?: string,
  globalKeyframes?: Record<string, KeyframesSteps>,
  autoPropertyTypes?: boolean,
  globalFontFace?: Record<string, FontFaceInput>,
  globalCounterStyle?: Record<string, CounterStyleDescriptors>,
  globalFunction?: Record<string, FunctionDefinition>,
): void {
  if (args.length < 2) {
    throw path.buildCodeFrameError(
      'tastyStatic(selector, styles) requires two arguments',
    );
  }

  const selectorArg = args[0];
  const stylesArg = args[1];

  if (!t.isStringLiteral(selectorArg)) {
    throw path.buildCodeFrameError(
      'tastyStatic(selector, styles) first argument must be a string literal',
    );
  }

  if (!t.isObjectExpression(stylesArg)) {
    throw path.buildCodeFrameError(
      'tastyStatic(selector, styles) second argument must be a static object literal',
    );
  }

  const selector = selectorArg.value;
  const rawStyles = evaluateObjectExpression(stylesArg, path) as Styles;

  // Resolve recipes before extraction
  const styles = resolveRecipes(rawStyles);

  // Extract keyframes (deduplicated by content)
  const { keyframes, nameMap } = extractKeyframesFromStyles(
    styles,
    globalKeyframes,
  );

  // Extract auto-inferred @property rules
  const properties = extractPropertiesFromStyles(styles, { autoPropertyTypes });

  // Extract @font-face rules
  const fontFaces = extractFontFaceFromStyles(styles, globalFontFace);

  // Extract @counter-style rules
  const counterStyles = extractCounterStyleFromStyles(
    styles,
    globalCounterStyle,
  );

  // Extract @function rules
  const functions = extractFunctionsFromStyles(styles, globalFunction);

  // Extract styles for selector
  const result = extractStylesForSelector(selector, styles);

  const selectorCSS =
    nameMap.size > 0
      ? replaceAnimationNamesInCSS(result.css, nameMap)
      : result.css;

  if (mode === 'inject') {
    const cssParts: string[] = [];

    for (const kf of keyframes) cssParts.push(kf.css);
    for (const prop of properties) cssParts.push(prop.css);
    for (const ff of fontFaces) cssParts.push(ff.css);
    for (const cs of counterStyles) cssParts.push(cs.css);
    for (const fn of functions) cssParts.push(fn.css);
    cssParts.push(selectorCSS);

    const injectCall = createInjectCallAST(selector, cssParts.join('\n'));

    const parent = path.parentPath;
    if (parent && t.isExpressionStatement(parent.node)) {
      parent.replaceWith(t.expressionStatement(injectCall));
    } else {
      path.replaceWith(injectCall);
    }
  } else {
    writeCSSToWriter(
      cssWriter,
      keyframes,
      properties,
      fontFaces,
      counterStyles,
      functions,
      [],
      nameMap,
      sourceFile,
    );
    cssWriter.add(selector, selectorCSS, sourceFile);

    const parent = path.parentPath;
    if (parent && t.isExpressionStatement(parent.node)) {
      parent.remove();
    } else {
      path.replaceWith(t.identifier('undefined'));
    }
  }
}

/**
 * Collect all extracted CSS parts into a single string (for inject mode).
 */
function collectAllCSS(
  keyframes: ExtractedKeyframes[],
  properties: ExtractedProperty[],
  fontFaces: ExtractedFontFace[],
  counterStyles: ExtractedCounterStyle[],
  functions: ExtractedFunction[],
  chunks: ExtractedChunk[],
  nameMap: Map<string, string>,
): string {
  const parts: string[] = [];

  for (const kf of keyframes) parts.push(kf.css);
  for (const prop of properties) parts.push(prop.css);
  for (const ff of fontFaces) parts.push(ff.css);
  for (const cs of counterStyles) parts.push(cs.css);
  for (const fn of functions) parts.push(fn.css);

  for (const chunk of chunks) {
    parts.push(
      nameMap.size > 0
        ? replaceAnimationNamesInCSS(chunk.css, nameMap)
        : chunk.css,
    );
  }

  return parts.join('\n');
}

/**
 * Write all extracted CSS parts to a CSSWriter (for file mode).
 */
function writeCSSToWriter(
  cssWriter: CSSWriter,
  keyframes: ExtractedKeyframes[],
  properties: ExtractedProperty[],
  fontFaces: ExtractedFontFace[],
  counterStyles: ExtractedCounterStyle[],
  functions: ExtractedFunction[],
  chunks: ExtractedChunk[],
  nameMap: Map<string, string>,
  sourceFile?: string,
): void {
  for (const kf of keyframes) {
    cssWriter.add(kf.css, kf.css, sourceFile);
  }
  for (const prop of properties) {
    cssWriter.add(prop.css, prop.css, sourceFile);
  }
  for (const ff of fontFaces) {
    cssWriter.add(ff.css, ff.css, sourceFile);
  }
  for (const cs of counterStyles) {
    cssWriter.add(cs.css, cs.css, sourceFile);
  }
  for (const fn of functions) {
    cssWriter.add(fn.css, fn.css, sourceFile);
  }

  for (const chunk of chunks) {
    const css =
      nameMap.size > 0
        ? replaceAnimationNamesInCSS(chunk.css, nameMap)
        : chunk.css;
    cssWriter.add(chunk.className, css, sourceFile);
  }
}

/**
 * Extract CSS for a selector from a styles/tokens object.
 * Returns undefined when there are no styles or no CSS output.
 */
function extractCSSFromStyles(
  selector: string,
  styles: Styles | ConfigTokens | null,
): string | undefined {
  if (!styles || Object.keys(styles).length === 0) return undefined;
  const result = extractStylesForSelector(selector, styles as Styles);
  return result.css || undefined;
}

/**
 * Create an `_$i(id, css)` call expression AST node for inject mode.
 */
function createInjectCallAST(id: string, css: string): t.CallExpression {
  return t.callExpression(t.identifier('_$i'), [
    t.stringLiteral(id),
    t.stringLiteral(css),
  ]);
}

/**
 * Create a StaticStyle object AST node
 */
function createStaticStyleAST(
  className: string,
  styles: Styles,
): t.ObjectExpression {
  return t.objectExpression([
    t.objectProperty(t.identifier('className'), t.stringLiteral(className)),
    t.objectProperty(t.identifier('styles'), valueToAST(styles)),
    t.objectMethod(
      'method',
      t.identifier('toString'),
      [],
      t.blockStatement([
        t.returnStatement(
          t.memberExpression(t.thisExpression(), t.identifier('className')),
        ),
      ]),
    ),
  ]);
}

/**
 * Register a StaticStyle in the registry if it's being assigned to a variable
 */
function registerIfVariableDeclaration(
  path: NodePath,
  className: string,
  styles: Styles,
  state: PluginState,
  globalRegistry: StaticStyleRegistry,
): void {
  const parent = path.parentPath;
  if (parent && t.isVariableDeclarator(parent.node)) {
    const id = parent.node.id;
    if (t.isIdentifier(id)) {
      const variableName = id.name;
      state.staticStyleRegistry[variableName] = { styles, className };
      globalRegistry[variableName] = { styles, className };
    }
  }
}

/**
 * Convert a JavaScript value to an AST node
 */
function valueToAST(value: unknown): t.Expression {
  if (value === null) {
    return t.nullLiteral();
  }
  if (value === undefined) {
    return t.identifier('undefined');
  }
  if (typeof value === 'string') {
    return t.stringLiteral(value);
  }
  if (typeof value === 'number') {
    return t.numericLiteral(value);
  }
  if (typeof value === 'boolean') {
    return t.booleanLiteral(value);
  }
  if (Array.isArray(value)) {
    return t.arrayExpression(value.map(valueToAST));
  }
  if (typeof value === 'object') {
    const properties = Object.entries(value).map(([key, val]) =>
      t.objectProperty(
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
          ? t.identifier(key)
          : t.stringLiteral(key),
        valueToAST(val),
      ),
    );
    return t.objectExpression(properties);
  }
  // Fallback for unsupported types
  return t.identifier('undefined');
}

/**
 * Evaluate an ObjectExpression to a plain JavaScript object.
 * Only supports static values that can be determined at build time.
 */
function evaluateObjectExpression(
  node: t.ObjectExpression,
  path: NodePath,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const prop of node.properties) {
    if (t.isSpreadElement(prop)) {
      throw path.buildCodeFrameError(
        'Spread elements are not supported in tastyStatic() - styles must be fully static',
      );
    }

    if (!t.isObjectProperty(prop)) {
      throw path.buildCodeFrameError(
        'Only object properties are supported in tastyStatic()',
      );
    }

    // Get key
    let key: string;
    if (t.isIdentifier(prop.key)) {
      key = prop.key.name;
    } else if (t.isStringLiteral(prop.key)) {
      key = prop.key.value;
    } else {
      throw path.buildCodeFrameError(
        'Dynamic property keys are not supported in tastyStatic()',
      );
    }

    // Get value
    const value = evaluateExpression(prop.value, path);
    result[key] = value;
  }

  return result;
}

/**
 * Evaluate an expression to a JavaScript value.
 */
function evaluateExpression(node: t.Node, path: NodePath): unknown {
  if (t.isStringLiteral(node)) {
    return node.value;
  }

  if (t.isNumericLiteral(node)) {
    return node.value;
  }

  if (t.isBooleanLiteral(node)) {
    return node.value;
  }

  if (t.isNullLiteral(node)) {
    return null;
  }

  if (t.isIdentifier(node, { name: 'undefined' })) {
    return undefined;
  }

  if (t.isArrayExpression(node)) {
    return node.elements.map((el) => {
      if (el === null) return null;
      if (t.isSpreadElement(el)) {
        throw path.buildCodeFrameError(
          'Spread elements are not supported in tastyStatic()',
        );
      }
      return evaluateExpression(el, path);
    });
  }

  if (t.isObjectExpression(node)) {
    return evaluateObjectExpression(node, path);
  }

  if (t.isTemplateLiteral(node)) {
    // Only support template literals without expressions
    if (node.expressions.length > 0) {
      throw path.buildCodeFrameError(
        'Template literals with expressions are not supported in tastyStatic()',
      );
    }
    return node.quasis.map((q) => q.value.cooked).join('');
  }

  if (t.isUnaryExpression(node, { operator: '-' })) {
    const arg = evaluateExpression(node.argument, path);
    if (typeof arg === 'number') {
      return -arg;
    }
  }

  throw path.buildCodeFrameError(
    `Dynamic expressions are not supported in tastyStatic() - got ${node.type}. ` +
      'All values must be static literals.',
  );
}

/**
 * Replace animation names in CSS string.
 * Wraps the keyframes replaceAnimationNames to work on full CSS blocks.
 */
function replaceAnimationNamesInCSS(
  css: string,
  nameMap: Map<string, string>,
): string {
  if (nameMap.size === 0) return css;

  // The CSS contains full rules like ".class { animation: name 1s; }"
  // We need to replace animation names within declaration blocks
  return css.replace(
    /(animation(?:-name)?)\s*:\s*([^;}]+)/gi,
    (match, prop, value) => {
      let newValue = value;
      for (const [original, replacement] of nameMap) {
        // Word boundary replacement
        const pattern = new RegExp(`\\b${escapeRegex(original)}\\b`, 'g');
        newValue = newValue.replace(pattern, replacement);
      }
      return `${prop}: ${newValue}`;
    },
  );
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
