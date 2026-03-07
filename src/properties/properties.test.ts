import type { Styles } from '../styles/types';

import {
  extractLocalProperties,
  getEffectiveDefinition,
  hasLocalProperties,
  inferSyntaxFromValue,
  isValidPropertyName,
  normalizePropertyDefinition,
  normalizePropertyName,
  parsePropertyToken,
} from './index';

describe('properties', () => {
  describe('hasLocalProperties', () => {
    it('should return false when no @properties defined', () => {
      const styles: Styles = { fill: '#red' };
      expect(hasLocalProperties(styles)).toBe(false);
    });

    it('should return true when @properties is defined', () => {
      const styles: Styles = {
        fill: '#red',
        '@properties': {
          '$my-prop': { syntax: '<number>', initialValue: '0' },
        },
      };
      expect(hasLocalProperties(styles)).toBe(true);
    });

    it('should return true even when @properties is empty object', () => {
      const styles: Styles = {
        '@properties': {},
      };
      expect(hasLocalProperties(styles)).toBe(true);
    });
  });

  describe('extractLocalProperties', () => {
    it('should return null when no @properties defined', () => {
      const styles: Styles = { fill: '#red' };
      expect(extractLocalProperties(styles)).toBeNull();
    });

    it('should extract @properties from styles', () => {
      const properties = {
        $rotation: {
          syntax: '<angle>',
          inherits: false,
          initialValue: '0deg',
        },
        '#theme': { initialValue: 'purple' },
      };
      const styles: Styles = {
        fill: '#red',
        '@properties': properties,
      };

      expect(extractLocalProperties(styles)).toEqual(properties);
    });

    it('should return null for non-object @properties value', () => {
      const styles = {
        '@properties': 'invalid',
      } as unknown as Styles;

      expect(extractLocalProperties(styles)).toBeNull();
    });
  });

  describe('isValidPropertyName', () => {
    it('should return true for valid property names', () => {
      expect(isValidPropertyName('my-prop')).toBe(true);
      expect(isValidPropertyName('myProp')).toBe(true);
      expect(isValidPropertyName('my_prop')).toBe(true);
      expect(isValidPropertyName('_private')).toBe(true);
      expect(isValidPropertyName('a')).toBe(true);
      expect(isValidPropertyName('prop123')).toBe(true);
    });

    it('should return false for invalid property names', () => {
      expect(isValidPropertyName('')).toBe(false);
      expect(isValidPropertyName('123invalid')).toBe(false);
      expect(isValidPropertyName('-starts-with-dash')).toBe(false);
      expect(isValidPropertyName('has space')).toBe(false);
      expect(isValidPropertyName('has.dot')).toBe(false);
    });
  });

  describe('parsePropertyToken', () => {
    it('should parse $name token to --name', () => {
      const result = parsePropertyToken('$my-prop');
      expect(result.cssName).toBe('--my-prop');
      expect(result.isColor).toBe(false);
      expect(result.isValid).toBe(true);
    });

    it('should parse #name token to --name-color', () => {
      const result = parsePropertyToken('#theme');
      expect(result.cssName).toBe('--theme-color');
      expect(result.isColor).toBe(true);
      expect(result.isValid).toBe(true);
    });

    it('should parse --name legacy format', () => {
      const result = parsePropertyToken('--my-prop');
      expect(result.cssName).toBe('--my-prop');
      expect(result.isColor).toBe(false);
      expect(result.isValid).toBe(true);
    });

    it('should detect color in --name-color legacy format', () => {
      const result = parsePropertyToken('--my-color');
      expect(result.cssName).toBe('--my-color');
      expect(result.isColor).toBe(true);
      expect(result.isValid).toBe(true);
    });

    it('should parse name without prefix as legacy format', () => {
      const result = parsePropertyToken('my-prop');
      expect(result.cssName).toBe('--my-prop');
      expect(result.isColor).toBe(false);
      expect(result.isValid).toBe(true);
    });

    it('should return invalid for empty token', () => {
      const result = parsePropertyToken('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid for $ with no name', () => {
      const result = parsePropertyToken('$');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should return invalid for # with no name', () => {
      const result = parsePropertyToken('#');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should return invalid for names starting with numbers', () => {
      const result = parsePropertyToken('$123invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid property name');
    });
  });

  describe('getEffectiveDefinition', () => {
    it('should return user definition for $name tokens', () => {
      const result = getEffectiveDefinition('$rotation', {
        syntax: '<angle>',
        inherits: false,
        initialValue: '45deg',
      });

      expect(result.isValid).toBe(true);
      expect(result.cssName).toBe('--rotation');
      expect(result.definition).toEqual({
        syntax: '<angle>',
        inherits: false,
        initialValue: '45deg',
      });
    });

    it('should auto-set syntax for #name color tokens', () => {
      const result = getEffectiveDefinition('#theme', {
        initialValue: 'purple',
      });

      expect(result.isValid).toBe(true);
      expect(result.cssName).toBe('--theme-color');
      expect(result.definition).toEqual({
        syntax: '<color>',
        inherits: undefined,
        initialValue: 'purple',
      });
    });

    it('should default initialValue to transparent for #name tokens', () => {
      const result = getEffectiveDefinition('#accent', {});

      expect(result.isValid).toBe(true);
      expect(result.cssName).toBe('--accent-color');
      expect(result.definition).toEqual({
        syntax: '<color>',
        inherits: undefined,
        initialValue: 'transparent',
      });
    });

    it('should allow inherits to be customized for color tokens', () => {
      const result = getEffectiveDefinition('#bg', {
        inherits: false,
        initialValue: 'white',
      });

      expect(result.isValid).toBe(true);
      expect(result.cssName).toBe('--bg-color');
      expect(result.definition).toEqual({
        syntax: '<color>',
        inherits: false,
        initialValue: 'white',
      });
    });

    it('should ignore user syntax for color tokens (always <color>)', () => {
      const result = getEffectiveDefinition('#custom', {
        syntax: '<number>', // Should be ignored
        initialValue: 'red',
      });

      expect(result.isValid).toBe(true);
      expect(result.definition.syntax).toBe('<color>');
    });

    it('should return invalid for invalid tokens', () => {
      const result = getEffectiveDefinition('$123invalid', {
        syntax: '<number>',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('normalizePropertyName (legacy)', () => {
    it('should handle $name token format', () => {
      expect(normalizePropertyName('$my-prop')).toBe('--my-prop');
    });

    it('should handle #name token format', () => {
      expect(normalizePropertyName('#theme')).toBe('--theme-color');
    });

    it('should keep -- prefix if already present', () => {
      expect(normalizePropertyName('--my-color')).toBe('--my-color');
    });

    it('should add -- prefix for plain names', () => {
      expect(normalizePropertyName('my-color')).toBe('--my-color');
    });
  });

  describe('normalizePropertyDefinition', () => {
    it('should create consistent JSON for same properties in different order', () => {
      const def1 = { syntax: '<color>', inherits: true, initialValue: 'red' };
      const def2 = { inherits: true, initialValue: 'red', syntax: '<color>' };
      const def3 = { initialValue: 'red', syntax: '<color>', inherits: true };

      const normalized1 = normalizePropertyDefinition(def1);
      const normalized2 = normalizePropertyDefinition(def2);
      const normalized3 = normalizePropertyDefinition(def3);

      expect(normalized1).toBe(normalized2);
      expect(normalized2).toBe(normalized3);
    });

    it('should handle partial definitions', () => {
      const defSyntaxOnly = { syntax: '<color>' };
      const defInheritsOnly = { inherits: false };

      expect(normalizePropertyDefinition(defSyntaxOnly)).toBe(
        '{"syntax":"<color>"}',
      );
      expect(normalizePropertyDefinition(defInheritsOnly)).toBe(
        '{"inherits":false}',
      );
    });

    it('should ignore initialValue in comparison', () => {
      const def1 = { syntax: '<length>', initialValue: '0px' };
      const def2 = { syntax: '<length>', initialValue: '6px' };

      expect(normalizePropertyDefinition(def1)).toBe(
        normalizePropertyDefinition(def2),
      );
    });

    it('should handle empty definition', () => {
      const def = {};
      expect(normalizePropertyDefinition(def)).toBe('{}');
    });

    it('should produce different results for different syntax', () => {
      const def1 = { syntax: '<color>' };
      const def2 = { syntax: '<length>' };

      expect(normalizePropertyDefinition(def1)).not.toBe(
        normalizePropertyDefinition(def2),
      );
    });

    it('should produce different results for different inherits values', () => {
      const def1 = { inherits: true };
      const def2 = { inherits: false };

      expect(normalizePropertyDefinition(def1)).not.toBe(
        normalizePropertyDefinition(def2),
      );
    });
  });

  describe('inferSyntaxFromValue', () => {
    it('should infer <number> from bare numbers', () => {
      expect(inferSyntaxFromValue('1')).toEqual({
        syntax: '<number>',
        initialValue: '0',
      });
      expect(inferSyntaxFromValue('0.5')).toEqual({
        syntax: '<number>',
        initialValue: '0',
      });
      expect(inferSyntaxFromValue('-3')).toEqual({
        syntax: '<number>',
        initialValue: '0',
      });
    });

    it('should infer <length> from length units', () => {
      expect(inferSyntaxFromValue('10px')).toEqual({
        syntax: '<length>',
        initialValue: '0px',
      });
      expect(inferSyntaxFromValue('2rem')).toEqual({
        syntax: '<length>',
        initialValue: '0px',
      });
      expect(inferSyntaxFromValue('1em')).toEqual({
        syntax: '<length>',
        initialValue: '0px',
      });
      expect(inferSyntaxFromValue('100vw')).toEqual({
        syntax: '<length>',
        initialValue: '0px',
      });
    });

    it('should infer <percentage> from percent values', () => {
      expect(inferSyntaxFromValue('50%')).toEqual({
        syntax: '<percentage>',
        initialValue: '0%',
      });
    });

    it('should infer <angle> from angle units', () => {
      expect(inferSyntaxFromValue('45deg')).toEqual({
        syntax: '<angle>',
        initialValue: '0deg',
      });
      expect(inferSyntaxFromValue('1rad')).toEqual({
        syntax: '<angle>',
        initialValue: '0deg',
      });
      expect(inferSyntaxFromValue('0.5turn')).toEqual({
        syntax: '<angle>',
        initialValue: '0deg',
      });
    });

    it('should infer <time> from time units', () => {
      expect(inferSyntaxFromValue('300ms')).toEqual({
        syntax: '<time>',
        initialValue: '0s',
      });
      expect(inferSyntaxFromValue('1s')).toEqual({
        syntax: '<time>',
        initialValue: '0s',
      });
    });

    it('should return null for non-numeric values', () => {
      expect(inferSyntaxFromValue('calc(1px + 2px)')).toBeNull();
      expect(inferSyntaxFromValue('auto')).toBeNull();
      expect(inferSyntaxFromValue('')).toBeNull();
      expect(inferSyntaxFromValue('var(--x) + 1')).toBeNull();
    });
  });
});
