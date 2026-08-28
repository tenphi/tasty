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

function decodeCSSEscapes(value: string): string {
  return value.replace(
    /\\(?:([\da-f]{1,6})\s?|\r\n|[\n\r\f]|(.))/gi,
    (_match, hex: string | undefined, escaped: string | undefined) => {
      if (hex) {
        const codePoint = Number.parseInt(hex, 16);
        return codePoint === 0 || codePoint > 0x10ffff
          ? '\ufffd'
          : String.fromCodePoint(codePoint);
      }
      return escaped ?? '';
    },
  );
}

function readCSSIdentifier(
  css: string,
  start: number,
): { name: string; end: number } | null {
  let name = '';
  let index = start;

  while (index < css.length) {
    const char = css[index];
    if (/[-_a-z\d]/i.test(char) || char.charCodeAt(0) >= 0x80) {
      name += char;
      index++;
      continue;
    }
    if (char !== '\\' || index + 1 >= css.length) break;

    const hex = css.slice(index + 1).match(/^[\da-f]{1,6}/i)?.[0];
    if (hex) {
      name += decodeCSSEscapes(`\\${hex}`);
      index += hex.length + 1;
      if (/\s/.test(css[index] ?? '')) index++;
      continue;
    }

    if (/\r|\n|\f/.test(css[index + 1])) break;
    name += css[index + 1];
    index += 2;
  }

  return index === start ? null : { name, end: index };
}

function skipCSSWhitespaceAndComments(css: string, start: number): number {
  let index = start;
  for (;;) {
    while (/\s/.test(css[index] ?? '')) index++;
    if (css[index] !== '/' || css[index + 1] !== '*') return index;
    const commentEnd = css.indexOf('*/', index + 2);
    if (commentEnd === -1) return css.length;
    index = commentEnd + 2;
  }
}

interface UnsafeCSSResource {
  url: string;
  rootRelative: boolean;
}

function classifyCSSResource(
  rawURL: string,
  rejectRootRelative: boolean,
): UnsafeCSSResource | null {
  const url = decodeCSSEscapes(rawURL).trim();
  if (!url || url.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(url)) {
    return null;
  }
  if (url.startsWith('/')) {
    return rejectRootRelative ? { url: rawURL, rootRelative: true } : null;
  }
  return { url: rawURL, rootRelative: false };
}

function findUnsafeCSSResource(
  css: string,
  rejectRootRelative: boolean,
): UnsafeCSSResource | null {
  const functionStack: (string | null)[] = [];
  const stringResourceFunctions = new Set([
    'image',
    'image-set',
    '-webkit-image-set',
    'src',
  ]);

  for (let index = 0; index < css.length; index++) {
    if (css[index] === '/' && css[index + 1] === '*') {
      const commentEnd = css.indexOf('*/', index + 2);
      index = commentEnd === -1 ? css.length : commentEnd + 1;
      continue;
    }

    const quote = css[index];
    if (quote === '"' || quote === "'") {
      const stringEnd = skipCSSString(css, index, quote);
      if (stringResourceFunctions.has(functionStack.at(-1) ?? '')) {
        const unsafe = classifyCSSResource(
          css.slice(index + 1, stringEnd - 1),
          rejectRootRelative,
        );
        if (unsafe) return unsafe;
      }
      index = stringEnd - 1;
      continue;
    }

    if (css[index] === ')') {
      functionStack.pop();
      continue;
    }

    if (css[index] === '(') {
      functionStack.push(null);
      continue;
    }

    if (css[index] === '@') {
      const atRule = readCSSIdentifier(css, index + 1);
      if (atRule?.name.toLowerCase() === 'import') {
        const valueStart = skipCSSWhitespaceAndComments(css, atRule.end);
        const importQuote = css[valueStart];
        if (importQuote === '"' || importQuote === "'") {
          const valueEnd = skipCSSString(css, valueStart, importQuote);
          const unsafe = classifyCSSResource(
            css.slice(valueStart + 1, valueEnd - 1),
            rejectRootRelative,
          );
          if (unsafe) return unsafe;
        }
      }
      continue;
    }

    const identifier = readCSSIdentifier(css, index);
    if (!identifier || css[identifier.end] !== '(') continue;

    const functionName = identifier.name.toLowerCase();
    if (functionName !== 'url') {
      functionStack.push(functionName);
      index = identifier.end;
      continue;
    }

    const valueStart = skipCSSWhitespaceAndComments(css, identifier.end + 1);
    const urlQuote = css[valueStart];
    const quoted = urlQuote === '"' || urlQuote === "'";
    let valueEnd: number;
    if (quoted) {
      valueEnd = skipCSSString(css, valueStart, urlQuote) - 1;
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
    const unsafe = classifyCSSResource(
      css.slice(valueStart + (quoted ? 1 : 0), valueEnd),
      rejectRootRelative,
    );
    if (unsafe) return unsafe;
  }

  return null;
}

function crossOriginAssetsPrefix(
  assetsPrefix?: string | Record<string, string>,
  site?: URL,
): string | null {
  if (!assetsPrefix) return null;
  const prefix =
    typeof assetsPrefix === 'string'
      ? assetsPrefix
      : assetsPrefix.css || assetsPrefix.fallback;
  if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(prefix)) return null;
  if (!site) return prefix;

  try {
    const prefixURL = prefix.startsWith('//')
      ? new URL(`${site.protocol}${prefix}`)
      : new URL(prefix);
    return prefixURL.origin === site.origin ? null : prefix;
  } catch {
    return prefix;
  }
}

function validateExtractedURLs(
  pages: ExtractablePage[],
  assetsPrefix?: string | Record<string, string>,
  site?: URL,
): void {
  const externalPrefix = crossOriginAssetsPrefix(assetsPrefix, site);
  for (const page of pages) {
    for (const artifact of page.artifacts) {
      const unsafe = findUnsafeCSSResource(
        artifact.css,
        externalPrefix !== null,
      );
      if (unsafe) {
        const reason = unsafe.rootRelative
          ? `root-relative CSS URL "${unsafe.url}" would resolve against the external assetsPrefix "${externalPrefix}" instead of the page origin`
          : `page-relative CSS URL "${unsafe.url}" cannot preserve its target`;
        throw new Error(
          `[Tasty] Astro CSS extraction cannot preserve ${reason} in ${page.path} (${artifact.kind} artifact ${artifact.id}). Use an absolute URL or a data URL${externalPrefix ? '' : ', or a root-relative URL such as url(/path/to/asset)'}.`,
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
  site?: URL;
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
  validateExtractedURLs(pages, options.assetsPrefix, options.site);

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
