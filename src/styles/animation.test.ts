/**
 * Keyframes names are case-sensitive, but the DSL parser folds what it reads
 * to lowercase: `animation: 'fadeIn 1s'` used to reach the stylesheet as
 * `fadein 1s`, which matches neither `@keyframes fadeIn` nor the local
 * keyframes renaming that looks the name up as authored.
 */
import { renderStyles } from '../pipeline';
import type { Styles } from './types';

import { restoreAnimationNameCase, scanAnimationNames } from './animation';

function declarations(styles: Styles): string[] {
  return renderStyles(styles, '.t').map((rule) => rule.declarations);
}

describe('animation names', () => {
  describe('scanAnimationNames', () => {
    it('finds the name of each item, with its position', () => {
      expect(scanAnimationNames('fadeIn 1s, 2s slideUp')).toEqual([
        { name: 'fadeIn', index: 0 },
        { name: 'slideUp', index: 14 },
      ]);
    });

    it('returns null for an item without a name', () => {
      expect(scanAnimationNames('none, 1s ease-in, spin')).toEqual([
        null,
        null,
        { name: 'spin', index: 18 },
      ]);
    });

    it('keeps commas inside functions in their item', () => {
      expect(scanAnimationNames('1s steps(4, end) spin')).toEqual([
        { name: 'spin', index: 17 },
      ]);
      expect(
        scanAnimationNames('1s cubic-bezier(0.1, 0.7, 1, 0.1) fade, x 1s'),
      ).toEqual([
        { name: 'fade', index: 34 },
        { name: 'x', index: 40 },
      ]);
    });

    it('skips numbers, keywords in any case, strings and custom properties', () => {
      expect(
        scanAnimationNames('-1s .5s 2 INFINITE Alternate "quoted" $dur'),
      ).toEqual([null]);
    });

    it('accepts dashed and vendor-style identifiers', () => {
      expect(scanAnimationNames('--brand-in 1s, -x-pulse 2s')).toEqual([
        { name: '--brand-in', index: 0 },
        { name: '-x-pulse', index: 15 },
      ]);
    });
  });

  describe('restoreAnimationNameCase', () => {
    it('restores each item to its own authored case', () => {
      // `Spin` and `spin` are different keyframes.
      expect(
        restoreAnimationNameCase('Spin 1s, spin 2s', 'spin 1s, spin 2s'),
      ).toBe('Spin 1s, spin 2s');
    });

    it('leaves output alone when the items do not line up', () => {
      expect(restoreAnimationNameCase('fadeIn 1s, x', 'fadein 1s')).toBe(
        'fadein 1s',
      );
    });

    it('leaves a name the parser changed alone', () => {
      expect(restoreAnimationNameCase('fadeIn 1s', 'other 1s')).toBe(
        'other 1s',
      );
    });
  });

  describe('rendered CSS', () => {
    it('keeps the case of a camelCase name', () => {
      expect(
        declarations({ animation: 'fadeIn 1s', animationName: 'slideUp' }),
      ).toEqual(['animation: fadeIn 1s; animation-name: slideUp;']);
    });

    it('keeps the case per item in a list', () => {
      expect(declarations({ animationName: 'fadeIn, none, Spin' })).toEqual([
        'animation-name: fadeIn, none, Spin;',
      ]);
    });

    it('still resolves the rest of the value', () => {
      expect(
        declarations({ animation: 'fadeIn $duration STEPS(4, END) INFINITE' }),
      ).toEqual(['animation: fadeIn var(--duration) steps(4, end) infinite;']);
    });

    it('keeps the case in every state', () => {
      expect(
        declarations({
          animation: { '': 'fadeIn 1s', hovered: 'fadeOut 1s' },
        }).join(' '),
      ).toMatch(/fadeIn 1s;.*fadeOut 1s;/);
    });

    it('still folds keywords', () => {
      expect(
        declarations({ animation: 'NONE', animationName: 'Initial' }),
      ).toEqual(['animation: none; animation-name: initial;']);
    });
  });
});
