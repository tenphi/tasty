import { computeStyles } from '../compute-styles';
import { destroy } from '../injector';
import { ServerStyleCollector } from '../ssr/collector';
import { formatRules } from '../ssr/format-rules';

import { renderStyles } from './index';

describe('selector list scoping in the browser', () => {
  afterEach(() => destroy());

  for (const path of ['pipeline', 'runtime', 'ssr'] as const) {
    it.each([
      '& > .first, & > .second',
      '.first, .second',
      '& > :is(.first, .second), & > .third',
      '& > [data-value="a,b"], & > .second',
      String.raw`& > .first\,extra, & > .second`,
    ])(`scopes every part of %s through ${path}`, (key) => {
      const styles = { [key]: { order: 7 } };
      const collector = path === 'ssr' ? new ServerStyleCollector() : null;
      const result =
        path === 'pipeline'
          ? null
          : computeStyles(
              styles,
              collector ? { ssrCollector: collector } : undefined,
            );
      const sheet = document.createElement('style');
      sheet.textContent =
        path === 'pipeline'
          ? formatRules(renderStyles(styles, '.selector-list-root'), '')
          : (collector?.getCSS() ?? '');
      document.head.append(sheet);

      const root = document.createElement('div');
      root.className = result?.className ?? 'selector-list-root';
      root.innerHTML =
        '<span class="first first,extra" data-value="a,b"></span><span class="second"></span><span class="third"></span>';
      const outside = document.createElement('span');
      outside.className = 'second';
      document.body.append(root, outside);

      try {
        expect(getComputedStyle(root.children[0]).order).toBe('7');
        expect(getComputedStyle(root.children[1]).order).toBe('7');
        expect(getComputedStyle(outside).order).toBe('0');
        if (key.includes('.third')) {
          expect(getComputedStyle(root.children[2]).order).toBe('7');
        }
      } finally {
        root.remove();
        outside.remove();
        sheet.remove();
      }
    });
  }
});
