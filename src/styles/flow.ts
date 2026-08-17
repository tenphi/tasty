import { resolveCustomProperties } from '../utils/styles';

export function flowStyle({
  display = 'block',
  flow,
}: {
  display?: string;
  flow?: string;
}) {
  let style;

  if (display.includes('grid')) {
    style = 'grid-auto-flow';
  } else if (display.includes('flex')) {
    style = 'flex-flow';
  }

  return style && flow ? { [style]: resolveCustomProperties(flow) } : null;
}

flowStyle.__lookupStyles = ['display', 'flow'];
