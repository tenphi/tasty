import { hasMediaContradiction } from './materialize-contradictions';
import type { ParsedMediaCondition } from './materialize-types';

function withOppositePolarity(
  condition: ParsedMediaCondition,
): ParsedMediaCondition[] {
  return [condition, { ...condition, negated: !condition.negated }];
}

describe('hasMediaContradiction()', () => {
  it.each([
    {
      subtype: 'type',
      condition: 'print',
      mediaType: 'print',
      negated: false,
    },
    {
      subtype: 'feature',
      condition: '(prefers-color-scheme: dark)',
      feature: 'prefers-color-scheme',
      featureValue: 'dark',
      negated: false,
    },
    {
      subtype: 'dimension',
      condition: '(inline-size < 48rem)',
      dimension: 'inline-size',
      upperBound: {
        value: '48rem',
        valueNumeric: 48,
        inclusive: false,
      },
      negated: false,
    },
  ] satisfies ParsedMediaCondition[])(
    'detects opposite $subtype conditions',
    (condition) => {
      expect(hasMediaContradiction(withOppositePolarity(condition))).toBe(true);
    },
  );

  it('keeps identical text in different media subtypes isolated', () => {
    const conditions: ParsedMediaCondition[] = [
      {
        subtype: 'type',
        condition: 'print',
        mediaType: 'print',
        negated: false,
      },
      {
        subtype: 'feature',
        condition: 'print',
        feature: 'print',
        negated: true,
      },
      {
        subtype: 'dimension',
        condition: 'print',
        dimension: 'width',
        negated: true,
      },
    ];

    expect(hasMediaContradiction(conditions)).toBe(false);
  });

  it('detects incompatible ranges within one dimension', () => {
    const conditions: ParsedMediaCondition[] = [
      {
        subtype: 'dimension',
        condition: '(width >= 50rem)',
        dimension: 'width',
        lowerBound: {
          value: '50rem',
          valueNumeric: 50,
          inclusive: true,
        },
        negated: false,
      },
      {
        subtype: 'dimension',
        condition: '(width < 40rem)',
        dimension: 'width',
        upperBound: {
          value: '40rem',
          valueNumeric: 40,
          inclusive: false,
        },
        negated: false,
      },
    ];

    expect(hasMediaContradiction(conditions)).toBe(true);
  });

  it('does not combine ranges from different dimensions', () => {
    const conditions: ParsedMediaCondition[] = [
      {
        subtype: 'dimension',
        condition: '(inline-size >= 50rem)',
        dimension: 'inline-size',
        lowerBound: {
          value: '50rem',
          valueNumeric: 50,
          inclusive: true,
        },
        negated: false,
      },
      {
        subtype: 'dimension',
        condition: '(block-size < 40rem)',
        dimension: 'block-size',
        upperBound: {
          value: '40rem',
          valueNumeric: 40,
          inclusive: false,
        },
        negated: false,
      },
    ];

    expect(hasMediaContradiction(conditions)).toBe(false);
  });

  describe('dimension ranges', () => {
    function width(
      bound: 'lowerBound' | 'upperBound',
      value: string,
    ): ParsedMediaCondition {
      const op = bound === 'lowerBound' ? '>=' : '<';
      return {
        subtype: 'dimension',
        condition: `(width ${op} ${value})`,
        dimension: 'width',
        [bound]: {
          value,
          valueNumeric: /^\d/.test(value) ? parseFloat(value) : null,
          inclusive: bound === 'lowerBound',
        },
        negated: false,
      };
    }

    it('detects an empty range in one unit', () => {
      expect(
        hasMediaContradiction([
          width('lowerBound', '800px'),
          width('upperBound', '600px'),
        ]),
      ).toBe(true);
    });

    // 150em is 2400px at the default font size, but the user's can differ.
    it.each([
      ['200px', '150em'],
      ['200em', '150px'],
      ['200px', '150rem'],
      ['200px', 'calc(var(--gap) * 150)'],
    ])('does not compare %s with %s', (lower, upper) => {
      expect(
        hasMediaContradiction([
          width('lowerBound', lower),
          width('upperBound', upper),
        ]),
      ).toBe(false);
    });
  });
});
