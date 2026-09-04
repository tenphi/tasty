import { modAttrs } from './mod-attrs';

describe('modAttrs', () => {
  it('serializes supported values and skips disabled modifiers', () => {
    expect(
      modAttrs({
        isActive: true,
        disabled: false,
        theme: 'danger',
        level: 2,
        empty: '',
        missing: null,
        absent: undefined,
      }),
    ).toEqual({
      'data-is-active': '',
      'data-theme': 'danger',
      'data-level': '2',
      'data-empty': '',
    });
  });

  it('returns null when no modifier map is provided', () => {
    expect(modAttrs(undefined)).toBeNull();
  });

  it('reuses the result for equivalent modifier maps', () => {
    const first = modAttrs({ active: true, size: 'large' });
    const second = modAttrs({ active: true, size: 'large' });

    expect(second).toBe(first);
  });

  it('recomputes attributes after a modifier map is mutated', () => {
    const mods = { size: 'small' };
    const first = modAttrs(mods);

    mods.size = 'large';
    const second = modAttrs(mods);

    expect(second).not.toBe(first);
    expect(second).toEqual({ 'data-size': 'large' });
  });

  it('warns about unsupported modifier values in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(modAttrs({ invalid: {} as never })).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      '[Tasty] Invalid mod value for "invalid". Expected boolean, string, or number, got object',
    );

    warn.mockRestore();
  });
});
