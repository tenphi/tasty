import { dimensionStyle } from './dimension';

const dimension = dimensionStyle('inline-size');

export function inlineSizeStyle({
  inlineSize,
}: {
  inlineSize?: string | number | boolean;
}) {
  return dimension({ value: inlineSize });
}

inlineSizeStyle.__lookupStyles = ['inlineSize'];
