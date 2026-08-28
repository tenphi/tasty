import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ServerStyleArtifact } from './collector';

const METADATA_START = '<template data-tasty-extract>';
const METADATA_END = '</template>';

interface ExtractablePage {
  path: string;
  html: string;
  artifacts: ServerStyleArtifact[];
  styleStart: number;
  replacementEnd: number;
  styleOpen: string;
}

export function createExtractionMetadata(
  artifacts: ServerStyleArtifact[],
): string {
  const encoded = Buffer.from(JSON.stringify(artifacts), 'utf8').toString(
    'base64',
  );
  return `${METADATA_START}${encoded}${METADATA_END}`;
}

function parseExtractablePage(
  path: string,
  html: string,
): ExtractablePage | null {
  const metadataStart = html.indexOf(METADATA_START);
  if (metadataStart === -1) return null;

  const metadataContentStart = metadataStart + METADATA_START.length;
  const metadataEnd = html.indexOf(METADATA_END, metadataContentStart);
  if (metadataEnd === -1) return null;

  const encoded = html.slice(metadataContentStart, metadataEnd);
  let artifacts: ServerStyleArtifact[];
  try {
    artifacts = JSON.parse(
      Buffer.from(encoded, 'base64').toString('utf8'),
    ) as ServerStyleArtifact[];
  } catch {
    return null;
  }

  const styleStart = html.lastIndexOf('<style data-tasty-ssr', metadataStart);
  if (styleStart === -1) return null;
  const styleOpenEnd = html.indexOf('>', styleStart);
  const styleEnd = html.indexOf('</style>', styleOpenEnd + 1);
  if (
    styleOpenEnd === -1 ||
    styleEnd === -1 ||
    styleEnd + '</style>'.length !== metadataStart
  ) {
    return null;
  }

  return {
    path,
    html,
    artifacts,
    styleStart,
    replacementEnd: metadataEnd + METADATA_END.length,
    styleOpen: html.slice(styleStart, styleOpenEnd + 1),
  };
}

async function findHTMLFiles(dir: string): Promise<string[]> {
  const paths: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await findHTMLFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      paths.push(path);
    }
  }
  return paths;
}

function skipCSSString(css: string, start: number, quote: string): number {
  for (let index = start + 1; index < css.length; index++) {
    if (css[index] === '\\') {
      index++;
    } else if (css[index] === quote) {
      return index + 1;
    }
  }
  return css.length;
}

function findPageRelativeURL(css: string): string | null {
  for (let index = 0; index < css.length; index++) {
    if (css[index] === '/' && css[index + 1] === '*') {
      const commentEnd = css.indexOf('*/', index + 2);
      index = commentEnd === -1 ? css.length : commentEnd + 1;
      continue;
    }

    if (css[index] === '"' || css[index] === "'") {
      index = skipCSSString(css, index, css[index]) - 1;
      continue;
    }

    if (
      css.slice(index, index + 4).toLowerCase() !== 'url(' ||
      (index > 0 && /[\w-]/.test(css[index - 1]))
    ) {
      continue;
    }

    let valueStart = index + 4;
    while (/\s/.test(css[valueStart] ?? '')) valueStart++;

    let valueEnd: number;
    const quote = css[valueStart];
    const quoted = quote === '"' || quote === "'";
    if (quoted) {
      valueEnd = skipCSSString(css, valueStart, quote) - 1;
      index = css.indexOf(')', valueEnd + 1);
    } else {
      valueEnd = valueStart;
      while (valueEnd < css.length && css[valueEnd] !== ')') {
        if (css[valueEnd] === '\\') valueEnd++;
        valueEnd++;
      }
      index = valueEnd;
    }

    if (index === -1) return null;
    const url = css.slice(valueStart + (quoted ? 1 : 0), valueEnd).trim();
    if (url && !url.startsWith('/') && !/^[a-z][a-z\d+.-]*:/i.test(url)) {
      return url;
    }
  }

  return null;
}

function validateExtractedURLs(pages: ExtractablePage[]): void {
  for (const page of pages) {
    for (const artifact of page.artifacts) {
      const url = findPageRelativeURL(artifact.css);
      if (url) {
        throw new Error(
          `[Tasty] Astro CSS extraction cannot preserve page-relative CSS URL "${url}" in ${page.path} (${artifact.kind} artifact ${artifact.id}). Use a root-relative URL such as url(/path/to/asset), an absolute URL, or a data URL.`,
        );
      }
    }
  }
}

/** Find artifacts emitted by every styled page, in the first page's order. */
function selectSharedArtifacts(
  pages: ExtractablePage[],
): ServerStyleArtifact[] {
  if (pages.length < 2) return [];

  const source = pages[0].artifacts;
  const otherIds = pages
    .slice(1)
    .map((page) => new Set(page.artifacts.map(({ id }) => id)));

  return source.filter(({ id }) => otherIds.every((ids) => ids.has(id)));
}

function stylesheetHref(
  base: string,
  assets: string,
  filename: string,
  assetsPrefix?: string | Record<string, string>,
): string {
  const assetsPath = assets.replace(/^\/+|\/+$/g, '');
  if (assetsPrefix) {
    const prefix =
      typeof assetsPrefix === 'string'
        ? assetsPrefix
        : assetsPrefix.css || assetsPrefix.fallback;
    return `${prefix.replace(/\/+$/g, '')}/${assetsPath}/${filename}`;
  }

  const basePath = base === '/' ? '' : `/${base.replace(/^\/+|\/+$/g, '')}`;
  return `${basePath}/${assetsPath}/${filename}`;
}

function stylesheetLink(page: ExtractablePage, href: string): string {
  const nonceAttr = page.styleOpen.match(/\snonce="[^"]*"/)?.[0] ?? '';
  return `<link rel="stylesheet" href="${href}" data-tasty-ssr${nonceAttr}>`;
}

function transformPage(page: ExtractablePage, hrefs: string[]): string {
  const replacement = hrefs.map((href) => stylesheetLink(page, href)).join('');

  return (
    page.html.slice(0, page.styleStart) +
    replacement +
    page.html.slice(page.replacementEnd)
  );
}

async function writeStylesheet(
  assetDir: string,
  scope: 'shared' | 'page',
  artifacts: ServerStyleArtifact[],
): Promise<string | null> {
  if (artifacts.length === 0) return null;

  const css = artifacts.map(({ css }) => css).join('\n');
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 12);
  const filename = `tasty.${scope}.${hash}.css`;
  await writeFile(join(assetDir, filename), css);
  return filename;
}

export async function extractAstroCSS(options: {
  dir: URL;
  base: string;
  assets: string;
  assetsPrefix?: string | Record<string, string>;
}): Promise<void> {
  const outputDir = fileURLToPath(options.dir);
  const paths = await findHTMLFiles(outputDir);
  const pages = (
    await Promise.all(
      paths.map(async (path) =>
        parseExtractablePage(path, await readFile(path, 'utf8')),
      ),
    )
  ).filter((page): page is ExtractablePage => page !== null);
  if (pages.length === 0) return;
  validateExtractedURLs(pages);

  const shared = selectSharedArtifacts(pages);
  const assetDir = join(outputDir, options.assets);
  await mkdir(assetDir, { recursive: true });
  const sharedFilename = await writeStylesheet(assetDir, 'shared', shared);
  const sharedHref = sharedFilename
    ? stylesheetHref(
        options.base,
        options.assets,
        sharedFilename,
        options.assetsPrefix,
      )
    : null;
  const sharedIds = new Set(shared.map(({ id }) => id));

  for (const page of pages) {
    const remainder = page.artifacts.filter(({ id }) => !sharedIds.has(id));
    const pageFilename = await writeStylesheet(assetDir, 'page', remainder);
    const hrefs = sharedHref ? [sharedHref] : [];
    if (pageFilename) {
      hrefs.push(
        stylesheetHref(
          options.base,
          options.assets,
          pageFilename,
          options.assetsPrefix,
        ),
      );
    }
    await writeFile(page.path, transformPage(page, hrefs));
  }
}
