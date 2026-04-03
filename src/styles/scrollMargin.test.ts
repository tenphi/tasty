import { scrollMarginStyle } from './scrollMargin';

describe('scrollMarginStyle', () => {
  describe('basic functionality', () => {
    it('returns null when no scroll margin properties are provided', () => {
      expect(scrollMarginStyle({})).toBeNull();
    });

    it('handles single string value (shorthand)', () => {
      const result = scrollMarginStyle({ scrollMargin: '2x' });
      expect(result).toEqual({
        'scroll-margin': '16px', // raw unit: 2 * 8px (default CUSTOM_UNITS)
      });
    });

    it('handles boolean true (trueValue 1x → default gap unit)', () => {
      const result = scrollMarginStyle({ scrollMargin: true });
      expect(result).toEqual({
        'scroll-margin': '8px', // raw unit: 1 * 8px
      });
    });

    it('handles number value uniformly on all sides', () => {
      const result = scrollMarginStyle({ scrollMargin: 16 });
      expect(result).toEqual({
        'scroll-margin': '16px',
      });
    });

    it('handles two-value string (vertical horizontal)', () => {
      const result = scrollMarginStyle({ scrollMargin: '1x 2x' });
      expect(result).toEqual({
        'scroll-margin': '8px 16px',
      });
    });
  });

  describe('directional scroll margin', () => {
    it('handles directional value — top only', () => {
      const result = scrollMarginStyle({ scrollMargin: '2x top' });
      expect(result).toEqual({
        'scroll-margin': '16px 0 0 0',
      });
    });
  });

  describe('scrollMarginBlock and scrollMarginInline', () => {
    it('handles scrollMarginBlock', () => {
      const result = scrollMarginStyle({ scrollMarginBlock: '1x' });
      expect(result).toEqual({
        'scroll-margin': '8px 0',
      });
    });

    it('handles scrollMarginInline', () => {
      const result = scrollMarginStyle({ scrollMarginInline: '4x' });
      expect(result).toEqual({
        'scroll-margin': '0 32px',
      });
    });
  });

  describe('individual direction properties', () => {
    it('handles individual directions', () => {
      const result = scrollMarginStyle({
        scrollMarginTop: '2x',
        scrollMarginRight: '3x',
        scrollMarginBottom: '1x',
        scrollMarginLeft: '4x',
      });
      expect(result).toEqual({
        'scroll-margin': '16px 24px 8px 32px',
      });
    });

    it('handles number on a single direction via shorthand output', () => {
      const result = scrollMarginStyle({ scrollMarginTop: 16 });
      expect(result).toEqual({
        'scroll-margin': '16px 0 0 0',
      });
    });
  });

  describe('priority system', () => {
    it('scrollMargin (low) < scrollMarginBlock/scrollMarginInline (medium)', () => {
      const result = scrollMarginStyle({
        scrollMargin: '1x',
        scrollMarginBlock: '2x',
        scrollMarginInline: '3x',
      });
      expect(result).toEqual({
        'scroll-margin': '16px 24px',
      });
    });

    it('scrollMarginBlock/scrollMarginInline (medium) < individual directions (high)', () => {
      const result = scrollMarginStyle({
        scrollMarginBlock: '2x',
        scrollMarginInline: '3x',
        scrollMarginTop: '4x',
        scrollMarginRight: '5x',
      });
      expect(result).toEqual({
        'scroll-margin': '32px 40px 16px 24px',
      });
    });

    it('full chain: scrollMargin < block/inline < individual', () => {
      const result = scrollMarginStyle({
        scrollMargin: '1x',
        scrollMarginBlock: '2x',
        scrollMarginInline: '3x',
        scrollMarginTop: '4x',
        scrollMarginRight: '5x',
      });
      expect(result).toEqual({
        'scroll-margin': '32px 40px 16px 24px',
      });
    });
  });

  describe('CSS-wide keywords', () => {
    it('passes inherit through shorthand', () => {
      const result = scrollMarginStyle({ scrollMargin: 'inherit' });
      expect(result).toEqual({
        'scroll-margin': 'inherit',
      });
    });
  });
});
