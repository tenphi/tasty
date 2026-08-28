import { cleanup, render } from '@testing-library/react';

import { computeStyles } from './compute-styles';
import { tastyDebug } from './debug';
import { configure, resetConfig } from './config';
import {
  counterStyle,
  destroy,
  fontFace,
  func,
  getCSSText,
  hasPendingStyleWrites,
  injectGlobal,
  getRawCSSText,
  injectRawCSS,
  property,
} from './injector';

function Box(props: { color: string }) {
  const { className } = computeStyles({ color: props.color, padding: '2x' });
  return <div className={className} />;
}

/**
 * Every top-level rule the engine actually holds, read from the parsed sheets.
 *
 * Not a brace count over the CSS text: one rule can contain many blocks
 * (`@keyframes`, `@media`) and one raw block can hold many rules, so counting
 * braces answers neither question — and gets the right total only when those
 * two errors happen to cancel.
 */
function sheetRuleCount(): number {
  let total = 0;

  for (const el of document.head.querySelectorAll(
    'style[data-tasty], style[data-tasty-raw]',
  )) {
    total += (el as HTMLStyleElement).sheet?.cssRules.length ?? 0;
  }

  return total;
}

describe('tastyDebug', () => {
  beforeEach(() => {
    configure({ gc: { grace: 0 } });
  });

  afterEach(() => {
    cleanup();
    destroy();
    resetConfig();
  });

  describe('unused classes', () => {
    it('reports nothing unused while every class is in the DOM', () => {
      render(
        <>
          <Box color="#red" />
          <Box color="#blue" />
        </>,
      );

      const summary = tastyDebug.summary({ raw: true });

      expect(summary.activeClasses.length).toBeGreaterThan(0);
      expect(summary.unusedClasses).toEqual([]);
    });

    // The render path pins nothing, so only the DOM can say a class is used.
    it('reports classes that left the DOM but stayed in the registry', () => {
      const { rerender } = render(
        <>
          <Box color="#red" />
          <Box color="#blue" />
          <Box color="#green" />
        </>,
      );

      const mountedClasses = tastyDebug.summary({ raw: true }).activeClasses;

      rerender(<Box color="#red" />);

      const summary = tastyDebug.summary({ raw: true });

      expect(summary.unusedClasses.length).toBeGreaterThan(0);
      expect(summary.unusedCSSSize).toBeGreaterThan(0);
      expect(summary.unusedRuleCount).toBeGreaterThan(0);
      // Every class is accounted for as either active or unused.
      expect(summary.totalStyledClasses.sort()).toEqual(mountedClasses.sort());
      // Active and unused never overlap.
      for (const cls of summary.unusedClasses) {
        expect(summary.activeClasses).not.toContain(cls);
      }
    });

    it('exposes the same split through cache()', () => {
      const { rerender } = render(
        <>
          <Box color="#gold" />
          <Box color="#navy" />
        </>,
      );
      rerender(<Box color="#gold" />);

      const status = tastyDebug.cache({ raw: true });
      const summary = tastyDebug.summary({ raw: true });

      expect(status.classes.unused).toEqual(summary.unusedClasses);
      expect(status.classes.active).toEqual(summary.activeClasses);
    });

    it('drops the unused classes on cleanup()', () => {
      const { rerender } = render(
        <>
          <Box color="#olive" />
          <Box color="#plum" />
        </>,
      );
      rerender(<Box color="#olive" />);

      expect(tastyDebug.summary({ raw: true }).unusedClasses.length).toBe(1);

      tastyDebug.cleanup();

      const summary = tastyDebug.summary({ raw: true });
      expect(summary.unusedClasses).toEqual([]);
      expect(summary.unusedCSSSize).toBe(0);
      expect(summary.activeClasses.length).toBeGreaterThan(0);
    });

    it('returns CSS for the unused classes', () => {
      const { rerender } = render(
        <>
          <Box color="#teal" />
          <Box color="#maroon" />
        </>,
      );
      rerender(<Box color="#teal" />);

      const css = tastyDebug.css('unused', { raw: true });

      expect(css).not.toBe('');
      for (const cls of tastyDebug.summary({ raw: true }).unusedClasses) {
        expect(css).toContain(cls);
      }
    });
  });

  describe('totals', () => {
    it('counts every kind of rule the sheets hold', () => {
      configure({ gc: { grace: 0 } });

      // One of each: class rules, global, raw, @property, @font-face,
      // @counter-style, @function, @keyframes.
      const { className } = computeStyles({
        color: '#red',
        animation: 'fade 1s',
        '@keyframes': { fade: { from: { opacity: 0 }, to: { opacity: 1 } } },
      } as never);
      const el = document.createElement('div');
      el.className = className;
      document.body.append(el);

      injectGlobal([{ selector: '.debug-global', declarations: 'color: red' }]);
      injectRawCSS('.debug-raw { color: blue; }');
      property('--debug-prop', { syntax: '<length>', initialValue: '0px' });
      fontFace('DebugFace', { src: 'url(a.woff2)' });
      counterStyle('debug-counter', { system: 'cyclic', symbols: '"x"' });
      func('--debug-fn', { returns: '<length>', body: '1px' });

      const summary = tastyDebug.summary({ raw: true });

      expect(summary.totalRuleCount).toBe(sheetRuleCount());
      expect(summary.rawRuleCount).toBeGreaterThan(0);

      // Raw bytes belong in the totals too — they are in their own sheet, so
      // reading only the managed ones leaves them out.
      expect(summary.totalCSSSize).toBeGreaterThanOrEqual(
        getCSSText().length + getRawCSSText().length,
      );
      expect(tastyDebug.css('all', { raw: true })).toContain('.debug-raw');
    });

    it('reports the sheets in the order the engine applies them', () => {
      configure({ gc: { grace: 0 } });

      // Raw first: its style element lands in head before any managed sheet,
      // so a fixed managed-then-raw order would name the wrong winner for two
      // rules of equal specificity.
      injectRawCSS('.review-order { color: red; }');
      const { className } = computeStyles({ color: '#blue' });

      const all = tastyDebug.css('all', { raw: true, prettify: false });

      expect(all).toContain('.review-order');
      expect(all).toContain(className);
      expect(all.indexOf('.review-order')).toBeLessThan(all.indexOf(className));
    });

    it('splices the raw sheet in where the DOM puts it', () => {
      // One rule per sheet, so the raw element lands between two managed ones.
      configure({ gc: { grace: 0 }, maxRulesPerSheet: 1 });

      const first = computeStyles({ color: '#red' }).className;
      injectRawCSS('.review-between { color: green; }');
      const second = computeStyles({ color: '#blue' }).className;

      // The premise: raw is neither first nor last among the sheets, so an
      // order reduced to one before/after bit cannot express it.
      const kinds = Array.from(
        document.head.querySelectorAll(
          'style[data-tasty], style[data-tasty-raw]',
        ),
      ).map((el) => (el.hasAttribute('data-tasty-raw') ? 'raw' : 'managed'));

      expect(kinds.indexOf('raw')).toBeGreaterThan(0);
      expect(kinds.indexOf('raw')).toBeLessThan(kinds.length - 1);

      const all = tastyDebug.css('all', { raw: true, prettify: false });

      expect(all).toContain('.review-between');
      expect(all.indexOf(first)).toBeLessThan(all.indexOf('.review-between'));
      expect(all.indexOf('.review-between')).toBeLessThan(all.indexOf(second));
    });

    it('lands queued writes before reading', () => {
      // Every injector read API flushes; these reads reach past those APIs into
      // the registry, so without a flush of their own a batch window's contents
      // read as absent.
      configure({ gc: { grace: 0 }, batchInjection: 'always' });

      const { className } = computeStyles({ color: '#red' });
      injectGlobal([
        { selector: '.batched-global', declarations: 'color: red' },
      ]);
      injectRawCSS('.batched-raw { color: blue; }');

      expect(hasPendingStyleWrites()).toBe(true);

      const all = tastyDebug.css('all', { raw: true, prettify: false });

      expect(hasPendingStyleWrites()).toBe(false);
      expect(all).toContain(className);
      expect(all).toContain('.batched-global');
      expect(all).toContain('.batched-raw');
      expect(tastyDebug.summary({ raw: true }).globalRuleCount).toBeGreaterThan(
        0,
      );
    });

    it('keeps raw bytes whole in the total', () => {
      configure({ gc: { grace: 0 } });

      // Edge whitespace is ordinary in a multiline template literal, and
      // trimming it made the total smaller than one of its own parts.
      injectRawCSS('  .raw-space { color: red; }  ');

      const summary = tastyDebug.summary({ raw: true });

      expect(summary.rawCSSSize).toBeGreaterThan(0);
      expect(summary.totalCSSSize).toBeGreaterThanOrEqual(summary.rawCSSSize);
    });

    it('counts one raw at-rule as one rule', () => {
      configure({ gc: { grace: 0 } });

      injectRawCSS(
        '@keyframes raw-review { from { opacity: 0 } 50% { opacity: .5 } to { opacity: 1 } }',
      );

      // Three blocks, one rule. Counting braces would say three.
      expect(tastyDebug.summary({ raw: true }).rawRuleCount).toBe(1);
    });
  });
});
