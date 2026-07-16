/* eslint-disable no-console */
import { CHUNK_NAMES } from './chunks/definitions';
import { getNamePrefix } from './config';
import { getCSSTextForNode, injector } from './injector';
import type { CacheMetrics, RootRegistry } from './injector/types';
import { isDevEnv } from './utils/is-dev-env';
import { tastyClassRegex } from './utils/name-prefix';

declare global {
  interface Window {
    tastyDebug?: typeof tastyDebug;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CSSTarget =
  | 'all'
  | 'global'
  | 'active'
  | 'unused'
  | 'page'
  | string
  | string[]
  | Element;

export interface DebugOptions {
  root?: Document | ShadowRoot;
  /** Suppress console logging and return data only (default: false) */
  raw?: boolean;
}

export interface CssOptions extends DebugOptions {
  prettify?: boolean;
  /** Read from stored source CSS (dev-mode only) instead of live CSSOM */
  source?: boolean;
}

export interface DebugChunkInfo {
  className: string;
  chunkName: string | null;
}

export interface InspectResult {
  element?: Element | null;
  classes: string[];
  chunks: DebugChunkInfo[];
  css: string;
  size: number;
  rules: number;
}

export interface CacheStatus {
  classes: {
    active: string[];
    unused: string[];
    all: string[];
  };
  metrics: CacheMetrics | null;
}

export interface ChunkBreakdown {
  byChunk: Record<
    string,
    { classes: string[]; cssSize: number; ruleCount: number }
  >;
  totalChunkTypes: number;
  totalClasses: number;
}

export interface Summary {
  activeClasses: string[];
  unusedClasses: string[];
  totalStyledClasses: string[];

  activeCSSSize: number;
  unusedCSSSize: number;
  globalCSSSize: number;
  rawCSSSize: number;
  keyframesCSSSize: number;
  propertyCSSSize: number;
  totalCSSSize: number;

  activeRuleCount: number;
  unusedRuleCount: number;
  globalRuleCount: number;
  rawRuleCount: number;
  keyframesRuleCount: number;
  propertyRuleCount: number;
  totalRuleCount: number;

  metrics: CacheMetrics | null;
  definedProperties: string[];
  definedKeyframes: { name: string; refCount: number }[];
  chunkBreakdown: ChunkBreakdown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtSize(bytes: number): string {
  return bytes > 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${bytes}B`;
}

function countRules(css: string): number {
  return (css.match(/\{[^}]*\}/g) || []).length;
}

function sortTastyClasses(classes: Iterable<string>): string[] {
  // Class names use a base36 hash format (e.g. `t3a5f`), so sort lexicographically.
  return Array.from(classes).sort((a, b) => a.localeCompare(b));
}

function getRegistry(
  root: Document | ShadowRoot = document,
): RootRegistry | undefined {
  return injector.instance._sheetManager?.getRegistry(root);
}

function getUnusedClasses(root: Document | ShadowRoot = document): string[] {
  const registry = getRegistry(root);
  if (!registry) return [];
  const result: string[] = [];
  for (const [cls, rc] of registry.refCounts as Map<string, number>) {
    if (rc === 0) result.push(cls);
  }
  return sortTastyClasses(result);
}

function findDomTastyClasses(root: Document | ShadowRoot = document): string[] {
  const classes = new Set<string>();
  const elements = (root as Document).querySelectorAll?.('[class]') || [];
  const classRegex = tastyClassRegex(getNamePrefix());
  elements.forEach((el) => {
    const attr = el.getAttribute('class');
    if (attr) {
      for (const cls of attr.split(/\s+/)) {
        if (classRegex.test(cls)) classes.add(cls);
      }
    }
  });
  return sortTastyClasses(classes);
}

// ---------------------------------------------------------------------------
// prettifyCSS — readable output for nested at-rules & comma selectors
// ---------------------------------------------------------------------------

function prettifyCSS(css: string): string {
  if (!css || !css.trim()) return '';

  const out: string[] = [];
  let depth = 0;
  const indent = () => '  '.repeat(depth);

  let normalized = css.replace(/\s+/g, ' ').trim();
  // Ensure braces are surrounded by spaces for splitting
  normalized = normalized.replace(/\s*\{\s*/g, ' { ');
  normalized = normalized.replace(/\s*\}\s*/g, ' } ');
  normalized = normalized.replace(/;\s*/g, '; ');

  const tokens = normalized.split(/\s+/);
  let buf = '';

  for (const t of tokens) {
    if (t === '{') {
      // buf contains the selector / at-rule header
      const header = buf.trim();
      if (header) {
        // Split comma-separated selectors onto their own lines
        // but only if the comma is outside parentheses
        const parts = splitOutsideParens(header, ',');
        if (parts.length > 1) {
          out.push(
            parts
              .map((p, idx) =>
                idx === 0
                  ? `${indent()}${p.trim()},`
                  : `${indent()}${p.trim()}${idx < parts.length - 1 ? ',' : ''}`,
              )
              .join('\n') + ' {',
          );
        } else {
          out.push(`${indent()}${header} {`);
        }
      } else {
        out.push(`${indent()}{`);
      }
      depth++;
      buf = '';
    } else if (t === '}') {
      // Flush any trailing declarations
      if (buf.trim()) {
        for (const decl of buf.split(';').filter((s) => s.trim())) {
          out.push(`${indent()}${decl.trim()};`);
        }
        buf = '';
      }
      depth = Math.max(0, depth - 1);
      out.push(`${indent()}}`);
    } else if (t.endsWith(';')) {
      buf += ` ${t}`;
      const full = buf.trim();
      if (full) out.push(`${indent()}${full}`);
      buf = '';
    } else {
      buf += ` ${t}`;
    }
  }
  if (buf.trim()) out.push(buf.trim());

  return out
    .filter((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split `str` by `sep` only when not inside parentheses */
function splitOutsideParens(str: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && str.startsWith(sep, i)) {
      parts.push(str.slice(start, i));
      start = i + sep.length;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

// ---------------------------------------------------------------------------
// Chunk helpers
// ---------------------------------------------------------------------------

function extractChunkName(cacheKey: string): string | null {
  for (const part of cacheKey.split('\0')) {
    if (part.startsWith('[states:')) continue;
    if (!part.includes(':') && part.length > 0) return part;
  }
  return null;
}

function getChunkForClass(
  className: string,
  root: Document | ShadowRoot = document,
): string | null {
  const registry = getRegistry(root);
  if (!registry) return null;
  for (const [key, cn] of registry.cacheKeyToClassName) {
    if (cn === className) return extractChunkName(key);
  }
  return null;
}

function buildChunkBreakdown(
  root: Document | ShadowRoot = document,
): ChunkBreakdown {
  const registry = getRegistry(root);
  if (!registry) return { byChunk: {}, totalChunkTypes: 0, totalClasses: 0 };

  const byChunk: ChunkBreakdown['byChunk'] = {};
  for (const [cacheKey, className] of registry.cacheKeyToClassName) {
    const chunk = extractChunkName(cacheKey) || 'unknown';
    if (!byChunk[chunk])
      byChunk[chunk] = { classes: [], cssSize: 0, ruleCount: 0 };
    byChunk[chunk].classes.push(className);
    const css = injector.instance.getCSSTextForClasses([className], { root });
    byChunk[chunk].cssSize += css.length;
    byChunk[chunk].ruleCount += countRules(css);
  }

  for (const entry of Object.values(byChunk)) {
    entry.classes = sortTastyClasses(entry.classes);
  }

  const totalClasses = Object.values(byChunk).reduce(
    (s, e) => s + e.classes.length,
    0,
  );
  return {
    byChunk,
    totalChunkTypes: Object.keys(byChunk).length,
    totalClasses,
  };
}

// ---------------------------------------------------------------------------
// Global-type CSS helper (internal only)
// ---------------------------------------------------------------------------

function getGlobalTypeCSS(
  type: 'global' | 'raw' | 'keyframes' | 'property',
  root: Document | ShadowRoot = document,
): { css: string; ruleCount: number; size: number } {
  const registry = getRegistry(root);
  if (!registry) return { css: '', ruleCount: 0, size: 0 };

  const chunks: string[] = [];
  let rc = 0;

  if (type === 'keyframes') {
    for (const [, entry] of registry.keyframesCache) {
      const info = entry.info;
      const sheetInfo = registry.sheets[info.sheetIndex];
      const sm = injector.instance._sheetManager;
      const ss = sheetInfo && sm ? sm.getCSSSheet(sheetInfo) : null;
      if (ss && info.ruleIndex < ss.cssRules.length) {
        const rule = ss.cssRules[info.ruleIndex];
        if (rule) {
          chunks.push(rule.cssText);
          rc++;
        }
      } else if (info.cssText) {
        chunks.push(info.cssText);
        rc++;
      }
    }
  } else {
    const prefix =
      type === 'global' ? 'global:' : type === 'raw' ? 'raw:' : 'property:';
    for (const [key, ri] of registry.globalRules) {
      if (!key.startsWith(prefix)) continue;
      const sheetInfo = registry.sheets[ri.sheetIndex];
      const sm = injector.instance._sheetManager;
      const ss = sheetInfo && sm ? sm.getCSSSheet(sheetInfo) : null;
      if (ss) {
        const start = Math.max(0, ri.ruleIndex);
        const end = Math.min(
          ss.cssRules.length - 1,
          (ri.endRuleIndex as number) ?? ri.ruleIndex,
        );
        if (start >= 0 && end >= start && start < ss.cssRules.length) {
          for (let i = start; i <= end; i++) {
            const rule = ss.cssRules[i];
            if (rule) {
              chunks.push(rule.cssText);
              rc++;
            }
          }
        }
      } else if (ri.cssText?.length) {
        chunks.push(...ri.cssText);
        rc += ri.cssText.length;
      }
    }
  }

  const raw = chunks.join('\n');
  return { css: prettifyCSS(raw), ruleCount: rc, size: raw.length };
}

// ---------------------------------------------------------------------------
// Source CSS (dev-mode RuleInfo.cssText)
// ---------------------------------------------------------------------------

function getSourceCssForClasses(
  classNames: string[],
  root: Document | ShadowRoot = document,
): string | null {
  const registry = getRegistry(root);
  if (!registry) return null;

  const chunks: string[] = [];
  let found = false;
  for (const cls of classNames) {
    const info = registry.rules.get(cls);
    if (info?.cssText?.length) {
      chunks.push(...info.cssText);
      found = true;
    }
  }
  return found ? chunks.join('\n') : null;
}

// ---------------------------------------------------------------------------
// Definitions helper (internal)
// ---------------------------------------------------------------------------

function getDefs(root: Document | ShadowRoot = document) {
  const registry = getRegistry(root);
  let properties: string[] = [];
  if (registry?.injectedProperties) {
    properties = Array.from(
      (registry.injectedProperties as Map<string, string>).keys(),
    ).sort();
  }

  const keyframes: { name: string; refCount: number }[] = [];
  if (registry) {
    for (const entry of registry.keyframesCache.values()) {
      keyframes.push({ name: entry.name, refCount: entry.refCount });
    }
    keyframes.sort((a, b) => a.name.localeCompare(b.name));
  }

  return { properties, keyframes };
}

// ---------------------------------------------------------------------------
// Chunk display order
// ---------------------------------------------------------------------------

const CHUNK_ORDER = [
  CHUNK_NAMES.COMBINED,
  CHUNK_NAMES.APPEARANCE,
  CHUNK_NAMES.FONT,
  CHUNK_NAMES.DIMENSION,
  CHUNK_NAMES.DISPLAY,
  CHUNK_NAMES.LAYOUT,
  CHUNK_NAMES.POSITION,
  CHUNK_NAMES.MISC,
  CHUNK_NAMES.SUBCOMPONENTS,
];

// ---------------------------------------------------------------------------
// tastyDebug API
// ---------------------------------------------------------------------------

export const tastyDebug = {
  css(target: CSSTarget, opts?: CssOptions): string {
    const {
      root = document,
      prettify = true,
      raw = false,
      source = false,
    } = opts || {};
    let css = '';

    const classRegex = tastyClassRegex(getNamePrefix());
    if (source && typeof target === 'string' && classRegex.test(target)) {
      const src = getSourceCssForClasses([target], root);
      if (src) {
        css = src;
      } else {
        if (!raw) {
          console.warn(
            'tastyDebug: source CSS not available (requires dev mode or TASTY_DEBUG=true). Falling back to live CSSOM.',
          );
        }
        css = injector.instance.getCSSTextForClasses([target], { root });
      }
    } else if (source && Array.isArray(target)) {
      const src = getSourceCssForClasses(target, root);
      if (src) {
        css = src;
      } else {
        if (!raw) {
          console.warn(
            'tastyDebug: source CSS not available. Falling back to live CSSOM.',
          );
        }
        css = injector.instance.getCSSTextForClasses(target, { root });
      }
    } else if (typeof target === 'string') {
      if (target === 'all') {
        css = injector.instance.getCSSText({ root });
      } else if (target === 'global') {
        css = getGlobalTypeCSS('global', root).css;
        return css; // already prettified
      } else if (target === 'active') {
        const active = findDomTastyClasses(root);
        css = injector.instance.getCSSTextForClasses(active, { root });
      } else if (target === 'unused') {
        const unused = getUnusedClasses(root);
        css = injector.instance.getCSSTextForClasses(unused, { root });
      } else if (target === 'page') {
        css = getPageCSS(root);
      } else if (classRegex.test(target)) {
        css = injector.instance.getCSSTextForClasses([target], { root });
      } else {
        const el = (root as Document).querySelector?.(target);
        if (el) css = getCSSTextForNode(el, { root });
      }
    } else if (Array.isArray(target)) {
      css = injector.instance.getCSSTextForClasses(target, { root });
    } else if (target instanceof Element) {
      css = getCSSTextForNode(target, { root });
    }

    const result = prettify ? prettifyCSS(css) : css;

    if (!raw) {
      const label = Array.isArray(target) ? `[${target.join(', ')}]` : target;
      const rc = countRules(css);
      console.group(`CSS for ${label} (${rc} rules, ${fmtSize(css.length)})`);
      console.log(result || '(empty)');
      console.groupEnd();
    }

    return result;
  },

  inspect(target: string | Element, opts?: DebugOptions): InspectResult {
    const { root = document, raw = false } = opts || {};
    const element =
      typeof target === 'string'
        ? (root as Document).querySelector?.(target)
        : target;

    if (!element) {
      const empty: InspectResult = {
        element: null,
        classes: [],
        chunks: [],
        css: '',
        size: 0,
        rules: 0,
      };
      if (!raw) console.warn('tastyDebug.inspect: element not found');
      return empty;
    }

    const classList = element.getAttribute('class') || '';
    const classRegex = tastyClassRegex(getNamePrefix());
    const tastyClasses = classList
      .split(/\s+/)
      .filter((cls) => classRegex.test(cls));

    const chunks: DebugChunkInfo[] = tastyClasses.map((className) => ({
      className,
      chunkName: getChunkForClass(className, root),
    }));

    const css = getCSSTextForNode(element, { root });
    const rules = countRules(css);

    const result: InspectResult = {
      element,
      classes: tastyClasses,
      chunks,
      css: prettifyCSS(css),
      size: css.length,
      rules,
    };

    if (!raw) {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      console.group(
        `inspect ${tag}${id} — ${tastyClasses.length} classes, ${rules} rules, ${fmtSize(css.length)}`,
      );
      if (chunks.length) {
        console.log(
          'Chunks:',
          chunks.map((c) => `${c.className}→${c.chunkName || '?'}`).join(', '),
        );
      }
      console.groupCollapsed('CSS');
      console.log(result.css || '(empty)');
      console.groupEnd();
      console.groupEnd();
    }

    return result;
  },

  summary(opts?: DebugOptions): Summary {
    const { root = document, raw = false } = opts || {};

    const activeClasses = findDomTastyClasses(root);
    const unusedClasses = getUnusedClasses(root);
    const totalStyledClasses = [...activeClasses, ...unusedClasses];

    const activeCSS = injector.instance.getCSSTextForClasses(activeClasses, {
      root,
    });
    const unusedCSS = injector.instance.getCSSTextForClasses(unusedClasses, {
      root,
    });
    const allCSS = injector.instance.getCSSText({ root });

    const activeRuleCount = countRules(activeCSS);
    const unusedRuleCount = countRules(unusedCSS);

    const globalData = getGlobalTypeCSS('global', root);
    const rawData = getGlobalTypeCSS('raw', root);
    const kfData = getGlobalTypeCSS('keyframes', root);
    const propData = getGlobalTypeCSS('property', root);

    const totalRuleCount =
      activeRuleCount +
      unusedRuleCount +
      globalData.ruleCount +
      rawData.ruleCount +
      kfData.ruleCount +
      propData.ruleCount;

    const metrics = injector.instance.getMetrics({ root });
    const defs = getDefs(root);
    const chunkBreakdown = buildChunkBreakdown(root);

    const summary: Summary = {
      activeClasses,
      unusedClasses,
      totalStyledClasses,
      activeCSSSize: activeCSS.length,
      unusedCSSSize: unusedCSS.length,
      globalCSSSize: globalData.size,
      rawCSSSize: rawData.size,
      keyframesCSSSize: kfData.size,
      propertyCSSSize: propData.size,
      totalCSSSize: allCSS.length,
      activeRuleCount,
      unusedRuleCount,
      globalRuleCount: globalData.ruleCount,
      rawRuleCount: rawData.ruleCount,
      keyframesRuleCount: kfData.ruleCount,
      propertyRuleCount: propData.ruleCount,
      totalRuleCount,
      metrics,
      definedProperties: defs.properties,
      definedKeyframes: defs.keyframes,
      chunkBreakdown,
    };

    if (!raw) {
      console.group('Tasty Summary');
      console.log(
        `Active:   ${activeClasses.length} classes, ${activeRuleCount} rules, ${fmtSize(activeCSS.length)}`,
      );
      console.log(
        `Unused:   ${unusedClasses.length} classes, ${unusedRuleCount} rules, ${fmtSize(unusedCSS.length)}`,
      );
      console.log(
        `Global:   ${globalData.ruleCount} rules, ${fmtSize(globalData.size)}`,
      );
      if (rawData.ruleCount)
        console.log(
          `Raw:      ${rawData.ruleCount} rules, ${fmtSize(rawData.size)}`,
        );
      if (kfData.ruleCount)
        console.log(
          `Keyframes: ${kfData.ruleCount} rules, ${fmtSize(kfData.size)}`,
        );
      if (propData.ruleCount)
        console.log(
          `@property: ${propData.ruleCount} rules, ${fmtSize(propData.size)}`,
        );
      console.log(
        `Total:    ${totalStyledClasses.length} classes, ${totalRuleCount} rules, ${fmtSize(allCSS.length)}`,
      );

      if (metrics) {
        const total = metrics.hits + metrics.misses;
        const rate = total > 0 ? ((metrics.hits / total) * 100).toFixed(1) : 0;
        console.log(`Cache:    ${rate}% hit rate (${total} lookups)`);
      }

      if (chunkBreakdown.totalChunkTypes > 0) {
        console.groupCollapsed(
          `Chunks (${chunkBreakdown.totalChunkTypes} types, ${chunkBreakdown.totalClasses} classes)`,
        );
        for (const name of CHUNK_ORDER) {
          const d = chunkBreakdown.byChunk[name];
          if (d)
            console.log(
              `  ${name}: ${d.classes.length} cls, ${d.ruleCount} rules, ${fmtSize(d.cssSize)}`,
            );
        }
        for (const [name, d] of Object.entries(chunkBreakdown.byChunk)) {
          if (!CHUNK_ORDER.includes(name as (typeof CHUNK_ORDER)[number]))
            console.log(
              `  ${name}: ${d.classes.length} cls, ${d.ruleCount} rules, ${fmtSize(d.cssSize)}`,
            );
        }
        console.groupEnd();
      }

      if (defs.properties.length || defs.keyframes.length) {
        console.log(
          `Defs:     ${defs.properties.length} @property, ${defs.keyframes.length} @keyframes`,
        );
      }

      console.groupEnd();
    }

    return summary;
  },

  chunks(opts?: DebugOptions): ChunkBreakdown {
    const { root = document, raw = false } = opts || {};
    const breakdown = buildChunkBreakdown(root);

    if (!raw) {
      console.group(
        `Chunks (${breakdown.totalChunkTypes} types, ${breakdown.totalClasses} classes)`,
      );
      for (const name of CHUNK_ORDER) {
        const d = breakdown.byChunk[name];
        if (d)
          console.log(
            `  ${name}: ${d.classes.length} cls, ${d.ruleCount} rules, ${fmtSize(d.cssSize)}`,
          );
      }
      for (const [name, d] of Object.entries(breakdown.byChunk)) {
        if (!CHUNK_ORDER.includes(name as (typeof CHUNK_ORDER)[number]))
          console.log(
            `  ${name}: ${d.classes.length} cls, ${d.ruleCount} rules, ${fmtSize(d.cssSize)}`,
          );
      }
      console.groupEnd();
    }

    return breakdown;
  },

  cache(opts?: DebugOptions): CacheStatus {
    const { root = document, raw = false } = opts || {};
    const active = findDomTastyClasses(root);
    const unused = getUnusedClasses(root);
    const metrics = injector.instance.getMetrics({ root });

    const status: CacheStatus = {
      classes: { active, unused, all: [...active, ...unused] },
      metrics,
    };

    if (!raw) {
      console.group('Cache');
      console.log(`Active: ${active.length}, Unused: ${unused.length}`);
      if (metrics) {
        const total = metrics.hits + metrics.misses;
        const rate = total > 0 ? ((metrics.hits / total) * 100).toFixed(1) : 0;
        console.log(
          `Hits: ${metrics.hits}, Misses: ${metrics.misses}, Rate: ${rate}%`,
        );
      }
      console.groupEnd();
    }

    return status;
  },

  cleanup(opts?: { root?: Document | ShadowRoot }): void {
    injector.instance.cleanup(opts?.root);
  },

  help(): void {
    console.log(`tastyDebug API:
  .summary()            — overview (classes, rules, sizes)
  .css("active")        — CSS for classes in DOM
  .css("t42")           — CSS for a specific class
  .css("t42",{source:1})— original CSS before browser parsing (dev only)
  .css(".selector")     — CSS for a DOM element
  .inspect(".selector") — element details (classes, chunks, rules)
  .chunks()             — style chunk breakdown
  .cache()              — cache status and metrics
  .cleanup()            — force unused style cleanup
Options: { raw: true } suppresses logging, { root: shadowRoot } targets Shadow DOM`);
  },

  install(): void {
    if (typeof window !== 'undefined' && window.tastyDebug !== tastyDebug) {
      window.tastyDebug = tastyDebug;
      console.log('tastyDebug installed. Run tastyDebug.help() for commands.');
    }
  },
};

// ---------------------------------------------------------------------------
// Page CSS (minimal, kept internal)
// ---------------------------------------------------------------------------

function getPageCSS(root: Document | ShadowRoot = document): string {
  const chunks: string[] = [];
  try {
    if ('styleSheets' in root) {
      for (const sheet of Array.from((root as Document).styleSheets)) {
        try {
          if (sheet.cssRules)
            chunks.push(
              Array.from(sheet.cssRules)
                .map((r) => r.cssText)
                .join('\n'),
            );
        } catch {
          /* cross-origin */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return chunks.join('\n');
}

// ---------------------------------------------------------------------------
// Auto-install in development
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined' && isDevEnv()) {
  tastyDebug.install();
}
