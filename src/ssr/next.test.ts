import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configure, resetConfig } from '../config';
import {
  useCounterStyle,
  useFontFace,
  useFunction,
  useGlobalStyles,
  useKeyframes,
  useProperty,
  useRawCSS,
} from '../hooks';
import { tasty } from '../tasty';

const insertedHTML: (() => ReactNode)[] = [];

vi.mock('next/navigation', () => ({
  useServerInsertedHTML(callback: () => ReactNode) {
    insertedHTML.push(callback);
  },
}));

import { TastyRegistry } from './next';

beforeEach(() => {
  resetConfig();
  insertedHTML.length = 0;
});

afterEach(() => {
  resetConfig();
});

function flushInsertedHTML(): string {
  return insertedHTML
    .map((callback) => renderToStaticMarkup(callback()))
    .join('');
}

function RouteArtifacts() {
  useProperty('$route-angle', {
    syntax: '<angle>',
    inherits: false,
    initialValue: '0deg',
  });
  useFontFace('Route Face', { src: 'local("Courier")' });
  useCounterStyle(
    { system: 'cyclic', symbols: '"route"' },
    { name: 'route-counter' },
  );
  useFunction('$$route-double', {
    args: ['$value'],
    result: '($value * 2)',
  });
  useRawCSS('.route-raw { --route-raw: 1; }');
  useGlobalStyles('.route-global', { color: 'blue' });
  useKeyframes(
    { from: { opacity: 0 }, to: { opacity: 1 } },
    { name: 'route-fade' },
  );
  return null;
}

describe('TastyRegistry shared stylesheet', () => {
  it('links shared globals once and streams only route-specific CSS', () => {
    configure({
      nonce: 'nonce-value',
      tokens: { '$shared-gap': '12px' },
      globalStyles: { body: { margin: '0' } },
    });
    const Box = tasty({ styles: { display: 'block', padding: '2px' } });

    renderToString(
      createElement(
        TastyRegistry,
        { sharedStylesheet: '/_tasty/tasty.shared.abc.css' },
        createElement(
          Fragment,
          null,
          createElement(RouteArtifacts),
          createElement(Box),
        ),
      ),
    );

    const first = flushInsertedHTML();
    expect(first).toContain('rel="stylesheet"');
    expect(first).toContain('href="/_tasty/tasty.shared.abc.css"');
    expect(first).toContain('data-tasty-ssr=""');
    expect(first).toContain('nonce="nonce-value"');
    expect(first).toContain('display: block');
    expect(first).not.toContain('--shared-gap: 12px');
    expect(first).not.toContain('body');
    expect(first).toContain('@property --route-angle');
    expect(first).toContain('font-family: "Route Face"');
    expect(first).toContain('@counter-style route-counter');
    expect(first).toContain('@function --route-double');
    expect(first).toContain('.route-raw');
    expect(first).toContain('.route-global');
    expect(first).toContain('@keyframes route-fade');
    expect(first).toContain('window.__TASTY__');

    expect(flushInsertedHTML()).not.toContain('rel="stylesheet"');
  });

  it('keeps configured globals inline when shared output is disabled', () => {
    configure({
      tokens: { '$inline-gap': '7px' },
      globalStyles: { body: { margin: '0' } },
    });
    const Box = tasty({ styles: { display: 'block' } });

    renderToString(
      createElement(
        TastyRegistry,
        { sharedStylesheet: false },
        createElement(Box),
      ),
    );

    const output = flushInsertedHTML();
    expect(output).not.toContain('rel="stylesheet"');
    expect(output).toContain('--inline-gap: 7px');
    expect(output).toContain('body');
    expect(output).toContain('display: block');
  });
});
