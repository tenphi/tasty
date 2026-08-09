/**
 * `gridColumns` / `gridRows` / `gridTemplate` track-count shorthands.
 *
 * The shorthand accepts a track count (`gridColumns={3}`) and expands it into
 * real track sizes. Values written inside a state map arrive as strings, so
 * digit strings have to expand the same way — otherwise the shorthand emits
 * `grid-template-columns: 3`, which is invalid CSS that browsers drop without
 * a word.
 */
import { renderStyles } from '../pipeline';

/** Declarations of the single rule `styles` renders to. */
function declarationsFor(styles: Record<string, unknown>): string {
  const { rules } = renderStyles(styles as never);

  return rules.map((rule) => rule.declarations).join(' ');
}

describe('grid track shorthands', () => {
  describe('gridColumns', () => {
    it('expands a numeric track count', () => {
      expect(declarationsFor({ gridColumns: 3 })).toContain(
        'grid-template-columns: minmax(1px, 1fr) minmax(1px, 1fr) minmax(1px, 1fr)',
      );
    });

    it('expands a digit string the same way a number expands', () => {
      expect(declarationsFor({ gridColumns: '3' })).toBe(
        declarationsFor({ gridColumns: 3 }),
      );
    });

    it('expands digit strings inside a state map', () => {
      const declarations = declarationsFor({
        gridColumns: {
          '': '3',
          '@media(w <= 600px)': '1',
        },
      });

      expect(declarations).toContain(
        'grid-template-columns: minmax(1px, 1fr) minmax(1px, 1fr) minmax(1px, 1fr)',
      );
      expect(declarations).toContain(
        'grid-template-columns: minmax(1px, 1fr);',
      );
      // The bare count must never reach CSS — it is not a valid track list.
      expect(declarations).not.toMatch(/grid-template-columns:\s*\d+\s*[;}]/);
    });

    it('passes real track lists through untouched', () => {
      for (const value of [
        '1fr 2fr 1fr',
        'repeat(auto-fit, minmax(200px, 1fr))',
        'auto',
        'none',
        'subgrid',
      ]) {
        expect(declarationsFor({ gridColumns: value })).toContain(
          `grid-template-columns: ${value}`,
        );
      }
    });

    it('drops a numeric count below one instead of emitting an empty value', () => {
      // `0` tracks expands to nothing; a negative count used to throw inside
      // `String.repeat`, and `Infinity` would have hung there.
      for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(declarationsFor({ gridColumns: value })).not.toContain(
          'grid-template-columns',
        );
      }
    });

    it('keeps a zero-length track, which is a valid track list', () => {
      // Only counts of one or more are a shorthand. `0` stays a length —
      // `CSS.supports('grid-template-columns', '0')` is true.
      expect(declarationsFor({ gridColumns: '0' })).toContain(
        'grid-template-columns: 0',
      );
    });

    it('does not treat a length as a track count', () => {
      // `3px` is a valid single track; only bare digits are a count.
      expect(declarationsFor({ gridColumns: '3px' })).toContain(
        'grid-template-columns: 3px',
      );
    });
  });

  describe('gridRows', () => {
    it('expands a numeric track count', () => {
      expect(declarationsFor({ gridRows: 2 })).toContain(
        'grid-template-rows: auto auto',
      );
    });

    it('expands a digit string the same way a number expands', () => {
      expect(declarationsFor({ gridRows: '2' })).toBe(
        declarationsFor({ gridRows: 2 }),
      );
    });

    it('passes real track lists through untouched', () => {
      expect(declarationsFor({ gridRows: 'min-content 1fr' })).toContain(
        'grid-template-rows: min-content 1fr',
      );
    });
  });

  describe('gridTemplate', () => {
    it('leaves a rows/columns pair that holds no counts untouched', () => {
      expect(
        declarationsFor({ gridTemplate: 'auto 1fr / 200px 1fr' }),
      ).toContain('grid-template: auto 1fr / 200px 1fr');
    });

    it('expands a count on either side', () => {
      const declarations = declarationsFor({ gridTemplate: '2 / 3' });

      expect(declarations).toContain('auto auto');
      expect(declarations).toContain(
        'minmax(1px, 1fr) minmax(1px, 1fr) minmax(1px, 1fr)',
      );
    });

    it('expands one side while keeping the other verbatim', () => {
      expect(declarationsFor({ gridTemplate: '2 / 1fr auto' })).toContain(
        'grid-template: auto auto/ 1fr auto',
      );
    });

    it('leaves an areas template untouched', () => {
      const areas = '"head head" 40px "nav main" 1fr / 120px 1fr';

      expect(declarationsFor({ gridTemplate: areas })).toContain(
        `grid-template: ${areas}`,
      );
    });
  });
});
