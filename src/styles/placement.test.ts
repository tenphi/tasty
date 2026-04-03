import { placementStyle } from './placement';

describe('placementStyle', () => {
  it('returns null when no props provided', () => {
    expect(placementStyle({})).toBeNull();
  });

  it('place="center" sets all four longhands to center', () => {
    expect(placementStyle({ place: 'center' })).toEqual({
      'align-items': 'center',
      'justify-items': 'center',
      'align-content': 'center',
      'justify-content': 'center',
    });
  });

  it('place="start end" maps first word to align-* and second to justify-*', () => {
    expect(placementStyle({ place: 'start end' })).toEqual({
      'align-items': 'start',
      'justify-items': 'end',
      'align-content': 'start',
      'justify-content': 'end',
    });
  });

  it('align="center" sets align-items and align-content to center', () => {
    expect(placementStyle({ align: 'center' })).toEqual({
      'align-items': 'center',
      'align-content': 'center',
    });
  });

  it('justify="space-between" sets justify-items and justify-content', () => {
    expect(placementStyle({ justify: 'space-between' })).toEqual({
      'justify-items': 'space-between',
      'justify-content': 'space-between',
    });
  });

  it('placeItems="center" sets align-items and justify-items to center', () => {
    expect(placementStyle({ placeItems: 'center' })).toEqual({
      'align-items': 'center',
      'justify-items': 'center',
    });
  });

  it('placeContent="start end" sets align-content and justify-content', () => {
    expect(placementStyle({ placeContent: 'start end' })).toEqual({
      'align-content': 'start',
      'justify-content': 'end',
    });
  });

  it('alignItems alone sets only align-items', () => {
    expect(placementStyle({ alignItems: 'flex-start' })).toEqual({
      'align-items': 'flex-start',
    });
  });

  it('place is overridden by alignItems for align-items', () => {
    expect(
      placementStyle({ place: 'center', alignItems: 'flex-start' }),
    ).toEqual({
      'align-items': 'flex-start',
      'justify-items': 'center',
      'align-content': 'center',
      'justify-content': 'center',
    });
  });

  it('align is overridden by alignContent for align-content', () => {
    expect(
      placementStyle({ align: 'center', alignContent: 'flex-end' }),
    ).toEqual({
      'align-items': 'center',
      'align-content': 'flex-end',
    });
  });

  it('chains place, placeItems, and justifyItems with correct overrides', () => {
    expect(
      placementStyle({
        place: 'start',
        placeItems: 'center',
        justifyItems: 'end',
      }),
    ).toEqual({
      'align-items': 'center',
      'justify-items': 'end',
      'align-content': 'start',
      'justify-content': 'start',
    });
  });

  it('align true maps to center on align-items and align-content', () => {
    expect(placementStyle({ align: true })).toEqual({
      'align-items': 'center',
      'align-content': 'center',
    });
  });

  it('returns null when only empty or false props are provided', () => {
    expect(
      placementStyle({
        place: '',
        placeItems: false,
        alignContent: '',
      }),
    ).toBeNull();
  });
});
