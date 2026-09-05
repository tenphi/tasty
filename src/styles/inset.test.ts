import { insetStyle } from './inset';

describe('insetStyle', () => {
  describe('basic functionality', () => {
    it('returns null when no props are provided', () => {
      expect(insetStyle({})).toBeNull();
    });

    it('handles boolean true for inset', () => {
      expect(insetStyle({ inset: true })).toEqual({ inset: '0' });
    });

    it('handles number value for inset', () => {
      expect(insetStyle({ inset: 0 })).toEqual({ inset: '0px' });
    });

    it('handles single string value', () => {
      expect(insetStyle({ inset: '1x' })).toEqual({ inset: '8px' });
    });

    it('handles two-value string', () => {
      expect(insetStyle({ inset: '1x 2x' })).toEqual({
        inset: '8px 16px',
      });
    });

    it('handles four-value string', () => {
      expect(insetStyle({ inset: '1x 2x 3x 4x' })).toEqual({
        inset: '8px 16px 24px 32px',
      });
    });
  });

  describe('directional inset', () => {
    it('handles directional inset - top only', () => {
      expect(insetStyle({ inset: '2x top' })).toEqual({
        inset: '16px auto auto auto',
      });
    });

    it('handles directional inset - left and right', () => {
      expect(insetStyle({ inset: '1x left right' })).toEqual({
        inset: 'auto 8px',
      });
    });
  });

  describe('individual direction props only', () => {
    it('outputs individual CSS properties when only direction props are used', () => {
      expect(insetStyle({ top: '0', left: '1x' })).toEqual({
        top: '0',
        left: '8px',
      });
    });

    it('handles single individual direction', () => {
      expect(insetStyle({ bottom: '2x' })).toEqual({
        bottom: '16px',
      });
    });
  });

  describe('longhand modifier', () => {
    it('expands inset to individual top/right/bottom/left properties', () => {
      expect(insetStyle({ inset: '0 longhand' })).toEqual({
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      });
    });

    it('expands inset with value to individual properties', () => {
      expect(insetStyle({ inset: '1x longhand' })).toEqual({
        top: '8px',
        right: '8px',
        bottom: '8px',
        left: '8px',
      });
    });

    it('expands directional inset with longhand', () => {
      expect(insetStyle({ inset: '2x top longhand' })).toEqual({
        top: '16px',
        right: 'auto',
        bottom: 'auto',
        left: 'auto',
      });
    });

    it('expands CSS-wide keyword with longhand', () => {
      expect(insetStyle({ inset: 'inherit longhand' })).toEqual({
        top: 'inherit',
        right: 'inherit',
        bottom: 'inherit',
        left: 'inherit',
      });
    });
  });

  describe('multi-group (comma-separated)', () => {
    it('base value with directional override', () => {
      expect(insetStyle({ inset: '0, 2x top' })).toEqual({
        inset: '16px 0 0 0',
      });
    });

    it('base value with multiple directional overrides', () => {
      expect(insetStyle({ inset: '0, 1x top bottom' })).toEqual({
        inset: '8px 0',
      });
    });

    it('directional groups without base', () => {
      expect(insetStyle({ inset: '1x left right, 2x top bottom' })).toEqual({
        inset: '16px 8px',
      });
    });

    it('later groups override earlier groups for same direction', () => {
      expect(insetStyle({ inset: '0, 1x top, 2x top' })).toEqual({
        inset: '16px 0 0 0',
      });
    });

    it('multi-group with individual direction override', () => {
      expect(insetStyle({ inset: '0, 1x top', top: '4x' })).toEqual({
        inset: '32px 0 0 0',
      });
    });

    it('all sides same after multi-group resolves to single value', () => {
      expect(insetStyle({ inset: '1x, 1x top' })).toEqual({
        inset: '8px',
      });
    });
  });
  describe('dock modifier', () => {
    it('pins an edge and spans the perpendicular pair', () => {
      expect(insetStyle({ inset: 'bottom dock' })).toEqual({
        inset: 'auto 0 0 0',
      });
      expect(insetStyle({ inset: 'right dock' })).toEqual({
        inset: '0 0 0 auto',
      });
      expect(insetStyle({ inset: 'top dock' })).toEqual({
        inset: '0 0 auto 0',
      });
    });

    it('applies an explicit value to every docked side', () => {
      expect(insetStyle({ inset: '2x bottom dock' })).toEqual({
        inset: 'auto 16px 16px 16px',
      });
    });

    it('takes a second value for the spanned sides', () => {
      // A span modifier is the one case where a directional group takes two
      // values: the first insets the named edge, the second the sides it spans
      // (bottom 2x, sides 4x). Without `dock` a second value is ignored.
      expect(insetStyle({ inset: '2x 4x bottom dock' })).toEqual({
        inset: 'auto 32px 16px 32px',
      });
      expect(insetStyle({ inset: '2x 4x right dock' })).toEqual({
        inset: '32px 16px 32px auto',
      });
    });

    it('keeps every named edge explicit when spanning multiple sides', () => {
      expect(insetStyle({ inset: '2x 4x top right dock' })).toEqual({
        inset: '16px 16px 32px 32px',
      });
    });

    it('docks every side when no direction is named', () => {
      expect(insetStyle({ inset: 'dock' })).toEqual({ inset: '0' });
    });

    it('leaves a bare directional inset untouched', () => {
      expect(insetStyle({ inset: 'right' })).toEqual({
        inset: 'auto 0 auto auto',
      });
    });
  });
});
