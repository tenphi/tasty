/**
 * Next.js configuration wrapper for tasty-zero.
 *
 * Supports both webpack and Turbopack bundlers:
 * - **webpack**: Injects a babel-loader rule with the tasty-zero Babel plugin
 *   via `webpack()` config hook. Config is passed as a jiti factory function.
 * - **Turbopack**: Adds a `turbopack.rules` entry with babel-loader and
 *   JSON-serializable options (`configFile` path instead of a function).
 *   The Babel plugin loads the config internally via jiti.
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

/* eslint-disable @typescript-eslint/no-explicit-any -- webpack/Next.js config types are complex */
interface TurbopackLoaderItem {
  loader: string;
  options?: Record<string, unknown>;
}

interface TurbopackRuleConfig {
  loaders: (string | TurbopackLoaderItem)[];
  as?: string;
  condition?: unknown;
}

interface TurbopackConfig {
  rules?: Record<string, TurbopackRuleConfig | TurbopackRuleConfig[]>;
  [key: string]: unknown;
}

interface NextConfig {
  webpack?: (config: any, context: WebpackConfigContext) => any;
  turbopack?: TurbopackConfig;
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
   * as its default export. The module is re-evaluated on each
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
 * Configures both webpack and Turbopack bundlers automatically.
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

    const projectDir = process.cwd();
    const absoluteOutput = path.resolve(projectDir, output);
    const babelPluginPath = path.resolve(__dirname, 'babel.js');

    const absoluteConfigFile = configFile
      ? path.resolve(projectDir, configFile)
      : undefined;

    const allDeps = [
      ...(absoluteConfigFile ? [absoluteConfigFile] : []),
      ...configDeps.map((dep) => path.resolve(projectDir, dep)),
    ];

    // --- Turbopack configuration ---
    // Turbopack loader options must be JSON-serializable (no functions).
    // The Babel plugin loads config internally via `configFile` path + jiti.
    const turbopackBabelOptions: Record<string, unknown> = {
      babelrc: false,
      configFile: false,
      parserOpts: {
        plugins: ['typescript', 'jsx', 'decorators-legacy'],
      },
      plugins: [
        [
          babelPluginPath,
          {
            output: absoluteOutput,
            ...(absoluteConfigFile
              ? { configFile: absoluteConfigFile }
              : tastyConfig
                ? { config: tastyConfig }
                : {}),
            ...(allDeps.length > 0 ? { configDeps: allDeps } : {}),
          },
        ],
      ],
    };

    const existingTurbopack = nextConfig.turbopack || {};
    const existingRules = existingTurbopack.rules || {};

    const existingExperimental =
      (nextConfig.experimental as Record<string, unknown>) || {};

    return {
      ...nextConfig,

      experimental: {
        ...existingExperimental,
        turbopackUseBuiltinBabel: true,
      },

      turbopack: {
        ...existingTurbopack,
        rules: {
          ...existingRules,
          '*.{ts,tsx,js,jsx}': {
            condition: { not: 'foreign' },
            loaders: [
              {
                loader: 'babel-loader',
                options: turbopackBabelOptions,
              },
            ],
          },
        },
      },

      webpack(config: any, context: WebpackConfigContext) {
        const { dir } = context;

        const wpProjectDir = dir || projectDir;
        const wpAbsoluteOutput = path.resolve(wpProjectDir, output);
        const projectRequire = createRequire(
          path.resolve(wpProjectDir, 'package.json'),
        );

        const wpAbsoluteConfigFile = configFile
          ? path.resolve(wpProjectDir, configFile)
          : undefined;

        const wpAllDeps = [
          ...(wpAbsoluteConfigFile ? [wpAbsoluteConfigFile] : []),
          ...configDeps.map((dep) => path.resolve(wpProjectDir, dep)),
        ];

        const babelPluginOptions: TastyZeroBabelOptions = {
          output: wpAbsoluteOutput,
        };

        if (wpAbsoluteConfigFile) {
          const jiti = createJiti(wpProjectDir, {
            moduleCache: false,
          });

          babelPluginOptions.config = () => {
            return jiti(wpAbsoluteConfigFile) as TastyZeroConfig;
          };
        } else if (tastyConfig) {
          babelPluginOptions.config = tastyConfig;
        }

        if (wpAllDeps.length > 0) {
          babelPluginOptions.configDeps = wpAllDeps;
        }

        const babelPluginConfig = [babelPluginPath, babelPluginOptions];

        const existingRule = config.module?.rules?.find(
          (rule: any) =>
            rule.use?.loader === 'babel-loader' ||
            rule.use?.some?.((u: any) => u.loader === 'babel-loader'),
        );

        if (existingRule) {
          const babelUse = Array.isArray(existingRule.use)
            ? existingRule.use.find((u: any) => u.loader === 'babel-loader')
            : existingRule.use;

          if (babelUse?.options) {
            babelUse.options.plugins = babelUse.options.plugins || [];
            babelUse.options.plugins.push(babelPluginConfig);
          }
        } else {
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

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, context);
        }

        return config;
      },
    };
  };
}
