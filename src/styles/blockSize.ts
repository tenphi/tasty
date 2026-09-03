import { dimensionStyle } from './dimension';

const dimension = dimensionStyle('block-size');

export function blockSizeStyle({
  blockSize,
}: {
  blockSize?: string | number | boolean;
}) {
  return dimension({ value: blockSize });
}

blockSizeStyle.__lookupStyles = ['blockSize'];
