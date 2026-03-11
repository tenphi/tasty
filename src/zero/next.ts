/**
 * Next.js configuration wrapper for tasty-zero.
 *
 * Provides a convenient way to configure the Babel plugin for Next.js projects.
 *
 * @example
 * ```javascript
 * // next.config.js
 * const { withTastyZero } = require('@tenphi/tasty/next');
 *
 * module.exports = withTastyZero({
 *   output: 'public/tasty.css',
 * })({
 *   // your Next.js config
 * });
 * ```
 */

import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

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
   * Forwarded to the Babel plugin as `config`.
   */
  config?: import('./babel').TastyZeroConfig;
}

/**
 * Next.js configuration wrapper for tasty-zero.
 *
 * @param options - Configuration options
 * @returns A function that wraps the Next.js config
 *
 * @example
 * ```javascript
 * // next.config.js
 * const { withTastyZero } = require('@tenphi/tasty/next');
 *
 * module.exports = withTastyZero()({
 *   reactStrictMode: true,
 * });
 * ```
 */
export function withTastyZero(options: TastyZeroNextOptions = {}) {
  const {
    output = 'public/tasty.css',
    enabled = true,
    config: tastyConfig,
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

        const babelPluginConfig = [
          babelPluginPath,
          {
            output: absoluteOutput,
            ...(tastyConfig ? { config: tastyConfig } : {}),
          },
        ];

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
