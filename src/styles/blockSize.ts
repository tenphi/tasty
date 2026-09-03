import { dimensionStyle } from './dimension';
import { BLOCK_SIZE_STYLES } from './logical-list';

const dimension = dimensionStyle('block-size');

export function blockSizeStyle({
  blockSize,
  minBlockSize,
  maxBlockSize,
}: {
  blockSize?: string | number | boolean;
  minBlockSize?: string | number | boolean;
  maxBlockSize?: string | number | boolean;
}) {
  return dimension({
    value: blockSize,
    min: minBlockSize,
    max: maxBlockSize,
  });
}

blockSizeStyle.__lookupStyles = [...BLOCK_SIZE_STYLES];
