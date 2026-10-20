/**
 * The extension form, `tasty(Base, options)`: what its own options do, what it
 * keeps from the base, and that it does not re-run the style pipeline on every
 * render.
 */

import { render } from '@testing-library/react';

import type * as ComputeStylesModule from './compute-styles';
import { configure, resetConfig } from './config';
import { destroy, gc, getCSSText } from './injector';
import type { Styles } from './styles/types';
import { tasty } from './tasty';

const { pipeline } = vi.hoisted(() => ({ pipeline: { runs: 0 } }));

vi.mock('./compute-styles', async (importOriginal) => {
  const actual = await importOriginal<typeof ComputeStylesModule>();
  return {
    ...actual,
    computeStyles: (...args: Parameters<typeof actual.computeStyles>) => {
      pipeline.runs++;
      return actual.computeStyles(...args);
    },
  };
});

afterEach(() => {
  destroy();
  resetConfig();
  pipeline.runs = 0;
});

const Base = tasty({
  styles: {
    display: 'block',
    color: { '': '#dark', isActive: '#purple' },
  },
  elements: { Title: 'h2' },
});

function rendered(element: Element | null): HTMLElement {
  return element as HTMLElement;
}

describe('extension options', () => {
  it('turns its styleProps into styles', () => {
    const Card = tasty(Base, { styleProps: ['padding'] as const });
    const { container } = render(<Card padding="3x" />);
    const el = rendered(container.firstElementChild);

    expect(el.hasAttribute('padding')).toBe(false);
    expect(getComputedStyle(el).paddingTop).toBe('24px');
  });

  it('turns its modProps into mods instead of DOM attributes', () => {
    const Card = tasty(Base, { modProps: ['isActive'] as const });
    const { container } = render(<Card isActive />);
    const el = rendered(container.firstElementChild);

    expect(el.hasAttribute('isactive')).toBe(false);
    expect(el.hasAttribute('data-is-active')).toBe(true);
  });

  it('keeps instance mods next to its modProps', () => {
    const Card = tasty(Base, { modProps: ['isActive'] as const });
    const { container } = render(<Card isActive mods={{ open: true }} />);
    const el = rendered(container.firstElementChild);

    expect(el.hasAttribute('data-is-active')).toBe(true);
    expect(el.hasAttribute('data-open')).toBe(true);
  });

  it('turns its tokenProps into tokens', () => {
    const Card = tasty(Base, {
      tokenProps: ['progress', 'accentColor'] as const,
      tokens: { $size: '4px' },
    });
    const { container } = render(<Card progress={0.5} accentColor="#purple" />);
    const el = rendered(container.firstElementChild);

    expect(el.hasAttribute('progress')).toBe(false);
    expect(el.style.getPropertyValue('--progress')).toBe('0.5');
    expect(el.style.getPropertyValue('--accent-color')).toBe(
      'var(--purple-color)',
    );
    expect(el.style.getPropertyValue('--size')).toBe('4px');
  });

  it('applies its variants, with a default variant', () => {
    const Card = tasty(Base, {
      styles: { padding: '1x' },
      variants: { roomy: { padding: '4x' }, tight: { padding: '0' } },
      variant: 'roomy',
    });
    const { container, rerender } = render(<Card />);
    const el = () => rendered(container.firstElementChild);

    expect(getComputedStyle(el()).paddingTop).toBe('32px');
    expect(el().hasAttribute('variant')).toBe(false);

    rerender(<Card variant="tight" />);
    expect(getComputedStyle(el()).paddingTop).toBe('0px');
    // Base styles still apply under the variant.
    expect(getComputedStyle(el()).display).toBe('block');
  });

  it("still selects the base's own variants", () => {
    const Button = tasty({
      variants: { default: { padding: '1x' }, large: { padding: '4x' } },
    });
    const Primary = tasty(Button, { styles: { color: '#purple' } });
    const { container } = render(<Primary variant="large" />);

    expect(
      getComputedStyle(rendered(container.firstElementChild)).paddingTop,
    ).toBe('32px');
  });

  it("adds its elements and keeps the base's", () => {
    const Card = tasty(Base, { elements: { Icon: 'span' } });

    expect(Card.Title).toBe(Base.Title);

    const { container } = render(
      <Card>
        <Card.Title>Title</Card.Title>
        <Card.Icon />
      </Card>,
    );

    expect(container.querySelector('h2[data-element="Title"]')).not.toBeNull();
    expect(container.querySelector('span[data-element="Icon"]')).not.toBeNull();
  });
});

describe('default variant', () => {
  const Button = tasty({
    styles: { display: 'block' },
    variants: {
      primary: { padding: '1x' },
      secondary: { padding: '2x' },
    },
    variant: 'primary',
  });

  it('applies when the variant prop is omitted', () => {
    const { container } = render(<Button />);
    const el = rendered(container.firstElementChild);

    expect(getComputedStyle(el).paddingTop).toBe('8px');
    expect(el.hasAttribute('variant')).toBe(false);
  });

  it('gives way to the prop, and stands in for an unknown one', () => {
    const { container, rerender } = render(<Button variant="secondary" />);
    const el = () => rendered(container.firstElementChild);

    expect(getComputedStyle(el()).paddingTop).toBe('16px');

    rerender(<Button variant={'unknown' as 'primary'} />);
    expect(getComputedStyle(el()).paddingTop).toBe('8px');
  });
});

describe('render cost', () => {
  it('computes an extension once across re-renders', () => {
    const Card = tasty(Base, { styles: { padding: '2x' } });
    const { rerender } = render(<Card />);
    const afterFirst = pipeline.runs;

    rerender(<Card />);
    rerender(<Card />);

    expect(afterFirst).toBeGreaterThan(0);
    expect(pipeline.runs).toBe(afterFirst);
  });

  it('computes stable instance styles once', () => {
    const STYLES: Styles = { margin: '1x' };
    const Card = tasty(Base, { styles: { padding: '2x' } });
    const { rerender } = render(<Card styles={STYLES} />);
    const afterFirst = pipeline.runs;

    rerender(<Card styles={STYLES} />);
    rerender(<Base styles={STYLES} />);
    rerender(<Base styles={STYLES} />);

    // One more run for `Base` with the same object over different defaults.
    expect(pipeline.runs).toBe(afterFirst + 1);
  });

  it('applies new instance styles on every render', () => {
    const Card = tasty(Base, { styles: { padding: '2x' } });
    const { container, rerender } = render(<Card styles={{ margin: '1x' }} />);
    const el = () => rendered(container.firstElementChild);

    expect(getComputedStyle(el()).marginTop).toBe('8px');

    rerender(<Card styles={{ margin: '3x' }} />);
    expect(getComputedStyle(el()).marginTop).toBe('24px');
    expect(getComputedStyle(el()).paddingTop).toBe('16px');
  });

  it.each([
    ['factory styles', () => tasty({ styles: { padding: '2x' } })],
    ['an extension', () => tasty(Base, { styles: { padding: '2x' } })],
  ])(
    're-injects the cached styles of %s after gc() collected them',
    (_, create) => {
      configure({ gc: { grace: 0 } });
      const Card = create();

      const first = render(<Card />);
      const classes = first.container.firstElementChild!.className.split(' ');
      first.unmount();
      gc({ force: true });
      for (const name of classes) expect(getCSSText()).not.toContain(name);

      const second = render(<Card />);
      const el = rendered(second.container.firstElementChild);

      expect(el.className.split(' ')).toEqual(classes);
      for (const name of classes) expect(getCSSText()).toContain(name);
      expect(getComputedStyle(el).paddingTop).toBe('16px');
    },
  );
});
