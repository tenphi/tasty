import { cleanup, render } from '@testing-library/react';
import type { HTMLAttributes } from 'react';

import { tasty } from '../tasty';

import { filterBaseProps } from './filter-base-props';

const StyledElement = tasty({ as: 'div' });

function FilteredElement(props: HTMLAttributes<HTMLDivElement>) {
  return <StyledElement {...filterBaseProps(props)} />;
}

describe('filtered DOM props', () => {
  afterEach(() => cleanup());

  it('forwards title and inert through a filtered Tasty component', () => {
    const { container, rerender } = render(
      <FilteredElement title="Details" inert />,
    );
    const element = container.firstElementChild as HTMLDivElement;

    expect(element.title).toBe('Details');
    expect(element.inert).toBe(true);
    expect(element.hasAttribute('inert')).toBe(true);

    rerender(<FilteredElement inert={false} />);

    expect(element.hasAttribute('title')).toBe(false);
    expect(element.inert).toBe(false);
    expect(element.hasAttribute('inert')).toBe(false);
  });
});
