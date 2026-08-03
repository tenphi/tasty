/**
 * `configure({ baseStyleProps })` — promoting style names to props on every
 * component.
 *
 * Most components are created inside `it()` because `resetConfig()` does not clear
 * factory-level caches. The one deliberate exception is `ModuleScopeBox` below,
 * which exists to reproduce the module-eval-order case: factories are created when
 * their module loads, which can be *before* any `configure()` call.
 */
import { render } from '@testing-library/react';

import { configure, resetConfig } from '../config';
import { Element, tasty } from '../tasty';

import { baseStylePropsRegistry, getBaseStyleProps } from './base-props';

// Created at module load, before any configure() in this file runs.
const ModuleScopeBox = tasty({ qa: 'ModuleScopeBox' });

describe('baseStyleProps', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetConfig();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    resetConfig();
    vi.unstubAllEnvs();
  });

  it('promotes a style to a prop on a factory created afterwards', () => {
    configure({ baseStyleProps: ['radius'] });

    const Box = tasty({ qa: 'Box' });
    const node = render(<Box radius="1r" />).getByTestId('Box');

    expect(node).not.toHaveAttribute('radius');
    expect(node.className).not.toBe('');
  });

  it('promotes a style on a factory created BEFORE configure()', () => {
    // The core regression for the lazy, version-invalidated propsToCheck memo:
    // an eager memo computed at factory creation would never see this.
    configure({ baseStyleProps: ['radius'] });

    const node = render(<ModuleScopeBox radius="1r" />).getByTestId(
      'ModuleScopeBox',
    );

    expect(node).not.toHaveAttribute('radius');
    expect(node.className).not.toBe('');
  });

  it('works on the exported Element, also a module-scope factory', () => {
    configure({ baseStyleProps: ['radius'] });

    const { container } = render(<Element qa="El" radius="1r" />);
    const node = container.firstElementChild!;

    expect(node).not.toHaveAttribute('radius');
    expect(node.className).not.toBe('');
  });

  it('stops harvesting after resetConfig(), so the prop reaches the DOM', () => {
    configure({ baseStyleProps: ['radius'] });

    const Box = tasty({ qa: 'Box' });
    const promoted = render(<Box radius="1r" />);
    expect(promoted.getByTestId('Box')).not.toHaveAttribute('radius');
    promoted.unmount();

    resetConfig();

    // Same factory, refreshed memo: `radius` is no longer a style prop, so React
    // passes it through to the DOM.
    expect(render(<Box radius="1r" />).getByTestId('Box')).toHaveAttribute(
      'radius',
    );
  });

  it('unions with a factory’s own styleProps without double-applying', () => {
    configure({ baseStyleProps: ['radius'] });

    const Box = tasty({ qa: 'Box', styleProps: ['radius', 'padding'] });
    const node = render(<Box radius="1r" padding="2x" />).getByTestId('Box');

    expect(node).not.toHaveAttribute('radius');
    expect(node).not.toHaveAttribute('padding');
    expect(node.className.split(' ')).toEqual([
      ...new Set(node.className.split(' ')),
    ]);
  });

  describe('registry', () => {
    it('dedupes against BASE_STYLES and itself', () => {
      // `display` is already a base style; `radius` appears twice.
      configure({ baseStyleProps: ['display', 'radius', 'radius'] });

      expect(getBaseStyleProps()).toEqual(['radius']);
    });

    it('merges plugin and direct config entries', () => {
      configure({
        plugins: [{ name: 'p1', baseStyleProps: ['radius'] }],
        baseStyleProps: ['shadow'],
      });

      expect(getBaseStyleProps()).toEqual(['radius', 'shadow']);
    });

    it('bumps the version on reset so factory memos refresh', () => {
      const before = baseStylePropsRegistry.version;
      configure({ baseStyleProps: ['radius'] });
      const afterAdd = baseStylePropsRegistry.version;

      resetConfig();

      expect(afterAdd).toBeGreaterThan(before);
      expect(baseStylePropsRegistry.version).toBeGreaterThan(afterAdd);
      expect(getBaseStyleProps()).toEqual([]);
    });

    it('rejects invalid names in dev', () => {
      vi.stubEnv('NODE_ENV', 'development');

      configure({ baseStyleProps: ['Radius', '@media', '$token'] });

      expect(getBaseStyleProps()).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('is invalid'),
      );
    });

    it('rejects names tasty() consumes itself', () => {
      vi.stubEnv('NODE_ENV', 'development');

      configure({ baseStyleProps: ['styles', 'variant'] });

      expect(getBaseStyleProps()).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('collides with a prop'),
      );
    });
  });
});
