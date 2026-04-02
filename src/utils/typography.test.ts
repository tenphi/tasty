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
      '$body-letter-spacing': '0',
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
});
