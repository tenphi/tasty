import { cleanup, render } from '@testing-library/react';

import { tastyDebug } from './debug';
import { configure, resetConfig } from './config';
import { destroy } from './injector';
import { tasty } from './tasty';

// A real styled component: its classes are held by the commit and released on
// unmount, which is what makes them collectible. A bare `computeStyles()` call
// has no commit to put its rules back, so it is pinned and never unused.
const BOXES: Record<string, ReturnType<typeof tasty>> = {};

function Box(props: { color: string }) {
  const Styled = (BOXES[props.color] ??= tasty({
    styles: { color: props.color, padding: '2x' },
  }));

  return <Styled />;
}

describe('tastyDebug', () => {
  beforeEach(() => {
    // Collection is opt-in, and only collectible classes count as unused.
    configure({ gc: {} });
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
});
