import { injectCSS } from './inject';

describe('injectCSS', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    // Reset module-level _ids set by re-importing with clean state.
    // Since we can't easily reset the Set, we use unique ids per test.
  });

  it('should create a <style> element on first call', () => {
    injectCSS('test-create', '.a { color: red }');

    const el = document.head.querySelector('style[data-tasty-static]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('.a { color: red }');
  });

  it('should reuse the same <style> element for multiple calls', () => {
    injectCSS('test-reuse-1', '.a { color: red }');
    injectCSS('test-reuse-2', '.b { color: blue }');

    const elements = document.head.querySelectorAll('style[data-tasty-static]');
    expect(elements.length).toBe(1);
    expect(elements[0].textContent).toContain('.a { color: red }');
    expect(elements[0].textContent).toContain('.b { color: blue }');
  });

  it('should deduplicate by id', () => {
    injectCSS('test-dedup', '.a { color: red }');
    injectCSS('test-dedup', '.a { color: red }');

    const el = document.head.querySelector('style[data-tasty-static]');
    const matches = (el?.textContent ?? '').match(/\.a \{ color: red \}/g);
    expect(matches?.length).toBe(1);
  });

  it('should allow different ids with same CSS', () => {
    injectCSS('test-diff-id-1', '.a { color: red }');
    injectCSS('test-diff-id-2', '.a { color: red }');

    const el = document.head.querySelector('style[data-tasty-static]');
    const matches = (el?.textContent ?? '').match(/\.a \{ color: red \}/g);
    expect(matches?.length).toBe(2);
  });
});
