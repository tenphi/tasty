import { scrollPaddingStyle } from './scrollPadding';

describe('scrollPaddingStyle', () => {
  it('handles shorthand values and Tasty units', () => {
    expect(scrollPaddingStyle({ scrollPadding: '1x 2x' })).toEqual({
      'scroll-padding': '8px 16px',
    });
    expect(scrollPaddingStyle({ scrollPadding: true })).toEqual({
      'scroll-padding': '8px',
    });
  });

  it('supports physical direction modifiers and longhands', () => {
    expect(scrollPaddingStyle({ scrollPadding: '2x top, 4x right' })).toEqual({
      'scroll-padding': '16px 32px 0 0',
    });
    expect(scrollPaddingStyle({ scrollPaddingLeft: 12 })).toEqual({
      'scroll-padding': '0 0 0 12px',
    });
  });
});
