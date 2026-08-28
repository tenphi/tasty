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

function findSequence(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Find the largest byte-sized artifact block that is contiguous on every page. */
function selectSharedArtifacts(
  pages: ExtractablePage[],
): ServerStyleArtifact[] {
  if (pages.length < 2) return [];

  const source = pages.reduce((shortest, page) =>
    page.artifacts.length < shortest.artifacts.length ? page : shortest,
  );
  const otherIds = pages
    .filter((page) => page !== source)
    .map((page) => page.artifacts.map(({ id }) => id));
  const sourceIds = source.artifacts.map(({ id }) => id);

  let best: ServerStyleArtifact[] = [];
  let bestBytes = 0;
  for (let start = 0; start < source.artifacts.length; start++) {
    let length = source.artifacts.length - start;
    for (const pageIds of otherIds) {
      let pageLength = 0;
      for (let pageStart = 0; pageStart < pageIds.length; pageStart++) {
        if (pageIds[pageStart] !== sourceIds[start]) continue;
        let matchLength = 1;
        while (
          start + matchLength < sourceIds.length &&
          pageStart + matchLength < pageIds.length &&
          sourceIds[start + matchLength] === pageIds[pageStart + matchLength]
        ) {
          matchLength++;
        }
        pageLength = Math.max(pageLength, matchLength);
      }
      length = Math.min(length, pageLength);
      if (length === 0) break;
    }

    const candidate = source.artifacts.slice(start, start + length);
    const bytes = candidate.reduce((total, item) => total + item.css.length, 0);
    if (bytes > bestBytes) {
      best = candidate;
      bestBytes = bytes;
    }
  }

  return best;
}

function stylesheetHref(
  base: string,
  assets: string,
  filename: string,
): string {
  const basePath = base === '/' ? '' : `/${base.replace(/^\/+|\/+$/g, '')}`;
  const assetsPath = assets.replace(/^\/+|\/+$/g, '');
  return `${basePath}/${assetsPath}/${filename}`;
}

function styleTag(styleOpen: string, artifacts: ServerStyleArtifact[]): string {
  if (artifacts.length === 0) return '';
  return `${styleOpen}${artifacts.map(({ css }) => css).join('\n')}</style>`;
}

function transformPage(
  page: ExtractablePage,
  selected: ServerStyleArtifact[],
  href: string,
): string {
  const selectedIds = selected.map(({ id }) => id);
  const pageIds = page.artifacts.map(({ id }) => id);
  const first = findSequence(pageIds, selectedIds);
  if (first === -1) {
    const metadataStart = page.html.indexOf(METADATA_START, page.styleStart);
    return (
      page.html.slice(0, metadataStart) + page.html.slice(page.replacementEnd)
    );
  }

  const before = page.artifacts.slice(0, first);
  const after = page.artifacts.slice(first + selected.length);
  const link = `<link rel="stylesheet" href="${href}" data-tasty-ssr>`;
  const replacement =
    styleTag(page.styleOpen, before) + link + styleTag(page.styleOpen, after);

  return (
    page.html.slice(0, page.styleStart) +
    replacement +
    page.html.slice(page.replacementEnd)
  );
}

export async function extractAstroCSS(options: {
  dir: URL;
  base: string;
  assets: string;
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

  const selected = selectSharedArtifacts(pages);
  if (selected.length === 0) {
    for (const page of pages) {
      const metadataStart = page.html.indexOf(METADATA_START, page.styleStart);
      await writeFile(
        page.path,
        page.html.slice(0, metadataStart) +
          page.html.slice(page.replacementEnd),
      );
    }
    return;
  }

  const css = selected.map(({ css }) => css).join('\n');
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 12);
  const filename = `tasty.${hash}.css`;
  const assetDir = join(outputDir, options.assets);
  await mkdir(assetDir, { recursive: true });
  await writeFile(join(assetDir, filename), css);

  const href = stylesheetHref(options.base, options.assets, filename);
  for (const page of pages) {
    await writeFile(page.path, transformPage(page, selected, href));
  }
}
