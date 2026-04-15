import { hashString } from '../utils/hash';

interface ChunkSheet {
  sheet: CSSStyleSheet;
  cssText: string;
  refCount: number;
}

/**
 * Global registry mapping CSS content hashes to shared constructable
 * CSSStyleSheet objects with reference counting.
 *
 * Multiple shadow roots adopting the same chunk share a single underlying
 * stylesheet object — parse once, adopt everywhere.
 */
export class ChunkSheetRegistry {
  private sheets = new Map<string, ChunkSheet>();
  private sheetToHash = new WeakMap<CSSStyleSheet, string>();

  /**
   * Get or create a CSSStyleSheet for the given CSS text.
   * Increments refCount. Uses content hash as the dedup key.
   */
  acquire(cssText: string): CSSStyleSheet {
    const hash = hashString(cssText);
    const existing = this.sheets.get(hash);

    if (existing) {
      existing.refCount++;
      return existing.sheet;
    }

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);

    const entry: ChunkSheet = { sheet, cssText, refCount: 1 };
    this.sheets.set(hash, entry);
    this.sheetToHash.set(sheet, hash);

    return sheet;
  }

  /**
   * Decrement refCount for a sheet. When refCount reaches 0,
   * the sheet is removed from the registry.
   */
  release(sheet: CSSStyleSheet): void {
    const hash = this.sheetToHash.get(sheet);
    if (!hash) return;

    const entry = this.sheets.get(hash);
    if (!entry) return;

    entry.refCount--;

    if (entry.refCount <= 0) {
      this.sheets.delete(hash);
      this.sheetToHash.delete(sheet);
    }
  }

  /**
   * Bulk acquire — returns an array of CSSStyleSheet in the same order.
   */
  acquireAll(cssTexts: string[]): CSSStyleSheet[] {
    return cssTexts.map((text) => this.acquire(text));
  }

  /**
   * Bulk release — decrements refCount for each sheet.
   */
  releaseAll(sheets: CSSStyleSheet[]): void {
    for (const sheet of sheets) {
      this.release(sheet);
    }
  }

  /** Number of unique sheets currently held. */
  get size(): number {
    return this.sheets.size;
  }
}

/** Module-level singleton shared across the entire application. */
export const chunkSheetRegistry = new ChunkSheetRegistry();
