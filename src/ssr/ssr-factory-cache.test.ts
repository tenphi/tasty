/**
 * The factory-level `classNameCache` in tasty.tsx is deliberately skipped on
 * the server: `computeStyles()` is what feeds the per-request SSR collector
 * and what produces the RSC inline `<style>`, so short-circuiting it would
 * return a className for CSS that was never emitted for that request.
 *
 * That is also why the chunk cache-key memo exists — on the server every
 * render re-keys the same factory styles object, with no factory cache in
 * front of it. These tests pin both halves down: CSS must be emitted per
 * request, and the memo must not be what breaks it.
 */

import { tasty } from '../tasty';

import { ServerStyleCollector } from './collector';
import { registerSSRCollectorGetter } from './ssr-collector-ref';

/**
 * Invoke a tasty component's render body once, standing in for a server
 * render. `react-dom/server` is not a dependency of the node test project.
 */
function renderOnce(Component: unknown, props: object): { className?: string } {
  const render = (Component as { render: (p: object, r: null) => unknown })
    .render;
  const element = render(props, null) as { props?: { className?: string } };
  return { className: element?.props?.className };
}

function renderRequest(
  Component: unknown,
  props: object = {},
): { className?: string; css: string } {
  const collector = new ServerStyleCollector();
  registerSSRCollectorGetter(() => collector);
  try {
    const { className } = renderOnce(Component, props);
    return { className, css: collector.getCSS() };
  } finally {
    registerSSRCollectorGetter(null as never);
  }
}

describe('SSR: repeated requests for one factory', () => {
  it('emits CSS on every request, not just the first', () => {
    const Card = tasty({
      as: 'div',
      styles: { display: 'flex', padding: '2x' },
    });

    const requests = [
      renderRequest(Card),
      renderRequest(Card),
      renderRequest(Card),
    ];

    for (const request of requests) {
      expect(request.className).toBeTruthy();
      expect(request.css).toMatch(/display:\s*flex/);
    }

    // Same styles must resolve to the same class names across requests, so
    // hydration matches whichever request served the document.
    expect(requests[1].className).toBe(requests[0].className);
    expect(requests[2].className).toBe(requests[0].className);
  });

  // Instance styles make `mergeStyles` return a fresh object per render, so
  // these renders never opt into the memo. They must still emit per request.
  it('emits CSS per request when instance styles are passed', () => {
    const Card = tasty({ as: 'div', styles: { display: 'flex' } });

    const first = renderRequest(Card, { styles: { color: '#text' } });
    const second = renderRequest(Card, { styles: { color: '#text' } });

    expect(first.css).toMatch(/display:\s*flex/);
    expect(first.css).toMatch(/color:/);
    expect(second.css).toMatch(/display:\s*flex/);
    expect(second.css).toMatch(/color:/);
    expect(second.className).toBe(first.className);
  });

  // A render that opts in must not poison a later render of the same factory
  // that overrides styles, and vice versa.
  it('keeps memoized and non-memoized renders of one factory independent', () => {
    const Card = tasty({ as: 'div', styles: { display: 'flex' } });

    const plain = renderRequest(Card);
    const overridden = renderRequest(Card, { styles: { display: 'grid' } });
    const plainAgain = renderRequest(Card);

    expect(plain.css).toMatch(/display:\s*flex/);
    expect(overridden.css).toMatch(/display:\s*grid/);
    expect(plainAgain.css).toMatch(/display:\s*flex/);

    expect(plainAgain.className).toBe(plain.className);
    expect(overridden.className).not.toBe(plain.className);
  });

  it('emits CSS per request for each variant of one factory', () => {
    const Button = tasty({
      as: 'button',
      styles: { display: 'flex' },
      variants: {
        default: { fill: '#surface' },
        danger: { fill: '#danger' },
      },
    } as never);

    const first = renderRequest(Button);
    const second = renderRequest(Button);

    expect(first.css).toMatch(/display:\s*flex/);
    expect(second.css).toMatch(/display:\s*flex/);
  });
});
