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
  injectGlobal,
  injectRawCSS,
  property,
} from './injector';

function Box(props: { color: string }) {
  const { className } = computeStyles({ color: props.color, padding: '2x' });
  return <div className={className} />;
}

/** Every top-level rule in the sheets, however it got there. */
function sheetRuleCount(): number {
  return (getCSSText().match(/\{[^}]*\}/g) ?? []).length;
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
    });
  });
});
