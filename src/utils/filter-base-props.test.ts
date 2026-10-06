import { filterBaseProps } from './filter-base-props';

describe('filterBaseProps', () => {
  it('preserves the built-in base props', () => {
    const props = {
      id: 'trigger',
      role: 'button',
      title: 'Open details',
      inert: true,
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
      title: 'Open details',
      inert: true,
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
          unknown: 'discarded',
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

  it.each([true, false])('preserves inert=%s without coercion', (inert) => {
    expect(
      filterBaseProps({ inert, title: 'Details', unknown: 'discarded' }),
    ).toEqual({
      inert,
      title: 'Details',
    });
  });

  it('drops style props unless explicitly allowed', () => {
    const props = {
      id: 'styled',
      color: { '': '#purple', active: '#red' },
      width: { '': '2x', active: '4x' },
      display: 'flex',
      padding: '2x',
      styles: { fill: '#purple' },
    };

    expect(filterBaseProps(props)).toEqual({ id: 'styled' });
    expect(filterBaseProps(props, { propNames: new Set(['color']) })).toEqual({
      id: 'styled',
      color: props.color,
    });
  });

  it('preserves DOM event props only when requested', () => {
    const props = {
      onClick: () => undefined,
      onPointerDown: () => undefined,
      onCustom: () => undefined,
      onA1: () => undefined,
      onA: () => undefined,
      onclick: () => undefined,
      onÄvent: () => undefined,
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
      onCustom: props.onCustom,
      onA1: props.onA1,
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

  it('preserves explicitly allowed numeric keys via their string names', () => {
    const props = { 0: 'own', 1: false };

    expect(filterBaseProps(props)).toEqual({});
    expect(
      filterBaseProps(props, { propNames: new Set(['0'] as const) }),
    ).toEqual({
      0: 'own',
    });
  });
});
