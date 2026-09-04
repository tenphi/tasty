import { foldDslCase } from '../utils/string';

import { classify } from './classify';
import { Lru } from './lru';
import { scan } from './tokenizer';
import type {
  ParserOptions,
  ProcessedStyle,
  StyleDetails,
  StyleDetailsPart,
} from './types';
import { Bucket, makeEmptyDetails, makeEmptyPart } from './types';

export class StyleParser {
  private cache: Lru<string, ProcessedStyle>;
  constructor(private opts: ParserOptions = {}) {
    this.cache = new Lru<string, ProcessedStyle>(this.opts.cacheSize ?? 1000);
  }

  /* ---------------- Public API ---------------- */
  process(src: string): ProcessedStyle {
    const key = String(src);
    const hit = this.cache.get(key);
    if (hit) return hit;

    // strip comments, then case-fold everything except custom-property names
    const stripped = foldDslCase(
      src.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, ''),
    );

    const groups: StyleDetails[] = [];
    let currentGroup = makeEmptyDetails();
    let currentPart = makeEmptyPart();
    let parts: StyleDetailsPart[] = [];

    const pushToken = (bucket: Bucket, processed: string) => {
      if (!processed) return;

      // If the previous token was a url(...) value, merge this token into it so that
      // background layer segments like "url(img) no-repeat center/cover" are kept
      // as a single value entry.
      const prevIsUrlValue =
        currentPart.values.length > 0 &&
        currentPart.values[currentPart.values.length - 1].startsWith('url(');

      if (prevIsUrlValue) {
        // Extend the existing url(...) value regardless of current bucket.
        currentPart.values[currentPart.values.length - 1] += ` ${processed}`;
        currentPart.all[currentPart.all.length - 1] += ` ${processed}`;
        return;
      }

      switch (bucket) {
        case Bucket.Color:
          currentPart.colors.push(processed);
          break;
        case Bucket.Value:
          currentPart.values.push(processed);
          break;
        case Bucket.Mod:
          currentPart.mods.push(processed);
          break;
        case Bucket.ColorValue:
          // Untyped reference: readable from either bucket, listed once in `all`.
          currentPart.colors.push(processed);
          currentPart.values.push(processed);
          break;
      }
      currentPart.all.push(processed);
    };

    const endPart = (reset = true) => {
      // Only add non-empty parts
      if (currentPart.all.length > 0) {
        currentPart.output = currentPart.all.join(' ');
        parts.push(currentPart);
      }
      if (reset) currentPart = makeEmptyPart();
    };

    const endGroup = (reset = true) => {
      endPart(reset); // finalize last part

      // Ensure at least one part exists (even if empty) for backward compat
      if (parts.length === 0) {
        parts.push(makeEmptyPart());
      }

      currentGroup.parts = parts;
      for (const part of parts) {
        currentGroup.mods.push(...part.mods);
        currentGroup.values.push(...part.values);
        currentGroup.colors.push(...part.colors);
        currentGroup.all.push(...part.all);
      }
      currentGroup.output =
        parts.length === 1
          ? parts[0].output
          : parts.map((part) => part.output).join(' / ');
      groups.push(currentGroup);

      if (reset) {
        currentGroup = makeEmptyDetails();
        parts = [];
      }
    };

    scan(stripped, (tok, isComma, isSlash) => {
      if (tok) {
        // Accumulate raw token into currentGroup.input
        if (currentGroup.input) {
          currentGroup.input += ` ${tok}`;
        } else {
          currentGroup.input = tok;
        }

        const { bucket, processed } = classify(tok, this.opts, (sub) =>
          this.process(sub),
        );
        pushToken(bucket, processed);
      }
      if (isSlash) endPart();
      if (isComma) endGroup();
    });

    // push final group if not already
    if (currentPart.all.length || parts.length || !groups.length)
      endGroup(false);

    const output =
      groups.length === 1
        ? groups[0].output
        : groups.map((group) => group.output).join(', ');
    const result: ProcessedStyle = { output, groups };
    Object.freeze(result);
    this.cache.set(key, result);
    return result;
  }

  setFunctions(functions: Required<ParserOptions>['functions']): void {
    this.opts.functions = functions;
    this.cache.clear();
  }

  setUnits(units: Required<ParserOptions>['units']): void {
    this.opts.units = units;
    this.cache.clear();
  }

  updateOptions(patch: Partial<ParserOptions>): void {
    Object.assign(this.opts, patch);
    if (patch.cacheSize)
      this.cache = new Lru<string, ProcessedStyle>(patch.cacheSize);
    else this.cache.clear();
  }

  /**
   * Clear the parser cache.
   * Call this when external state that affects parsing results has changed
   * (e.g., predefined tokens).
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get the current units configuration.
   */
  getUnits(): ParserOptions['units'] {
    return this.opts.units;
  }
}
