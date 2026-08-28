import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ServerStyleArtifact } from './collector';

export type AstroCSSStrategy = 'shared' | 'single';

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

/** Topologically order the safe union while preserving every page's chunk order. */
function selectSingleArtifacts(
  pages: ExtractablePage[],
): ServerStyleArtifact[] {
  const artifacts = new Map<string, ServerStyleArtifact>();
  const edges = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const rank = new Map<string, number>();

  for (const page of pages) {
    const chunks = page.artifacts.filter(({ kind }) => kind === 'chunk');
    for (const artifact of chunks) {
      if (!artifacts.has(artifact.id)) {
        rank.set(artifact.id, rank.size);
        artifacts.set(artifact.id, artifact);
        edges.set(artifact.id, new Set());
        indegree.set(artifact.id, 0);
      }
    }
    for (let i = 1; i < chunks.length; i++) {
      const before = chunks[i - 1].id;
      const after = chunks[i].id;
      if (before === after || edges.get(before)!.has(after)) continue;
      edges.get(before)!.add(after);
      indegree.set(after, indegree.get(after)! + 1);
    }
  }

  const ready = [...artifacts.keys()]
    .filter((id) => indegree.get(id) === 0)
    .sort((a, b) => rank.get(a)! - rank.get(b)!);
  const ordered: ServerStyleArtifact[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    ordered.push(artifacts.get(id)!);
    for (const after of edges.get(id)!) {
      indegree.set(after, indegree.get(after)! - 1);
      if (indegree.get(after) === 0) {
        ready.push(after);
        ready.sort((a, b) => rank.get(a)! - rank.get(b)!);
      }
    }
  }

  // A cycle means no single order can preserve every page's cascade.
  return ordered.length === artifacts.size ? ordered : [];
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

function transformSinglePage(
  page: ExtractablePage,
  selectedIds: Set<string>,
  href: string,
): string {
  const indexes = page.artifacts
    .map((artifact, index) => (selectedIds.has(artifact.id) ? index : -1))
    .filter((index) => index !== -1);
  if (indexes.length === 0) {
    const metadataStart = page.html.indexOf(METADATA_START, page.styleStart);
    return (
      page.html.slice(0, metadataStart) + page.html.slice(page.replacementEnd)
    );
  }

  const first = indexes[0];
  const last = indexes[indexes.length - 1];
  const middle = page.artifacts.slice(first, last + 1);
  if (middle.some(({ id }) => !selectedIds.has(id))) {
    const metadataStart = page.html.indexOf(METADATA_START, page.styleStart);
    return (
      page.html.slice(0, metadataStart) + page.html.slice(page.replacementEnd)
    );
  }

  const before = page.artifacts.slice(0, first);
  const after = page.artifacts.slice(last + 1);
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
  strategy: AstroCSSStrategy;
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

  const selected =
    options.strategy === 'single'
      ? selectSingleArtifacts(pages)
      : selectSharedArtifacts(pages);
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
  const selectedIds = new Set(selected.map(({ id }) => id));
  for (const page of pages) {
    const html =
      options.strategy === 'single'
        ? transformSinglePage(page, selectedIds, href)
        : transformPage(page, selected, href);
    await writeFile(page.path, html);
  }
}
