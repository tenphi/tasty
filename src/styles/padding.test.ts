import { paddingStyle } from './padding';

describe('paddingStyle', () => {
  describe('basic functionality', () => {
    it('returns null when no padding properties are provided', () => {
      expect(paddingStyle({})).toBeNull();
    });

    it('handles boolean true value', () => {
      const result = paddingStyle({ padding: true });
      expect(result).toEqual({
        padding: '8px', // raw unit: 1 * 8px
      });
    });

    it('handles number value', () => {
      const result = paddingStyle({ padding: 16 });
      expect(result).toEqual({
        padding: '16px',
      });
    });

    it('handles single string value', () => {
      const result = paddingStyle({ padding: '2x' });
      expect(result).toEqual({
        padding: '16px', // raw unit: 2 * 8px
      });
    });

    it('handles two-value string (vertical horizontal)', () => {
      const result = paddingStyle({ padding: '2x 3x' });
      expect(result).toEqual({
        padding: '16px 24px', // raw units
      });
    });

    it('handles four-value string (top right bottom left)', () => {
      const result = paddingStyle({ padding: '1x 2x 3x 4x' });
      expect(result).toEqual({
        padding: '8px 16px 24px 32px', // raw units
      });
    });
  });

  describe('CSS-wide keywords', () => {
    it('passes through padding: inherit', () => {
      expect(paddingStyle({ padding: 'inherit' })).toEqual({
        padding: 'inherit',
      });
    });

    it('passes through padding: revert', () => {
      expect(paddingStyle({ padding: 'revert' })).toEqual({
        padding: 'revert',
      });
    });

    it('keeps padding inherit on other sides when paddingTop overrides top', () => {
      const result = paddingStyle({
        padding: 'inherit',
        paddingTop: '2x',
      });
      expect(result).toEqual({
        padding: '16px inherit inherit inherit', // raw unit: 2 * 8px
      });
    });
  });

  describe('directional padding', () => {
    it('handles directional padding - top only', () => {
      const result = paddingStyle({ padding: '2x top' });
      expect(result).toEqual({
        padding: '16px 0 0 0', // raw unit: 2 * 8px
      });
    });

    it('handles directional padding - left and right', () => {
      const result = paddingStyle({ padding: '3x left right' });
      expect(result).toEqual({
        padding: '0 24px', // raw unit: 3 * 8px
      });
    });

    it('handles directional padding - bottom only', () => {
      const result = paddingStyle({ padding: '1x bottom' });
      expect(result).toEqual({
        padding: '0 0 8px 0', // raw unit: 1 * 8px
      });
    });
  });

  describe('paddingBlock and paddingInline', () => {
    it('handles paddingBlock (top and bottom)', () => {
      const result = paddingStyle({ paddingBlock: '2x' });
      expect(result).toEqual({
        padding: '16px 0', // raw unit: 2 * 8px
      });
    });

    it('handles paddingInline (left and right)', () => {
      const result = paddingStyle({ paddingInline: '4x' });
      expect(result).toEqual({
        padding: '0 32px', // raw unit: 4 * 8px
      });
    });

    it('handles boolean and number values for logical properties', () => {
      const result = paddingStyle({
        paddingBlock: true,
        paddingInline: 8,
      });
      expect(result).toEqual({
        padding: '8px', // all sides equal, optimized to single value
      });
    });
  });

  describe('individual direction properties', () => {
    it('handles individual direction properties', () => {
      const result = paddingStyle({
        paddingTop: '1x',
        paddingRight: '2x',
        paddingBottom: '3x',
        paddingLeft: '4x',
      });
      expect(result).toEqual({
        padding: '8px 16px 24px 32px', // raw units
      });
    });

    it('handles boolean and number values for individual directions', () => {
      const result = paddingStyle({
        paddingTop: true,
        paddingRight: 12,
        paddingBottom: '2x',
        paddingLeft: false,
      });
      expect(result).toEqual({
        padding: '8px 12px 16px 0', // raw units
      });
    });
  });

  describe('priority system', () => {
    it('padding (low) < paddingBlock/paddingInline (medium)', () => {
      const result = paddingStyle({
        padding: '1x',
        paddingBlock: '2x',
        paddingInline: '3x',
      });
      expect(result).toEqual({
        padding: '16px 24px', // raw units
      });
    });

    it('paddingBlock/paddingInline (medium) < individual directions (high)', () => {
      const result = paddingStyle({
        paddingBlock: '2x',
        paddingInline: '3x',
        paddingTop: '4x',
        paddingRight: '5x',
      });
      expect(result).toEqual({
        padding: '32px 40px 16px 24px', // raw units
      });
    });

    it('complete priority chain: padding < paddingBlock/Inline < individual', () => {
      const result = paddingStyle({
        padding: '1x',
        paddingBlock: '2x',
        paddingInline: '3x',
        paddingTop: '4x',
        paddingRight: '5x',
      });
      expect(result).toEqual({
        padding: '32px 40px 16px 24px', // raw units
      });
    });

    it('example from requirements: padding="1x" paddingRight="2x"', () => {
      const result = paddingStyle({
        padding: '1x',
        paddingRight: '2x',
      });
      expect(result).toEqual({
        padding: '8px 16px 8px 8px', // raw units
      });
    });

    it('example from requirements: padding="1x" paddingBlock="2x"', () => {
      const result = paddingStyle({
        padding: '1x',
        paddingBlock: '2x',
      });
      expect(result).toEqual({
        padding: '16px 8px', // raw units
      });
    });
  });

  describe('edge cases', () => {
    it('handles null and undefined values', () => {
      const result = paddingStyle({
        padding: undefined,
        paddingBlock: undefined,
        paddingTop: undefined,
      });
      expect(result).toBeNull();
    });

    it('handles empty string values', () => {
      const result = paddingStyle({
        padding: '',
        paddingBlock: '',
        paddingTop: '2x',
      });
      expect(result).toEqual({
        padding: '16px 0 0 0', // raw unit: 2 * 8px
      });
    });

    it('handles zero values', () => {
      const result = paddingStyle({
        padding: 0,
        paddingTop: '1x',
      });
      expect(result).toEqual({
        padding: '8px 0px 0px 0px', // raw unit: 1 * 8px
      });
    });

    it('handles mixed types', () => {
      const result = paddingStyle({
        padding: true,
        paddingBlock: 16,
        paddingLeft: '3x',
      });
      expect(result).toEqual({
        padding: '16px 8px 16px 24px', // raw units
      });
    });
  });

  describe('directional padding with priority', () => {
    it('respects individual directions over directional padding', () => {
      const result = paddingStyle({
        padding: '2x top bottom',
        paddingTop: '5x',
      });
      expect(result).toEqual({
        padding: '40px 0 16px 0', // raw units
      });
    });

    it('combines directional padding with logical properties', () => {
      const result = paddingStyle({
        padding: '1x top',
        paddingInline: '3x',
      });
      expect(result).toEqual({
        padding: '8px 24px 0 24px', // raw units
      });
    });

    it('assigns values to directions in order they appear', () => {
      // First value (1x) → first direction (right), second value (2x) → second direction (top)
      expect(paddingStyle({ padding: 'right 1x top 2x' })).toEqual({
        padding: '16px 8px 0 0',
      });

      expect(paddingStyle({ padding: 'left 2x right 1x' })).toEqual({
        padding: '0 8px 0 16px',
      });
    });
  });

  describe('longhand modifier', () => {
    it('expands single value to 4 individual properties', () => {
      expect(paddingStyle({ padding: '2x longhand' })).toEqual({
        'padding-top': '16px',
        'padding-right': '16px',
        'padding-bottom': '16px',
        'padding-left': '16px',
      });
    });

    it('expands two-value string to 4 individual properties', () => {
      expect(paddingStyle({ padding: '1x 2x longhand' })).toEqual({
        'padding-top': '8px',
        'padding-right': '16px',
        'padding-bottom': '8px',
        'padding-left': '16px',
      });
    });

    it('expands directional value with longhand', () => {
      expect(paddingStyle({ padding: '2x top longhand' })).toEqual({
        'padding-top': '16px',
        'padding-right': '0',
        'padding-bottom': '0',
        'padding-left': '0',
      });
    });

    it('respects individual direction overrides with longhand', () => {
      expect(
        paddingStyle({ padding: '1x longhand', paddingTop: '3x' }),
      ).toEqual({
        'padding-top': '24px',
        'padding-right': '8px',
        'padding-bottom': '8px',
        'padding-left': '8px',
      });
    });

    it('respects paddingBlock/Inline overrides with longhand', () => {
      expect(
        paddingStyle({ padding: '1x longhand', paddingBlock: '2x' }),
      ).toEqual({
        'padding-top': '16px',
        'padding-right': '8px',
        'padding-bottom': '16px',
        'padding-left': '8px',
      });
    });

    it('expands CSS-wide keyword with longhand', () => {
      expect(paddingStyle({ padding: 'inherit longhand' })).toEqual({
        'padding-top': 'inherit',
        'padding-right': 'inherit',
        'padding-bottom': 'inherit',
        'padding-left': 'inherit',
      });
    });

    it('expands multi-group with longhand', () => {
      expect(paddingStyle({ padding: '1x longhand, 2x top' })).toEqual({
        'padding-top': '16px',
        'padding-right': '8px',
        'padding-bottom': '8px',
        'padding-left': '8px',
      });
    });
  });

  describe('output optimization', () => {
    it('outputs single value when all sides are equal', () => {
      expect(paddingStyle({ padding: '2x' })).toEqual({
        padding: '16px', // raw unit: 2 * 8px
      });
      expect(paddingStyle({ padding: 16 })).toEqual({
        padding: '16px',
      });
    });

    it('outputs two values when vertical and horizontal are equal', () => {
      expect(paddingStyle({ padding: '1x 2x' })).toEqual({
        padding: '8px 16px', // raw units
      });
      expect(paddingStyle({ paddingBlock: '1x', paddingInline: '2x' })).toEqual(
        {
          padding: '8px 16px', // raw units
        },
      );
    });

    it('outputs four values when three values differ', () => {
      expect(paddingStyle({ padding: '1x 2x 3x' })).toEqual({
        padding: '8px 16px 24px 16px', // raw units
      });
    });
  });

  describe('multi-group (comma-separated)', () => {
    it('base value with directional override', () => {
      expect(paddingStyle({ padding: '1x, 2x top' })).toEqual({
        padding: '16px 8px 8px 8px',
      });
    });

    it('base value with multiple directional overrides', () => {
      expect(paddingStyle({ padding: '1x, 2x top bottom' })).toEqual({
        padding: '16px 8px',
      });
    });

    it('directional groups without base', () => {
      expect(paddingStyle({ padding: '2x left right, 1x top bottom' })).toEqual(
        {
          padding: '8px 16px',
        },
      );
    });

    it('later groups override earlier groups for same direction', () => {
      expect(paddingStyle({ padding: '1x, 2x top, 3x top' })).toEqual({
        padding: '24px 8px 8px 8px',
      });
    });

    it('multi-group with paddingBlock override', () => {
      expect(
        paddingStyle({ padding: '1x, 2x left right', paddingBlock: '3x' }),
      ).toEqual({
        padding: '24px 16px',
      });
    });

    it('multi-group with individual direction override', () => {
      expect(paddingStyle({ padding: '1x, 2x top', paddingTop: '4x' })).toEqual(
        {
          padding: '32px 8px 8px 8px',
        },
      );
    });

    it('all sides same after multi-group resolves to single value', () => {
      expect(paddingStyle({ padding: '1x, 1x top' })).toEqual({
        padding: '8px',
      });
    });
  });
});
