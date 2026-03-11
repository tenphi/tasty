import { renderStyles } from '../pipeline/index';

import { scrollbarStyle } from './scrollbar';

describe('scrollbarStyle', () => {
  it('returns undefined when scrollbar is not defined', () => {
    expect(scrollbarStyle({})).toBeUndefined();
  });

  it('handles boolean true as thin', () => {
    const result = scrollbarStyle({ scrollbar: true })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-color']).toBeDefined();
  });

  it('handles "none" modifier', () => {
    const result = scrollbarStyle({ scrollbar: 'none' })!;

    expect(result['scrollbar-width']).toBe('none');
    expect(result['scrollbar-color']).toBeUndefined();
  });

  it('handles "thin" width value', () => {
    const result = scrollbarStyle({ scrollbar: 'thin' })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-color']).toBeDefined();
  });

  it('handles "auto" width value', () => {
    const result = scrollbarStyle({ scrollbar: 'auto' })!;

    expect(result['scrollbar-width']).toBe('auto');
    expect(result['scrollbar-color']).toBeDefined();
  });

  it('handles "auto" with custom colors', () => {
    const result = scrollbarStyle({ scrollbar: 'auto #red #blue' })!;

    expect(result['scrollbar-width']).toBe('auto');
    expect(result['scrollbar-color']).toBe(
      'var(--red-color) var(--blue-color)',
    );
  });

  it('returns undefined for empty string', () => {
    const result = scrollbarStyle({ scrollbar: '' });

    expect(result).toBeUndefined();
  });

  it('handles custom thumb and track colors', () => {
    const result = scrollbarStyle({ scrollbar: '#red #blue' })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-color']).toBe(
      'var(--red-color) var(--blue-color)',
    );
  });

  it('handles thin with custom colors', () => {
    const result = scrollbarStyle({ scrollbar: 'thin #purple #dark' })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-color']).toBe(
      'var(--purple-color) var(--dark-color)',
    );
  });

  it('uses default colors when none specified', () => {
    const result = scrollbarStyle({ scrollbar: 'thin' })!;

    expect(result['scrollbar-color']).toBe(
      'var(--scrollbar-thumb-color) var(--scrollbar-track-color, transparent)',
    );
  });

  it('uses default track color when only thumb is specified', () => {
    const result = scrollbarStyle({ scrollbar: '#danger' })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-color']).toBe(
      'var(--danger-color) var(--scrollbar-track-color, transparent)',
    );
  });

  it('handles "stable" modifier', () => {
    const result = scrollbarStyle({ scrollbar: 'thin stable' })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-gutter']).toBe('stable');
  });

  it('handles "both-edges" modifier', () => {
    const result = scrollbarStyle({ scrollbar: 'thin both-edges' })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-gutter']).toBe('stable both-edges');
  });

  it('handles "always" modifier', () => {
    const result = scrollbarStyle({ scrollbar: 'always' })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['overflow']).toBe('scroll');
    expect(result['scrollbar-gutter']).toBe('stable');
  });

  it('handles "always" with overflow="auto"', () => {
    const result = scrollbarStyle({
      scrollbar: 'always',
      overflow: 'auto',
    })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['overflow']).toBe('auto');
    expect(result['scrollbar-gutter']).toBe('stable');
  });

  it('skips scrollbar-gutter when "always" is used with non-scrollable overflow', () => {
    const result = scrollbarStyle({
      scrollbar: 'always',
      overflow: 'hidden',
    })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['overflow']).toBe('hidden');
    expect(result['scrollbar-gutter']).toBeUndefined();
  });

  it('handles "always" with colors', () => {
    const result = scrollbarStyle({
      scrollbar: 'always #primary #white',
    })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['overflow']).toBe('scroll');
    expect(result['scrollbar-gutter']).toBe('stable');
    expect(result['scrollbar-color']).toBe(
      'var(--primary-color) var(--white-color)',
    );
  });

  it('combines thin + stable + colors', () => {
    const result = scrollbarStyle({
      scrollbar: 'thin stable #red #blue',
    })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-gutter']).toBe('stable');
    expect(result['scrollbar-color']).toBe(
      'var(--red-color) var(--blue-color)',
    );
  });

  it('combines always + both-edges', () => {
    const result = scrollbarStyle({
      scrollbar: 'always both-edges',
    })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['overflow']).toBe('scroll');
    expect(result['scrollbar-gutter']).toBe('stable both-edges');
  });

  it('ignores extra colors beyond thumb and track', () => {
    const result = scrollbarStyle({
      scrollbar: '#red #blue #green',
    })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['scrollbar-color']).toBe(
      'var(--red-color) var(--blue-color)',
    );
  });

  it('skips scrollbar-gutter when "always" is used with overflow="visible"', () => {
    const result = scrollbarStyle({
      scrollbar: 'always',
      overflow: 'visible',
    })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['overflow']).toBe('visible');
    expect(result['scrollbar-gutter']).toBeUndefined();
  });

  it('skips scrollbar-gutter when "always" is used with overflow="clip"', () => {
    const result = scrollbarStyle({
      scrollbar: 'always',
      overflow: 'clip',
    })!;

    expect(result['scrollbar-width']).toBe('thin');
    expect(result['overflow']).toBe('clip');
    expect(result['scrollbar-gutter']).toBeUndefined();
  });

  describe('conflicting modifiers', () => {
    it('"none" wins over other modifiers and warns', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const result = scrollbarStyle({ scrollbar: 'none always' })!;

      expect(result['scrollbar-width']).toBe('none');
      expect(result['overflow']).toBeUndefined();
      expect(result['scrollbar-gutter']).toBeUndefined();
      expect(result['scrollbar-color']).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tasty:'),
        expect.stringContaining('none'),
      );

      warnSpy.mockRestore();
    });

    it('"none" with colors warns about ignored tokens', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const result = scrollbarStyle({ scrollbar: 'none #red #blue' })!;

      expect(result['scrollbar-width']).toBe('none');
      expect(result['scrollbar-color']).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tasty:'),
        expect.stringContaining('none'),
      );

      warnSpy.mockRestore();
    });

    it('"none stable" warns and ignores stable', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const result = scrollbarStyle({ scrollbar: 'none stable' })!;

      expect(result['scrollbar-width']).toBe('none');
      expect(result['scrollbar-gutter']).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tasty:'),
        expect.stringContaining('none'),
      );

      warnSpy.mockRestore();
    });

    it('"none" alone does not warn', () => {
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      scrollbarStyle({ scrollbar: 'none' });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});

describe('scrollbar pipeline integration', () => {
  it('should produce valid CSS without [object Object]', () => {
    const result = renderStyles({ scrollbar: 'thin #purple #dark' }, '.demo');

    expect(result.length).toBeGreaterThan(0);

    for (const rule of result) {
      expect(rule.declarations).not.toContain('[object Object]');
    }

    const rootRule = result.find((r) => r.selector === '.demo');
    expect(rootRule).toBeDefined();
    expect(rootRule!.declarations).toContain('scrollbar-width');
    expect(rootRule!.declarations).toContain('scrollbar-color');
  });

  it('should handle scrollbar with state conditions', () => {
    const styles = {
      scrollbar: {
        '': 'thin',
        hovered: 'thin #red',
      },
    };

    const result = renderStyles(styles, '.test');

    expect(result.length).toBeGreaterThan(0);

    for (const rule of result) {
      expect(rule.declarations).not.toContain('[object Object]');
    }
  });

  it('should produce correct declarations for "none"', () => {
    const result = renderStyles({ scrollbar: 'none' }, '.hidden');

    const rootRule = result.find((r) => r.selector === '.hidden');
    expect(rootRule).toBeDefined();
    expect(rootRule!.declarations).toContain('scrollbar-width');
    expect(rootRule!.declarations).not.toContain('scrollbar-color');
  });
});
