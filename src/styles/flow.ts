import { resolveCustomProperties } from '../utils/styles';
import type { NoType } from './types';

export function flowStyle({
  display = 'block',
  flow,
}: {
  display?: string | NoType;
  flow?: string | NoType;
}) {
  if (typeof display !== 'string' || !flow) {
    return null;
  }

  let style;

  if (display.includes('grid')) {
    style = 'grid-auto-flow';
  } else if (display.includes('flex')) {
    style = 'flex-flow';
  }

  return style ? { [style]: resolveCustomProperties(flow) } : null;
}

flowStyle.__lookupStyles = ['display', 'flow'];
