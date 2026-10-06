import { cleanup, render } from '@testing-library/react';
import type { ComponentProps, HTMLAttributes } from 'react';

import { tasty } from '../tasty';

import { filterBaseProps } from './filter-base-props';

const StyledElement = tasty({ as: 'div' });
const _ColoredElement = tasty({ styleProps: ['color', 'width'] as const });

function FilteredElement(props: HTMLAttributes<HTMLDivElement>) {
  return <StyledElement {...filterBaseProps(props)} />;
}

function FilteredStyleElement(props: ComponentProps<typeof _ColoredElement>) {
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

  it('forwards base props while removing style state maps', () => {
    const { container } = render(
      <FilteredStyleElement
        id="filtered"
        title="Details"
        color={{ '': '#purple', active: '#red' }}
        width={{ '': '2x', active: '4x' }}
        aria-label="Open"
        data-state="open"
      />,
    );
    const element = container.firstElementChild as HTMLDivElement;

    expect(element.id).toBe('filtered');
    expect(element.title).toBe('Details');
    expect(element.getAttribute('aria-label')).toBe('Open');
    expect(element.getAttribute('data-state')).toBe('open');
    expect(element.hasAttribute('color')).toBe(false);
    expect(element.hasAttribute('width')).toBe(false);
  });
});
