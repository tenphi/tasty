/**
 * @vitest-environment jsdom
 */
import { configure, resetConfig } from '../config';
import { parseStyle } from '../utils/styles';

import { registerFunctionPolyfill, splitFunctions } from './index';

import type { FunctionDefinition } from '../injector/types';

describe('functions unification + @function polyfill', () => {
  afterEach(() => {
    resetConfig();
  });

  describe('splitFunctions', () => {
    it('discriminates parse functions (bare) from CSS functions ($$)', () => {
      const parse = () => 'x';
      const def: FunctionDefinition = { args: ['$v'], result: '$v' };
      const { parseFuncs, functionDefs } = splitFunctions({
        double: parse,
        $$negative: def,
      });
      expect(parseFuncs).toEqual({ double: parse });
      expect(functionDefs).toEqual({ $$negative: def });
    });

    it('reports + skips a function value under a $$ key', () => {
      const onMismatch = vi.fn();
      const { parseFuncs, functionDefs } = splitFunctions(
        { $$bad: (() => 'x') as never },
        onMismatch,
      );
      expect(onMismatch).toHaveBeenCalledWith('$$bad', 'expected-definition');
      expect(parseFuncs).toEqual({});
      expect(functionDefs).toEqual({});
    });

    it('reports + skips an object value under a bare key', () => {
      const onMismatch = vi.fn();
      const def: FunctionDefinition = { args: ['$v'], result: '$v' };
      const { parseFuncs, functionDefs } = splitFunctions(
        { bad: def as never },
        onMismatch,
      );
      expect(onMismatch).toHaveBeenCalledWith('bad', 'expected-parse-function');
      expect(parseFuncs).toEqual({});
      expect(functionDefs).toEqual({});
    });
  });

  describe('unified `functions` config', () => {
    it('registers a parse function (bare key) callable as name(...)', () => {
      configure({
        functions: {
          double: (groups) => `calc(2 * ${groups[0]?.output ?? '0'})`,
        },
      });
      expect(parseStyle('double(10px)').output).toBe('calc(2 * 10px)');
    });

    it('ignores a mismatched entry (object under a bare key)', () => {
      configure({
        functions: {
          // object under a bare key -> mismatch -> ignored
          oops: { args: ['$v'], result: '$v' } as never,
        },
      });
      // Not registered as a parse function, so the call is left untouched.
      expect(parseStyle('oops(10px)').output).toBe('oops(10px)');
    });
  });

  describe('polyfill OFF (default)', () => {
    it('leaves the native --name(...) call untouched', () => {
      configure({
        functions: {
          $$negative: { args: ['$value'], result: '(-1 * $value)' },
        },
      });
      expect(parseStyle('$$negative(10px)').output).toBe('--negative(10px)');
    });
  });

  describe('polyfill ON', () => {
    it('inlines a basic call into plain CSS', () => {
      configure({
        polyfills: { functions: true },
        functions: {
          $$negative: { args: ['$value'], result: '(-1 * $value)' },
        },
      });
      expect(parseStyle('$$negative(10px)').output).toBe('calc(-1 * 10px)');
    });

    it('passes var() arguments through (runtime dynamism preserved)', () => {
      configure({
        polyfills: { functions: true },
        functions: {
          $$negative: { args: ['$value'], result: '(-1 * $value)' },
        },
      });
      expect(parseStyle('$$negative($gap)').output).toBe(
        'calc(-1 * var(--gap))',
      );
    });

    it('applies a parameter default when the argument is omitted', () => {
      configure({
        polyfills: { functions: true },
        functions: {
          $$pad: {
            args: { $size: { syntax: '<length>', default: '4px' } },
            result: '$size $size',
          },
        },
      });
      expect(parseStyle('$$pad()').output).toBe('4px 4px');
    });

    it('inlines local variables', () => {
      configure({
        polyfills: { functions: true },
        functions: {
          $$shadow: {
            args: ['$color'],
            $offset: '2px',
            result: '$offset $offset $color',
          },
        },
      });
      expect(parseStyle('$$shadow(#000)').output).toContain('2px 2px');
    });

    it('does not collide with an external var of the same name as a param', () => {
      configure({
        polyfills: { functions: true },
        functions: {
          // `$gap` is a parameter, and the argument expands to an expression
          // that itself contains `var(--gap)` (a real element-level property).
          $$grow: { args: ['$gap'], result: '($gap + 1px)' },
        },
      });
      // The external var(--gap) must be preserved, not recursively replaced.
      expect(parseStyle('$$grow((2 * $gap))').output).toBe(
        'calc(calc(2 * var(--gap)) + 1px)',
      );
    });

    it('expands a function that calls another function', () => {
      configure({
        polyfills: { functions: true },
        functions: {
          $$double: { args: ['$v'], result: '(2 * $v)' },
          $$quad: { args: ['$v'], result: '$$double($$double($v))' },
        },
      });
      expect(parseStyle('$$quad(5px)').output).toBe('calc(2 * calc(2 * 5px))');
    });

    it('bails out of a recursion cycle, leaving the call untouched', () => {
      configure({
        polyfills: { functions: true },
        functions: {
          $$loop: { args: ['$v'], result: '$$loop($v)' },
        },
      });
      expect(parseStyle('$$loop(5px)').output).toBe('--loop(5px)');
    });

    it('inlines a function registered at runtime (useFunction path)', () => {
      configure({ polyfills: { functions: true } });
      // This is the registration path useFunction() takes when the polyfill is on.
      registerFunctionPolyfill('$$triple', {
        args: ['$v'],
        result: '(3 * $v)',
      });
      expect(parseStyle('$$triple(2px)').output).toBe('calc(3 * 2px)');
    });
  });
});
