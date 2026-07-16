/**
 * @vitest-environment jsdom
 */
import type { FunctionDefinition } from '../injector/types';
import type { Styles } from '../styles/types';

import {
  extractLocalFunctions,
  formatFunctionDeclarations,
  formatFunctionPrelude,
  formatFunctionRule,
  hasLocalFunctions,
  parseFunctionName,
  parseParamName,
} from './index';

describe('Function Utilities', () => {
  describe('hasLocalFunctions', () => {
    it('returns false when no @function defined', () => {
      const styles: Styles = { padding: '2x' };
      expect(hasLocalFunctions(styles)).toBe(false);
    });

    it('returns true when @function is defined', () => {
      const styles: Styles = {
        '@function': {
          $$negative: { args: ['$value'], result: '(-1 * $value)' },
        },
      };
      expect(hasLocalFunctions(styles)).toBe(true);
    });
  });

  describe('extractLocalFunctions', () => {
    it('returns null when no @function defined', () => {
      expect(extractLocalFunctions({ padding: '2x' })).toBeNull();
    });

    it('extracts the @function map', () => {
      const fns: Record<string, FunctionDefinition> = {
        $$negative: { args: ['$value'], result: '(-1 * $value)' },
      };
      const styles: Styles = { '@function': fns };
      expect(extractLocalFunctions(styles)).toEqual(fns);
    });
  });

  describe('parseFunctionName', () => {
    it('handles $$name, $name, --name, and bare name', () => {
      expect(parseFunctionName('$$negative')).toBe('--negative');
      expect(parseFunctionName('$negative')).toBe('--negative');
      expect(parseFunctionName('--negative')).toBe('--negative');
      expect(parseFunctionName('negative')).toBe('--negative');
    });
  });

  describe('parseParamName', () => {
    it('handles $name, --name, and bare name', () => {
      expect(parseParamName('$value')).toBe('--value');
      expect(parseParamName('--value')).toBe('--value');
      expect(parseParamName('value')).toBe('--value');
    });
  });

  describe('formatFunctionPrelude', () => {
    it('formats array (bare) params', () => {
      expect(formatFunctionPrelude('$$negative', ['$value'])).toBe(
        '@function --negative(--value)',
      );
    });

    it('formats no params', () => {
      expect(formatFunctionPrelude('$$now', undefined)).toBe(
        '@function --now()',
      );
    });

    it('formats string-shorthand param types', () => {
      expect(formatFunctionPrelude('$$f', { $a: '<length>' })).toBe(
        '@function --f(--a <length>)',
      );
    });

    it('formats object params with syntax + default and a return type', () => {
      const prelude = formatFunctionPrelude(
        '$$shadow',
        { '$shadow-color': { syntax: '<color>', default: 'inherit' } },
        '<color>',
      );
      expect(prelude).toBe(
        '@function --shadow(--shadow-color <color>: inherit) returns <color>',
      );
    });

    it('preserves parameter order from objects', () => {
      const prelude = formatFunctionPrelude('$$f', {
        $a: true,
        $b: true,
      });
      expect(prelude).toBe('@function --f(--a, --b)');
    });
  });

  describe('formatFunctionDeclarations', () => {
    it('parses result through the DSL (auto-calc)', () => {
      const def: FunctionDefinition = {
        args: ['$value'],
        result: '(-1 * $value)',
      };
      expect(formatFunctionDeclarations(def)).toBe(
        'result: calc(-1 * var(--value));',
      );
    });

    it('emits local variables declared as $name keys before result', () => {
      const def: FunctionDefinition = {
        args: { '$shadow-color': { syntax: '<color>', default: 'inherit' } },
        $offset: '2px',
        result: '$offset $offset ($shadow-color, black)',
      };
      expect(formatFunctionDeclarations(def)).toBe(
        '--offset: 2px; result: var(--offset) var(--offset) var(--shadow-color, black);',
      );
    });
  });

  describe('formatFunctionRule', () => {
    it('produces a complete @function rule', () => {
      const css = formatFunctionRule('$$negative', {
        args: ['$value'],
        result: '(-1 * $value)',
      });
      expect(css).toBe(
        '@function --negative(--value) { result: calc(-1 * var(--value)); }',
      );
    });
  });
});
