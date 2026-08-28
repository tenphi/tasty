/**
 * The server and the client have to agree about local `@keyframes`: the same
 * definition must get the same name and the same class on both sides, or
 * hydration finds a class the server never emitted.
 */
import { computeStyles } from '../compute-styles';
import { resetConfig } from '../config';
import { destroy } from '../injector';

import { ServerStyleCollector } from './collector';
import { registerSSRCollectorGetter } from './ssr-collector-ref';

const FADE = {
  animation: 'fade 1s',
  '@keyframes': { fade: { from: { opacity: 0 }, to: { opacity: 1 } } },
} as never;

const OTHER_FADE = {
  animation: 'fade 1s',
  '@keyframes': { fade: { from: { opacity: 1 }, to: { opacity: 0 } } },
} as never;

function serverRender(styles: never[]) {
  const collector = new ServerStyleCollector();
  registerSSRCollectorGetter(() => collector);
  try {
    const classNames = styles.map((s) => computeStyles(s).className);
    return { classNames, css: collector.getCSS() };
  } finally {
    registerSSRCollectorGetter(null as never);
  }
}

describe('SSR/client parity for local keyframes', () => {
  afterEach(() => {
    destroy();
    resetConfig();
  });

  it('gives one definition the same name and class on both sides', () => {
    const server = serverRender([FADE]);
    const client = computeStyles(FADE);

    expect(client.className).toBe(server.classNames[0]);

    const [serverName] = [...server.css.matchAll(/@keyframes\s+([\w-]+)/g)].map(
      (m) => m[1],
    );
    expect(serverName).toMatch(/^fade-[a-z0-9]+$/);
    expect(server.css).toContain(serverName);
  });

  it('keeps two different definitions apart on both sides', () => {
    const server = serverRender([FADE, OTHER_FADE]);

    // Two rules, not one deduplicated by the authored name.
    const serverNames = [...server.css.matchAll(/@keyframes\s+([\w-]+)/g)].map(
      (m) => m[1],
    );
    expect(new Set(serverNames).size).toBe(2);
    expect(server.classNames[0]).not.toBe(server.classNames[1]);

    // And the client reaches the same two classes, in the same order.
    const first = computeStyles(FADE).className;
    const second = computeStyles(OTHER_FADE).className;

    expect([first, second]).toEqual(server.classNames);
  });
});
