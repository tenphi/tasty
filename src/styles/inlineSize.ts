import { dimensionStyle } from './dimension';
import { INLINE_SIZE_STYLES } from './logical-list';

const dimension = dimensionStyle('inline-size');

export function inlineSizeStyle({
  inlineSize,
  minInlineSize,
  maxInlineSize,
}: {
  inlineSize?: string | number | boolean;
  minInlineSize?: string | number | boolean;
  maxInlineSize?: string | number | boolean;
}) {
  return dimension({
    value: inlineSize,
    min: minInlineSize,
    max: maxInlineSize,
  });
}

inlineSizeStyle.__lookupStyles = [...INLINE_SIZE_STYLES];
