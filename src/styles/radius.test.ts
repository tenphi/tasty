import { radiusStyle } from './radius';

describe('radiusStyle', () => {
  describe('basic functionality', () => {
    it('returns null when no radius provided', () => {
      expect(radiusStyle({})).toBeNull();
    });

    it('handles boolean true value', () => {
      expect(radiusStyle({ radius: true })).toEqual({
        'border-radius': '6px',
      });
    });

    it('handles number value', () => {
      expect(radiusStyle({ radius: 8 })).toEqual({
        'border-radius': '8px',
      });
    });

    it('handles single string value', () => {
      expect(radiusStyle({ radius: '1r' })).toEqual({
        'border-radius': '6px',
      });
    });
  });

  describe('longhand modifier', () => {
    it('expands single value to 4 corner longhands', () => {
      expect(radiusStyle({ radius: '8px longhand' })).toEqual({
        'border-top-left-radius': '8px',
        'border-top-right-radius': '8px',
        'border-bottom-right-radius': '8px',
        'border-bottom-left-radius': '8px',
      });
    });

    it('expands default value (no explicit value) to 4 corner longhands', () => {
      expect(radiusStyle({ radius: 'longhand' })).toEqual({
        'border-top-left-radius': 'var(--radius)',
        'border-top-right-radius': 'var(--radius)',
        'border-bottom-right-radius': 'var(--radius)',
        'border-bottom-left-radius': 'var(--radius)',
      });
    });

    it('expands round modifier with longhand', () => {
      expect(radiusStyle({ radius: 'round longhand' })).toEqual({
        'border-top-left-radius': '9999rem',
        'border-top-right-radius': '9999rem',
        'border-bottom-right-radius': '9999rem',
        'border-bottom-left-radius': '9999rem',
      });
    });

    it('expands ellipse modifier with longhand', () => {
      expect(radiusStyle({ radius: 'ellipse longhand' })).toEqual({
        'border-top-left-radius': '50%',
        'border-top-right-radius': '50%',
        'border-bottom-right-radius': '50%',
        'border-bottom-left-radius': '50%',
      });
    });

    it('expands leaf modifier with longhand', () => {
      expect(radiusStyle({ radius: 'leaf longhand' })).toEqual({
        'border-top-left-radius': 'var(--sharp-radius)',
        'border-top-right-radius': 'var(--radius)',
        'border-bottom-right-radius': 'var(--sharp-radius)',
        'border-bottom-left-radius': 'var(--radius)',
      });
    });

    it('expands backleaf modifier with longhand', () => {
      expect(radiusStyle({ radius: 'backleaf longhand' })).toEqual({
        'border-top-left-radius': 'var(--radius)',
        'border-top-right-radius': 'var(--sharp-radius)',
        'border-bottom-right-radius': 'var(--radius)',
        'border-bottom-left-radius': 'var(--sharp-radius)',
      });
    });

    it('expands directional value with longhand', () => {
      expect(radiusStyle({ radius: '8px left longhand' })).toEqual({
        'border-top-left-radius': '8px',
        'border-top-right-radius': '0',
        'border-bottom-right-radius': '0',
        'border-bottom-left-radius': '8px',
      });
    });

    it('expands CSS-wide keyword with longhand', () => {
      expect(radiusStyle({ radius: 'inherit longhand' })).toEqual({
        'border-top-left-radius': 'inherit',
        'border-top-right-radius': 'inherit',
        'border-bottom-right-radius': 'inherit',
        'border-bottom-left-radius': 'inherit',
      });
    });
  });

  describe('CSS-wide keywords', () => {
    it('passes through radius: inherit', () => {
      expect(radiusStyle({ radius: 'inherit' })).toEqual({
        'border-radius': 'inherit',
      });
    });

    it('handles inherit with direction', () => {
      const result = radiusStyle({ radius: 'inherit left' });
      expect(result).toHaveProperty('border-top-left-radius', 'inherit');
      expect(result).toHaveProperty('border-bottom-left-radius', 'inherit');
    });
  });
});
