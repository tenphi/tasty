/**
 * Next.js configuration wrapper for extracting Tasty's configured global CSS.
 *
 * Import this Node-only module from `next.config.ts`. The client-safe registry
 * remains available from `@tenphi/tasty/ssr/next`.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { createJiti as createJitiType } from 'jiti';

import { configure, resetConfig, type TastyConfig } from '../config';
import { ServerStyleCollector } from './collector';
import { findUnsafeCSSResource } from './css-resources';

const ENV_KEY = 'TASTY_NEXT_SHARED_CSS_HREF';
const packageRequire = createRequire(import.meta.url);

interface NextConfig {
  basePath?: string;
  env?: Record<string, string | undefined>;
  headers?: () => Promise<NextHeader[]>;
  output?: string;
  [key: string]: unknown;
}

interface NextHeader {
  source: string;
  headers: { key: string; value: string }[];
  [key: string]: unknown;
}

export interface TastyNextOptions {
  /**
   * Next.js project directory. Useful when the build command runs from a
   * monorepo root rather than the app directory.
   *
   * @default process.cwd()
   */
  rootDir?: string;

  /**
   * Tasty configuration used to generate the shared stylesheet.
   * `config` takes precedence when both config sources are provided.
   */
  config?: TastyConfig;

  /**
   * Project-relative path to a TypeScript/JavaScript module whose default
   * export is a Tasty configuration object.
   *
   * @example './app/tasty.config.ts'
   */
  configFile?: string;

  /**
   * Filesystem directory for generated stylesheets. When it is inside the
   * project's `public` directory, its public URL is inferred automatically.
   *
   * @default 'public/_tasty'
   */
  outputDir?: string;

  /**
   * Root-relative URL path corresponding to `outputDir`. This is required
   * when `outputDir` is outside the project's `public` directory.
   * The Next.js `basePath` is prepended automatically.
   *
   * @default inferred from outputDir
   * @example '/assets/tasty'
   */
  publicPath?: string;

  /** Whether to generate and register the shared stylesheet. @default true */
  enabled?: boolean;
}

function loadConfig(
  projectDir: string,
  options: TastyNextOptions,
): TastyConfig {
  if (options.config) return options.config;
  if (!options.configFile) {
    throw new Error(
      '[Tasty] withTastyNext() requires either `config` or `configFile`.',
    );
  }

  const configPath = resolve(projectDir, options.configFile);
  let jitiPath: string;
  try {
    jitiPath = packageRequire.resolve('jiti');
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      throw new Error(
        '[Tasty] `configFile` requires the optional `jiti` package. Install `jiti` or pass the imported config through `config` instead.',
        { cause: error },
      );
    }
    throw error;
  }
  const { createJiti } = packageRequire(jitiPath) as {
    createJiti: typeof createJitiType;
  };
  const jiti = createJiti(projectDir, { moduleCache: false });
  const loaded = jiti(configPath) as TastyConfig | { default: TastyConfig };

  return loaded && typeof loaded === 'object' && 'default' in loaded
    ? loaded.default
    : loaded;
}

function collectSharedCSS(config: TastyConfig): string {
  resetConfig();
  try {
    configure(config);
    const collector = new ServerStyleCollector();
    collector.collectInternals();
    const artifacts = collector.getArtifacts();

    for (const artifact of artifacts) {
      const unsafe = findUnsafeCSSResource(artifact.css, false);
      if (unsafe) {
        throw new Error(
          `[Tasty] Next.js shared CSS extraction cannot preserve page-relative CSS URL "${unsafe.url}" in ${artifact.kind} artifact ${artifact.id}. Use an absolute URL, a data URL, or a root-relative URL such as url(/path/to/asset).`,
        );
      }
    }

    return artifacts.map(({ css }) => css).join('\n');
  } finally {
    resetConfig();
  }
}

function inferPublicPath(projectDir: string, outputDir: string): string {
  const publicDir = resolve(projectDir, 'public');
  const relativePath = relative(publicDir, outputDir);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      '[Tasty] `publicPath` is required when `outputDir` is outside the Next.js public directory.',
    );
  }

  return `/${relativePath.split(sep).filter(Boolean).join('/')}`;
}

function normalizeURLPath(path: string, option: string): string {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('\\')
  ) {
    throw new Error(`[Tasty] \`${option}\` must be a root-relative URL path.`);
  }

  let end = path.length;
  while (end > 0 && path[end - 1] === '/') end--;
  return path.slice(0, end);
}

function writeSharedCSS(outputDir: string, css: string): string {
  mkdirSync(outputDir, { recursive: true });
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 12);
  const filename = `tasty.shared.${hash}.css`;

  const outputPath = join(outputDir, filename);
  let existing: string | undefined;
  try {
    existing = readFileSync(outputPath, 'utf8');
  } catch {
    // The file does not exist yet (or is unreadable); write it below.
  }
  if (existing !== css) writeFileSync(outputPath, css);

  return filename;
}

/**
 * Add a cacheable, content-hashed stylesheet for Tasty configuration globals.
 * Route-dependent component and hook styles continue to stream through
 * `TastyRegistry` so App Router navigation and Suspense remain correct.
 */
export function withTastyNext(options: TastyNextOptions) {
  return (nextConfig: NextConfig = {}): NextConfig => {
    if (options.enabled === false) return nextConfig;

    const projectDir = resolve(process.cwd(), options.rootDir ?? '.');
    const outputDir = resolve(projectDir, options.outputDir ?? 'public/_tasty');
    const publicPath = normalizeURLPath(
      options.publicPath ?? inferPublicPath(projectDir, outputDir),
      'publicPath',
    );
    const basePath = normalizeURLPath(nextConfig.basePath || '/', 'basePath');
    const css = collectSharedCSS(loadConfig(projectDir, options));

    if (!css) return nextConfig;

    const filename = writeSharedCSS(outputDir, css);
    const href = `${basePath}${publicPath}/${filename}`;
    const headerSource = `${publicPath}/${filename}`;
    const existingEnv = nextConfig.env ?? {};
    const existingHeaders = nextConfig.headers;
    if (existingEnv[ENV_KEY] && existingEnv[ENV_KEY] !== href) {
      throw new Error(
        `[Tasty] Next.js env key ${ENV_KEY} is reserved by withTastyNext().`,
      );
    }

    const generatedConfig: NextConfig = {
      ...nextConfig,
      env: {
        ...existingEnv,
        [ENV_KEY]: href,
      },
    };

    // `headers()` is not emitted by Next's static export. Avoid introducing an
    // unsupported-config warning; the content hash still makes the asset safe
    // for the static host to cache immutably.
    if (nextConfig.output === 'export') return generatedConfig;

    return {
      ...generatedConfig,
      async headers() {
        const headers = existingHeaders ? await existingHeaders() : [];
        return [
          ...headers,
          {
            source: headerSource,
            headers: [
              {
                key: 'Cache-Control',
                value: 'public, max-age=31536000, immutable',
              },
            ],
          },
        ];
      },
    };
  };
}
