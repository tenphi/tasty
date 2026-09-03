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
});
