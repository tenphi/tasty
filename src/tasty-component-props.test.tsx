import { cleanup, render } from '@testing-library/react';

import { resetConfig } from './config';
import { destroy } from './injector';
import { tasty } from './tasty';

interface PanelProps {
  position: 'top-right' | 'bottom-left';
  color: 'brand' | 'muted';
  width: number;
  className?: string;
}

function Panel({ position, color, width, className }: PanelProps) {
  return (
    <div
      className={className}
      data-position={position}
      data-color={color}
      data-width={width}
    />
  );
}

describe('wrapped component prop forwarding', () => {
  beforeEach(() => resetConfig());
  afterEach(() => {
    cleanup();
    destroy();
    resetConfig();
  });

  it('forwards component props while applying the same CSS property through styles', () => {
    const Sidebar = tasty({ as: Panel, styles: { position: 'relative' } });
    const { container, rerender } = render(
      <Sidebar position="top-right" color="brand" width={42} />,
    );
    const element = container.firstElementChild as HTMLDivElement;

    expect(element.dataset.position).toBe('top-right');
    expect(element.dataset.color).toBe('brand');
    expect(element.dataset.width).toBe('42');
    expect(getComputedStyle(element).position).toBe('relative');

    rerender(<Sidebar position="bottom-left" color="muted" width={24} />);
    expect(element.dataset.position).toBe('bottom-left');
    expect(element.dataset.color).toBe('muted');
    expect(element.dataset.width).toBe('24');
    expect(getComputedStyle(element).position).toBe('relative');
  });

  it('consumes an explicitly claimed style prop and forwards the other component props', () => {
    const StyledPanel = tasty({ as: Panel, styleProps: ['position'] });
    const { container } = render(
      <StyledPanel position="absolute" color="brand" width={42} />,
    );
    const element = container.firstElementChild as HTMLDivElement;

    expect(element.hasAttribute('data-position')).toBe(false);
    expect(element.dataset.color).toBe('brand');
    expect(element.dataset.width).toBe('42');
    expect(getComputedStyle(element).position).toBe('absolute');
  });

  it('continues to consume always-available base style props', () => {
    function DisplayOwner({
      display,
      className,
    }: {
      display: string;
      className?: string;
    }) {
      return <div className={className} data-display={display} />;
    }
    const Styled = tasty({ as: DisplayOwner });
    const { container } = render(<Styled display="flex" />);
    const element = container.firstElementChild as HTMLDivElement;

    expect(element.hasAttribute('data-display')).toBe(false);
    expect(getComputedStyle(element).display).toBe('flex');
  });
});
