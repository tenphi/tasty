import { generateTypographyTokens } from './typography';

describe('generateTypographyTokens', () => {
  it('should generate typography token entries', () => {
    expect(
      generateTypographyTokens({
        body: {
          fontSize: '16px',
          lineHeight: '24px',
          fontWeight: 400,
        },
      }),
    ).toEqual({
      '$body-font-size': '16px',
      '$body-line-height': '24px',
      '$body-letter-spacing': 'normal',
      '$body-font-weight': 400,
    });
  });

  it('should throw for reserved preset names', () => {
    expect(() =>
      generateTypographyTokens({
        bold: {
          fontSize: '16px',
          lineHeight: '24px',
          fontWeight: 400,
        },
      }),
    ).toThrow(
      'Invalid typography preset name "bold". This name is reserved as a preset modifier.',
    );
  });

  it('should support state maps for typography values', () => {
    expect(
      generateTypographyTokens({
        t2: {
          fontSize: '16px',
          lineHeight: '1.5',
          fontWeight: { '': '400', '@dark': '300' },
        },
      }),
    ).toEqual({
      '$t2-font-size': '16px',
      '$t2-line-height': '1.5',
      '$t2-letter-spacing': 'normal',
      '$t2-font-weight': { '': '400', '@dark': '300' },
    });
  });

  it('should pass through state maps for all optional fields', () => {
    const result = generateTypographyTokens({
      h1: {
        fontSize: { '': '32px', '@mobile': '24px' },
        lineHeight: { '': '1.2', '@mobile': '1.3' },
        fontWeight: '700',
        boldFontWeight: { '': '800', '@dark': '900' },
        iconSize: { '': '24px', '@mobile': '20px' },
      },
    });
    expect(result['$h1-font-size']).toEqual({
      '': '32px',
      '@mobile': '24px',
    });
    expect(result['$h1-line-height']).toEqual({
      '': '1.2',
      '@mobile': '1.3',
    });
    expect(result['$h1-bold-font-weight']).toEqual({
      '': '800',
      '@dark': '900',
    });
    expect(result['$h1-icon-size']).toEqual({
      '': '24px',
      '@mobile': '20px',
    });
  });
});
