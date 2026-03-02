import { insetStyle } from './inset';

describe('insetStyle', () => {
  describe('basic functionality', () => {
    it('returns empty object when no props are provided', () => {
      expect(insetStyle({})).toEqual({});
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

  describe('insetBlock and insetInline', () => {
    it('handles insetBlock', () => {
      expect(insetStyle({ insetBlock: '1x' })).toEqual({
        inset: '8px auto',
      });
    });

    it('handles insetInline', () => {
      expect(insetStyle({ insetInline: '2x' })).toEqual({
        inset: 'auto 16px',
      });
    });
  });

  describe('priority system', () => {
    it('inset < insetBlock/insetInline < individual', () => {
      expect(
        insetStyle({
          inset: '1x',
          insetBlock: '2x',
          top: '3x',
        }),
      ).toEqual({
        inset: '24px 8px 16px 8px',
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

    it('multi-group with insetBlock override', () => {
      expect(
        insetStyle({ inset: '0, 1x left right', insetBlock: '3x' }),
      ).toEqual({
        inset: '24px 8px',
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
});
