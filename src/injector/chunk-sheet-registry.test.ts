/**
 * @vitest-environment happy-dom
 */
import { ChunkSheetRegistry } from './chunk-sheet-registry';

describe('ChunkSheetRegistry', () => {
  let registry: ChunkSheetRegistry;

  beforeEach(() => {
    registry = new ChunkSheetRegistry();
  });

  it('returns the same sheet for identical CSS text', () => {
    const css = '.t0 { color: red; }';
    const sheet1 = registry.acquire(css);
    const sheet2 = registry.acquire(css);

    expect(sheet1).toBe(sheet2);
    expect(registry.size).toBe(1);
  });

  it('returns different sheets for different CSS text', () => {
    const sheet1 = registry.acquire('.t0 { color: red; }');
    const sheet2 = registry.acquire('.t1 { color: blue; }');

    expect(sheet1).not.toBe(sheet2);
    expect(registry.size).toBe(2);
  });

  it('increments refCount on repeated acquire', () => {
    const css = '.t0 { display: flex; }';
    registry.acquire(css);
    registry.acquire(css);

    const sheet = registry.acquire(css);
    registry.release(sheet);
    expect(registry.size).toBe(1);
  });

  it('removes sheet when refCount reaches 0', () => {
    const css = '.t0 { margin: 0; }';
    const sheet = registry.acquire(css);

    registry.release(sheet);
    expect(registry.size).toBe(0);
  });

  it('creates a new sheet after full release and re-acquire', () => {
    const css = '.t0 { padding: 1px; }';
    const first = registry.acquire(css);
    registry.release(first);
    expect(registry.size).toBe(0);

    const second = registry.acquire(css);
    expect(second).not.toBe(first);
    expect(registry.size).toBe(1);
  });

  it('release is a no-op for unknown sheets', () => {
    const unknown = new CSSStyleSheet();
    registry.release(unknown);
    expect(registry.size).toBe(0);
  });

  it('acquireAll returns sheets in order', () => {
    const texts = ['.a { color: red; }', '.b { color: blue; }'];
    const sheets = registry.acquireAll(texts);

    expect(sheets).toHaveLength(2);
    expect(registry.size).toBe(2);
    expect(sheets[0]).not.toBe(sheets[1]);
  });

  it('acquireAll deduplicates identical texts', () => {
    const css = '.t0 { color: red; }';
    const sheets = registry.acquireAll([css, css, css]);

    expect(sheets).toHaveLength(3);
    expect(sheets[0]).toBe(sheets[1]);
    expect(sheets[1]).toBe(sheets[2]);
    expect(registry.size).toBe(1);
  });

  it('releaseAll decrements all refs', () => {
    const texts = ['.a { color: red; }', '.b { color: blue; }'];
    const sheets = registry.acquireAll(texts);

    registry.releaseAll(sheets);
    expect(registry.size).toBe(0);
  });

  it('releaseAll with mixed ref counts preserves still-referenced sheets', () => {
    const cssA = '.a { color: red; }';
    const cssB = '.b { color: blue; }';

    registry.acquire(cssA);
    registry.acquire(cssA); // refCount = 2
    const sheetB = registry.acquire(cssB); // refCount = 1

    registry.releaseAll([registry.acquire(cssA), sheetB]);
    // cssA: was 3 (2 + 1 from releaseAll's acquire), release 1 → 2
    // cssB: was 1, release 1 → 0
    expect(registry.size).toBe(1);
  });

  it('calls replaceSync with the CSS text', () => {
    const css = '.styled { font-size: 14px; }';
    const sheet = registry.acquire(css);

    expect(sheet.cssRules.length).toBe(1);
    expect(sheet.cssRules[0].cssText).toContain('.styled');
    expect(sheet.cssRules[0].cssText).toContain('font-size: 14px');
  });
});
