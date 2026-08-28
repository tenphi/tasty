import { describe, expect, it } from 'vitest';

describe('Astro extracted CSS cascade', () => {
  it('applies page CSS after shared CSS', () => {
    const shared = document.createElement('style');
    shared.textContent = '.cascade-probe { color: blue; }';
    const page = document.createElement('style');
    page.textContent = '.cascade-probe { color: red; }';
    const probe = document.createElement('div');
    probe.className = 'cascade-probe';
    document.head.append(shared, page);
    document.body.append(probe);

    try {
      expect(getComputedStyle(probe).color).toBe('rgb(255, 0, 0)');
    } finally {
      shared.remove();
      page.remove();
      probe.remove();
    }
  });
});
