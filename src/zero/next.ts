/**
 * Next.js configuration wrapper for tasty-zero.
 *
 * @example
 * ```javascript
 * // next.config.js
 * const { withTastyZero } = require('@tenphi/tasty/next');
 *
 * module.exports = withTastyZero({
 *   output: 'public/tasty.css',
 *   configFile: './app/tasty-zero.config.ts',
 * })({
 *   // your Next.js config
 * });
 * ```
 */

import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createJiti } from 'jiti';

import type { TastyZeroBabelOptions, TastyZeroConfig } from './babel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Next.js types (inline to avoid requiring next as a dependency)
interface WebpackConfigContext {
  isServer: boolean;
  dev: boolean;
  buildId: string;
  dir: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- webpack config types are complex */
interface NextConfig {
  webpack?: (config: any, context: WebpackConfigContext) => any;
  [key: string]: unknown;
}

export interface TastyZeroNextOptions {
  /**
   * Output path for CSS relative to project root.
   * @default 'public/tasty.css'
   */
  output?: string;

  /**
   * Whether to enable the plugin.
   * @default true
   */
  enabled?: boolean;

  /**
   * Tasty configuration for build-time processing.
   * For static configs that don't change during dev.
   *
   * For configs that depend on theme files, use `configFile` instead.
   */
  config?: TastyZeroConfig;

  /**
   * Path to a TypeScript/JavaScript module that exports the tasty zero config
   * as its default export. The module is re-evaluated on each webpack
   * compilation, enabling hot reload when the file (or its imports) change.
   *
   * @example './app/tasty-zero.config.ts'
   */
  configFile?: string;

  /**
   * Extra file paths (relative to project root) that the config depends on.
   * When any of these files change, the Babel cache is invalidated and
   * the config is re-evaluated.
   *
   * The `configFile` itself is always tracked automatically.
   * Use this for transitive dependencies that aren't directly imported
   * by the config file, or when using `config` instead of `configFile`.
   *
   * @example ['./app/theme.ts']
   */
  configDeps?: string[];
}

/**
 * Next.js configuration wrapper for tasty-zero.
 */
export function withTastyZero(options: TastyZeroNextOptions = {}) {
  const {
    output = 'public/tasty.css',
    enabled = true,
    config: tastyConfig,
    configFile,
    configDeps = [],
  } = options;

  return (nextConfig: NextConfig = {}): NextConfig => {
    if (!enabled) {
      return nextConfig;
    }

    return {
      ...nextConfig,

      webpack(config: any, context: WebpackConfigContext) {
        const { dir } = context;

        const projectDir = dir || process.cwd();
        const absoluteOutput = path.resolve(projectDir, output);

        const babelPluginPath = path.resolve(__dirname, 'babel.js');
        const projectRequire = createRequire(
          path.resolve(projectDir, 'package.json'),
        );

        const absoluteConfigFile = configFile
          ? path.resolve(projectDir, configFile)
          : undefined;

        const allDeps = [
          ...(absoluteConfigFile ? [absoluteConfigFile] : []),
          ...configDeps.map((dep) => path.resolve(projectDir, dep)),
        ];

        const babelPluginOptions: TastyZeroBabelOptions = {
          output: absoluteOutput,
        };

        if (absoluteConfigFile) {
          const jiti = createJiti(projectDir, {
            moduleCache: false,
          });

          babelPluginOptions.config = () => {
            return jiti(absoluteConfigFile) as TastyZeroConfig;
          };
        } else if (tastyConfig) {
          babelPluginOptions.config = tastyConfig;
        }

        if (allDeps.length > 0) {
          babelPluginOptions.configDeps = allDeps;
        }

        const babelPluginConfig = [babelPluginPath, babelPluginOptions];

        // Add our plugin to the existing babel config or create new rule
        const existingRule = config.module?.rules?.find(
          (rule: any) =>
            rule.use?.loader === 'babel-loader' ||
            rule.use?.some?.((u: any) => u.loader === 'babel-loader'),
        );

        if (existingRule) {
          // Add to existing babel-loader
          const babelUse = Array.isArray(existingRule.use)
            ? existingRule.use.find((u: any) => u.loader === 'babel-loader')
            : existingRule.use;

          if (babelUse?.options) {
            babelUse.options.plugins = babelUse.options.plugins || [];
            babelUse.options.plugins.push(babelPluginConfig);
          }
        } else {
          // Add new rule for our plugin
          config.module = config.module || {};
          config.module.rules = config.module.rules || [];
          config.module.rules.push({
            test: /\.(tsx?|jsx?)$/,
            exclude: /node_modules/,
            use: [
              {
                loader: projectRequire.resolve('babel-loader'),
                options: {
                  babelrc: false,
                  configFile: false,
                  parserOpts: {
                    plugins: ['typescript', 'jsx', 'decorators-legacy'],
                  },
                  plugins: [babelPluginConfig],
                },
              },
            ],
          });
        }

        // Chain with existing webpack config
        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, context);
        }

        return config;
      },
    };
  };
}
