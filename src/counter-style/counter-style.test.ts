/**
 * @vitest-environment jsdom
 */
import type { CounterStyleDescriptors } from '../injector/types';
import type { Styles } from '../styles/types';

import {
  extractLocalCounterStyle,
  formatCounterStyleRule,
  hasLocalCounterStyle,
} from './index';

describe('Counter Style Utilities', () => {
  describe('hasLocalCounterStyle', () => {
    it('should return false when no @counter-style defined', () => {
      const styles: Styles = {
        padding: '2x',
        fill: '#purple',
      };
      expect(hasLocalCounterStyle(styles)).toBe(false);
    });

    it('should return true when @counter-style is defined', () => {
      const styles: Styles = {
        padding: '2x',
        '@counter-style': {
          thumbs: {
            system: 'cyclic',
            symbols: '"👍"',
            suffix: '" "',
          },
        },
      };
      expect(hasLocalCounterStyle(styles)).toBe(true);
    });
  });

  describe('extractLocalCounterStyle', () => {
    it('should return null when no @counter-style defined', () => {
      const styles: Styles = { padding: '2x' };
      expect(extractLocalCounterStyle(styles)).toBeNull();
    });

    it('should extract @counter-style from styles', () => {
      const counterStyle: Record<string, CounterStyleDescriptors> = {
        thumbs: {
          system: 'cyclic',
          symbols: '"👍"',
          suffix: '" "',
        },
      };
      const styles: Styles = {
        padding: '2x',
        '@counter-style': counterStyle,
      };
      expect(extractLocalCounterStyle(styles)).toEqual(counterStyle);
    });

    it('should extract multiple counter styles', () => {
      const counterStyle: Record<string, CounterStyleDescriptors> = {
        thumbs: {
          system: 'cyclic',
          symbols: '"👍"',
          suffix: '" "',
        },
        stars: {
          system: 'cyclic',
          symbols: '"★"',
          suffix: '" "',
        },
      };
      const styles: Styles = {
        '@counter-style': counterStyle,
      };
      const result = extractLocalCounterStyle(styles);
      expect(result).toEqual(counterStyle);
      expect(Object.keys(result!)).toHaveLength(2);
    });
  });

  describe('formatCounterStyleRule', () => {
    it('should format a basic @counter-style rule', () => {
      const desc: CounterStyleDescriptors = {
        system: 'cyclic',
        symbols: '"👍"',
        suffix: '" "',
      };
      const css = formatCounterStyleRule('thumbs', desc);
      expect(css).toContain('@counter-style thumbs');
      expect(css).toContain('system: cyclic');
      expect(css).toContain('symbols: "👍"');
      expect(css).toContain('suffix: " "');
    });

    it('should include all specified descriptors', () => {
      const desc: CounterStyleDescriptors = {
        system: 'additive',
        additiveSymbols: '5 V, 4 IV, 1 I',
        prefix: '(',
        suffix: ')',
        range: '1 100',
        pad: '3 "0"',
        fallback: 'decimal',
        speakAs: 'numbers',
      };
      const css = formatCounterStyleRule('roman', desc);
      expect(css).toContain('system: additive');
      expect(css).toContain('additive-symbols: 5 V, 4 IV, 1 I');
      expect(css).toContain('prefix: (');
      expect(css).toContain('suffix: )');
      expect(css).toContain('range: 1 100');
      expect(css).toContain('pad: 3 "0"');
      expect(css).toContain('fallback: decimal');
      expect(css).toContain('speak-as: numbers');
    });

    it('should omit undefined descriptors', () => {
      const desc: CounterStyleDescriptors = {
        system: 'cyclic',
        symbols: '"★"',
      };
      const css = formatCounterStyleRule('stars', desc);
      expect(css).not.toContain('prefix');
      expect(css).not.toContain('suffix');
      expect(css).not.toContain('range');
      expect(css).not.toContain('pad');
    });

    it('should handle numeric system', () => {
      const desc: CounterStyleDescriptors = {
        system: 'numeric',
        symbols: '"0" "1" "2" "3" "4" "5" "6" "7" "8" "9"',
      };
      const css = formatCounterStyleRule('decimal', desc);
      expect(css).toContain('system: numeric');
    });

    it('should handle extends syntax', () => {
      const desc: CounterStyleDescriptors = {
        system: 'extends lower-roman',
        suffix: '") "',
      };
      const css = formatCounterStyleRule('roman-parens', desc);
      expect(css).toContain('system: extends lower-roman');
      expect(css).toContain('suffix: ") "');
    });
  });
});
