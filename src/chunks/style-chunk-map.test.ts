import { predefine, resetHandlers } from '../styles/predefined';

import { categorizeStyleKeys } from './definitions';
import { CHUNK_NAMES, STYLE_TO_CHUNK } from './style-chunk-map';

/**
 * Chunks render and cache independently, and a chunk's cache key covers only
 * its own styles. A handler whose inputs straddle two chunks runs once per
 * chunk with a subset of them, and each run can emit the same CSS property from
 * a separate class — so which one applies comes down to rule order.
 */
describe('built-in chunk assignment', () => {
  afterAll(() => {
    // `predefine()` registers every built-in handler again; restore the
    // single registration other suites expect.
    resetHandlers();
  });

  it("keeps every built-in handler's inputs in one chunk", () => {
    const straddling: string[] = [];

    for (const handlers of Object.values(predefine())) {
      for (const handler of handlers) {
        const chunks = new Set(
          handler.__lookupStyles.map(
            (style) => STYLE_TO_CHUNK.get(style) ?? CHUNK_NAMES.MISC,
          ),
        );

        if (chunks.size > 1) {
          straddling.push(handler.__lookupStyles.join(', '));
        }
      }
    }

    expect([...new Set(straddling)]).toEqual([]);
  });

  it('renders `fill` and `image` in one chunk', () => {
    // Both write `background-image`: a two-color fill layers its overlay under
    // the image, which only works when one handler call sees both.
    const chunks = categorizeStyleKeys({
      fill: '#a #b.10',
      image: 'url(x.png)',
      backgroundColor: '#c',
      background: 'none',
    });

    expect([...chunks.keys()]).toEqual([CHUNK_NAMES.APPEARANCE]);
    expect(chunks.get(CHUNK_NAMES.APPEARANCE)!.sort()).toEqual([
      'background',
      'backgroundColor',
      'fill',
      'image',
    ]);
  });
});
