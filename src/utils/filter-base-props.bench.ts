import { bench, describe } from 'vitest';

import { filterBaseProps } from './filter-base-props';

const props = {
  id: 'trigger',
  role: 'button',
  tabIndex: 0,
  className: 'trigger',
  style: { color: 'red' },
  children: 'Open',
  hidden: false,
  disabled: false,
  'aria-label': 'Open menu',
  'aria-expanded': false,
  'data-testid': 'trigger',
  'data-state': 'closed',
  onClick: () => undefined,
  onKeyDown: () => undefined,
  onPress: () => undefined,
  name: 'discarded',
  value: 'discarded',
  type: 'discarded',
  title: 'discarded',
  autoFocus: true,
};

const customProps = new Set(['name', 'value', 'type']);

describe('filterBaseProps', () => {
  bench('common component props', () => {
    filterBaseProps(props);
  });

  bench('events and custom props', () => {
    filterBaseProps(props, { eventProps: true, propNames: customProps });
  });
});
