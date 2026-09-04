import { filterBaseProps } from './filter-base-props';

describe('filterBaseProps', () => {
  it('preserves the built-in base props', () => {
    const props = {
      id: 'trigger',
      role: 'button',
      as: 'a',
      element: 'root',
      css: 'color: red',
      qa: 'trigger',
      mods: { active: true },
      qaVal: 'open',
      hidden: false,
      isHidden: false,
      disabled: false,
      isDisabled: false,
      children: 'Open',
      style: { color: 'red' },
      className: 'trigger',
      href: '#content',
      target: '_blank',
      tabIndex: 0,
      unknown: 'discarded',
    };

    expect(filterBaseProps(props)).toEqual({
      id: 'trigger',
      role: 'button',
      as: 'a',
      element: 'root',
      css: 'color: red',
      qa: 'trigger',
      mods: { active: true },
      qaVal: 'open',
      hidden: false,
      isHidden: false,
      disabled: false,
      isDisabled: false,
      children: 'Open',
      style: { color: 'red' },
      className: 'trigger',
      href: '#content',
      target: '_blank',
      tabIndex: 0,
    });
    expect(props.unknown).toBe('discarded');
  });

  it('preserves ARIA, data, and explicitly allowed props', () => {
    expect(
      filterBaseProps(
        {
          'aria-label': 'Close',
          'aria-': 'bare aria prefix',
          'data-testid': 'close',
          'data-': 'bare data prefix',
          download: true,
          title: 'discarded',
        },
        { propNames: new Set(['download']) },
      ),
    ).toEqual({
      'aria-label': 'Close',
      'aria-': 'bare aria prefix',
      'data-testid': 'close',
      'data-': 'bare data prefix',
      download: true,
    });
  });

  it('preserves DOM event props only when requested', () => {
    const props = {
      onClick: () => undefined,
      onPointerDown: () => undefined,
      onA: () => undefined,
      onclick: () => undefined,
      onPress: () => undefined,
      onHoverStart: () => undefined,
      onHoverEnd: () => undefined,
      onPressStart: () => undefined,
      onPressEnd: () => undefined,
    };

    expect(filterBaseProps(props)).toEqual({});
    expect(filterBaseProps(props, { eventProps: true })).toEqual({
      onClick: props.onClick,
      onPointerDown: props.onPointerDown,
    });
    expect(filterBaseProps(props, { propNames: new Set(['onPress']) })).toEqual(
      {
        onPress: props.onPress,
      },
    );
  });

  it('ignores inherited and symbol properties', () => {
    const symbol = Symbol('data-symbol');
    const props = Object.assign(
      Object.create({ id: 'inherited', 'data-parent': 'inherited' }) as Record<
        PropertyKey,
        unknown
      >,
      { role: 'button', 'data-child': 'own', [symbol]: 'own symbol' },
    );

    expect(filterBaseProps(props)).toEqual({
      role: 'button',
      'data-child': 'own',
    });
  });
});
