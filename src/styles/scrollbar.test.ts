import type { CSSMap } from '../utils/styles';
import { renderStyles } from '../pipeline/index';

import { scrollbarStyle } from './scrollbar';

function findBySelector(
  result: CSSMap[],
  selector: string,
): CSSMap | undefined {
  return result.find((r) => r.$ === selector);
}

function findRoot(result: CSSMap[]): CSSMap | undefined {
  return result.find((r) => !r.$);
}

function hasWebkitRules(result: CSSMap[]): boolean {
  return result.some(
    (r) => typeof r.$ === 'string' && r.$.startsWith('::-webkit-scrollbar'),
  );
}

describe('scrollbarStyle', () => {
  it('returns undefined when scrollbar is not defined', () => {
    expect(scrollbarStyle({})).toBeUndefined();
  });

  it('handles boolean true value as thin (standard only)', () => {
    const result = scrollbarStyle({ scrollbar: true })!;
    const root = findRoot(result)!;

    expect(root['scrollbar-width']).toBe('thin');
    expect(root['scrollbar-color']).toBeDefined();
    expect(hasWebkitRules(result)).toBe(false);
  });

  it('handles number value as custom size (webkit enhancement)', () => {
    const result = scrollbarStyle({ scrollbar: 10 })!;
    const root = findRoot(result)!;
    const sb = findBySelector(result, '::-webkit-scrollbar')!;

    expect(root['scrollbar-width']).toBe('thin');
    expect(sb['width']).toBe('10');
    expect(sb['height']).toBe('10');
  });

  it('handles "none" modifier', () => {
    const result = scrollbarStyle({ scrollbar: 'none' })!;
    const root = findRoot(result)!;
    const sb = findBySelector(result, '::-webkit-scrollbar')!;

    expect(root['scrollbar-width']).toBe('none');
    expect(root['scrollbar-color']).toBeUndefined();
    expect(sb['width']).toBe('0px');
  });

  it('handles "auto" modifier (standard only)', () => {
    const result = scrollbarStyle({ scrollbar: 'auto' })!;
    const root = findRoot(result)!;

    expect(root['scrollbar-width']).toBe('auto');
    expect(root['scrollbar-color']).toBeDefined();
    expect(hasWebkitRules(result)).toBe(false);
  });

  it('handles "styled" modifier with proper defaults', () => {
    const result = scrollbarStyle({ scrollbar: 'styled' })!;
    const root = findRoot(result)!;
    const sb = findBySelector(result, '::-webkit-scrollbar')!;
    const thumb = findBySelector(result, '::-webkit-scrollbar-thumb')!;

    expect(root['scrollbar-width']).toBe('thin');
    expect(sb['width']).toBe('8px');
    expect(thumb['border-radius']).toBe('8px');
    expect(thumb['min-height']).toBe('24px');
  });

  it('handles custom colors (standard only)', () => {
    const result = scrollbarStyle({ scrollbar: '#red #blue #green' })!;
    const root = findRoot(result)!;

    expect(root['scrollbar-color']).toBe('var(--red-color) var(--blue-color)');
    expect(hasWebkitRules(result)).toBe(false);
  });

  it('handles "always" modifier with overflow (standard only)', () => {
    const result = scrollbarStyle({
      scrollbar: 'always',
    })!;
    const root = findRoot(result)!;

    expect(root['overflow']).toBe('auto');
    expect(root['scrollbar-gutter']).toBe('stable');
    expect(hasWebkitRules(result)).toBe(false);
  });

  it('handles "stable" modifier', () => {
    const result = scrollbarStyle({ scrollbar: 'thin stable' })!;
    const root = findRoot(result)!;

    expect(root['scrollbar-width']).toBe('thin');
    expect(root['scrollbar-gutter']).toBe('stable');
    expect(hasWebkitRules(result)).toBe(false);
  });

  it('handles "both-edges" modifier', () => {
    const result = scrollbarStyle({ scrollbar: 'thin both-edges' })!;
    const root = findRoot(result)!;

    expect(root['scrollbar-gutter']).toBe('stable both-edges');
    expect(hasWebkitRules(result)).toBe(false);
  });

  it('combines modifiers correctly', () => {
    const result = scrollbarStyle({ scrollbar: 'thin styled #red' })!;
    const root = findRoot(result)!;
    const thumb = findBySelector(result, '::-webkit-scrollbar-thumb')!;

    expect(root['scrollbar-width']).toBe('thin');
    expect(root['scrollbar-color']).toBe(
      'var(--red-color) var(--scrollbar-track-color, transparent)',
    );
    expect(thumb['background']).toBe('var(--red-color)');
  });

  it('applies custom colors to styled scrollbars', () => {
    const result = scrollbarStyle({
      scrollbar: 'styled #purple #dark #light-grey',
    })!;
    const root = findRoot(result)!;
    const sb = findBySelector(result, '::-webkit-scrollbar')!;
    const track = findBySelector(result, '::-webkit-scrollbar-track')!;
    const thumb = findBySelector(result, '::-webkit-scrollbar-thumb')!;
    const corner = findBySelector(result, '::-webkit-scrollbar-corner')!;

    expect(root['scrollbar-color']).toBe(
      'var(--purple-color) var(--dark-color)',
    );
    expect(sb['background']).toBe('var(--dark-color)');
    expect(track['background']).toBe('var(--dark-color)');
    expect(thumb['background']).toBe('var(--purple-color)');
    expect(corner['background']).toBe('var(--light-grey-color)');
  });

  it('applies partial custom colors with defaults', () => {
    const result = scrollbarStyle({ scrollbar: 'styled #danger' })!;
    const root = findRoot(result)!;
    const track = findBySelector(result, '::-webkit-scrollbar-track')!;
    const thumb = findBySelector(result, '::-webkit-scrollbar-thumb')!;

    expect(root['scrollbar-color']).toBe(
      'var(--danger-color) var(--scrollbar-track-color, transparent)',
    );
    expect(thumb['background']).toBe('var(--danger-color)');
    expect(track['background']).toBe(
      'var(--scrollbar-track-color, transparent)',
    );
  });

  it('ensures all CSS properties are kebab-cased', () => {
    const result = scrollbarStyle({ scrollbar: 'styled thin' })!;
    const thumb = findBySelector(result, '::-webkit-scrollbar-thumb')!;

    expect(thumb['border-radius']).toBe('8px');
    expect(thumb['min-height']).toBe('24px');
  });

  it('returns an array of CSSMap entries with $ for pseudo-elements', () => {
    const result = scrollbarStyle({ scrollbar: 'styled #red #blue' })!;

    expect(Array.isArray(result)).toBe(true);

    const root = findRoot(result)!;
    expect(root.$).toBeUndefined();

    const pseudoEntries = result.filter((r) => r.$);
    expect(pseudoEntries.length).toBeGreaterThan(0);

    for (const entry of pseudoEntries) {
      expect(typeof entry.$).toBe('string');
      expect((entry.$ as string).startsWith('::-webkit-scrollbar')).toBe(true);
      for (const [key, val] of Object.entries(entry)) {
        if (key === '$') continue;
        expect(typeof val).toBe('string');
      }
    }
  });

  it('emits webkit for custom size but not for colors alone', () => {
    const colorsOnly = scrollbarStyle({ scrollbar: '#red #blue' })!;
    expect(hasWebkitRules(colorsOnly)).toBe(false);
    expect(colorsOnly).toHaveLength(1);

    const withSize = scrollbarStyle({ scrollbar: '12px #red #blue' })!;
    expect(hasWebkitRules(withSize)).toBe(true);
    const sb = findBySelector(withSize, '::-webkit-scrollbar')!;
    expect(sb['width']).toBe('12px');
  });
});

describe('scrollbar pipeline integration', () => {
  it('should produce valid CSS without [object Object]', () => {
    const styles = {
      scrollbar: 'styled 1x #purple.40 #dark.04',
    };

    const result = renderStyles(styles, '.demo');

    expect(result.length).toBeGreaterThan(0);

    for (const rule of result) {
      expect(rule.declarations).not.toContain('[object Object]');
    }

    const scrollbarRule = result.find((r) =>
      r.selector.toString().includes('::-webkit-scrollbar-thumb'),
    );
    expect(scrollbarRule).toBeDefined();
    expect(scrollbarRule!.declarations).toContain('background');
  });

  it('should generate correct selectors for pseudo-elements', () => {
    const styles = {
      scrollbar: 'styled #red #blue',
    };

    const result = renderStyles(styles, '.test');

    const selectors = result.map((r) => r.selector);

    expect(selectors).toContain('.test');
    expect(
      selectors.some((s) => s.toString().includes('::-webkit-scrollbar')),
    ).toBe(true);
  });

  it('should handle scrollbar with state conditions', () => {
    const styles = {
      scrollbar: {
        '': 'styled',
        hovered: 'styled #red',
      },
    };

    const result = renderStyles(styles, '.test');

    expect(result.length).toBeGreaterThan(0);

    for (const rule of result) {
      expect(rule.declarations).not.toContain('[object Object]');
    }
  });

  it('should produce standard-only CSS for basic scrollbar', () => {
    const result = renderStyles({ scrollbar: 'thin #red #blue' }, '.basic');

    expect(result.length).toBeGreaterThan(0);

    const hasWebkit = result.some((r) =>
      r.selector.toString().includes('::-webkit-scrollbar'),
    );
    expect(hasWebkit).toBe(false);

    const rootRule = result.find((r) => r.selector === '.basic');
    expect(rootRule).toBeDefined();
    expect(rootRule!.declarations).toContain('scrollbar-width');
    expect(rootRule!.declarations).toContain('scrollbar-color');
  });
});
