import { flowStyle } from './flow';
import { gapStyle } from './gap';

describe('flowStyle', () => {
  it.each([null, undefined, false])('skips an unset flow (%s)', (flow) => {
    expect(flowStyle({ display: 'flex', flow })).toBeNull();
  });

  it.each([null, undefined, false, 'block'])(
    'skips flow without a flex or grid display (%s)',
    (display) => {
      expect(flowStyle({ display, flow: 'row wrap' })).toBeNull();
    },
  );

  it.each(['flex', 'inline-flex'])('renders flex flow for %s', (display) => {
    expect(flowStyle({ display, flow: 'row wrap' })).toEqual({
      'flex-flow': 'row wrap',
    });
  });

  it.each(['grid', 'inline-grid'])('renders grid flow for %s', (display) => {
    expect(flowStyle({ display, flow: 'column dense' })).toEqual({
      'grid-auto-flow': 'column dense',
    });
  });
});

describe('gapStyle with unset layout values', () => {
  it.each([null, undefined, false])(
    'uses block gaps for an unset display (%s)',
    (display) => {
      expect(gapStyle({ display, flow: 'row', gap: '8px' })).toEqual({
        $: '& > *:not(:last-child)',
        'margin-right': '8px',
      });
    },
  );

  it.each([null, undefined, false])(
    'uses column gaps for an unset block flow (%s)',
    (flow) => {
      expect(gapStyle({ flow, gap: '8px' })).toEqual({
        $: '& > *:not(:last-child)',
        'margin-bottom': '8px',
      });
    },
  );
});
