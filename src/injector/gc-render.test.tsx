import { cleanup as unmountAll, render } from '@testing-library/react';

import { computeStyles } from '../compute-styles';
import { configure, resetConfig } from '../config';
import { hydrateTastyClasses } from '../ssr/hydrate';

import { cleanup, destroy, gc, getCSSText, inject, injector } from './index';
import { HYDRATED_RULE_INDEX } from './types';
import type { RootRegistry, StyleRule } from './types';

/**
 * The render path (`computeStyles`) keeps no dispose handle, so the DOM is the
 * only record that a class is in use. These tests pin that contract down: what
 * is rendered survives, what is detached is collectible, and an explicit
 * `inject()` reference still overrides both.
 */

function Box(props: { color: string }) {
  const { className } = computeStyles({ color: props.color });
  return <div className={className} />;
}

function getRegistry(): RootRegistry {
  return injector.instance._sheetManager.getRegistry(document);
}

function styleRule(selector: string, declarations: string): StyleRule {
  return { selector, declarations } as StyleRule;
}

describe('GC of render-path styles', () => {
  afterEach(() => {
    unmountAll();
    destroy();
    resetConfig();
  });

  it('takes no reference when styles come from the render path', () => {
    render(<Box color="#red" />);

    const registry = getRegistry();

    expect(registry.rules.size).toBeGreaterThan(0);
    expect(registry.refCounts.size).toBe(0);
  });

  it('never evicts a class that is still rendered', () => {
    const { container } = render(<Box color="#red" />);
    const className = container.firstElementChild!.className;

    expect(gc({ force: true })).toBe(0);
    expect(getCSSText()).toContain(className);
  });

  it('evicts a class once it leaves the DOM', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = container.firstElementChild!.className;

    rerender(<div />);

    expect(gc({ force: true })).toBe(1);

    const registry = getRegistry();
    expect(registry.rules.has(className)).toBe(false);
    expect(registry.usageMap.has(className)).toBe(false);
    expect(getCSSText()).not.toContain(className);
  });

  it('drops the cache key so the class can be re-injected later', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = container.firstElementChild!.className;

    rerender(<div />);
    gc({ force: true });

    const second = render(<Box color="#red" />);

    expect(second.container.firstElementChild!.className).toBe(className);
    expect(getCSSText()).toContain(className);
  });

  it('keeps the most recently used classes within capacity', () => {
    configure({ gc: { touchInterval: 1_000_000, capacity: 1 } });

    const { rerender } = render(
      <>
        <Box color="#red" />
        <Box color="#blue" />
        <Box color="#green" />
      </>,
    );

    const registry = getRegistry();
    const injected = registry.rules.size;
    expect(injected).toBe(3);

    rerender(<div />);

    expect(gc()).toBe(injected - 1);
    expect(registry.rules.size).toBe(1);
  });

  it('cleanup() removes detached render-path styles', () => {
    const { container, rerender } = render(<Box color="#red" />);
    const className = container.firstElementChild!.className;

    rerender(<div />);
    cleanup();

    expect(getCSSText()).not.toContain(className);
  });

  it('keeps styles an inject() caller still holds', () => {
    const { className } = inject([styleRule('.pinned.pinned', 'color: red')]);

    expect(gc({ force: true })).toBe(0);
    expect(getRegistry().rules.has(className)).toBe(true);
  });

  it('collects an untracked inject() once nothing renders it', () => {
    const { className } = inject([styleRule('.loose.loose', 'color: red')], {
      track: false,
    });

    expect(getRegistry().refCounts.has(className)).toBe(false);
    expect(gc({ force: true })).toBe(1);
    expect(getRegistry().rules.has(className)).toBe(false);
  });

  it('never evicts server-rendered classes it does not own', () => {
    hydrateTastyClasses(['t-hydrated']);

    const registry = getRegistry();
    expect(registry.rules.get('t-hydrated')?.sheetIndex).toBe(
      HYDRATED_RULE_INDEX,
    );

    expect(gc({ force: true })).toBe(0);
    expect(registry.rules.has('t-hydrated')).toBe(true);
  });

  it('reports evictable classes through metrics', () => {
    configure({ devMode: true });

    const { rerender } = render(
      <>
        <Box color="#red" />
        <Box color="#blue" />
      </>,
    );

    expect(injector.instance.getMetrics()?.unusedHits).toBe(0);

    rerender(<Box color="#red" />);

    expect(injector.instance.getMetrics()?.unusedHits).toBe(1);
  });
});
