import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { tasty, useRawCSS, useStyles } from '@tenphi/tasty';
import { computeStyles } from '@tenphi/tasty/core';
import {
  createServerStyleCollector,
  runWithCollector,
} from '@tenphi/tasty/ssr';

assert.equal(React.version, process.env.EXPECTED_REACT_VERSION);
await import('@tenphi/tasty/static');
await import('@tenphi/tasty/static/inject');

const Box = tasty({ styles: { display: 'flex', padding: '8px' } });

// The fallback must emit CSS on every render, even for the same component.
const first = renderToString(React.createElement(Box));
const second = renderToString(React.createElement(Box));
assert.match(first, /data-tasty-rsc/);
assert.match(first, /display:\s*flex/);
assert.equal(second, first);
assert.match(computeStyles({ display: 'grid' }).css, /display:\s*grid/);

function HookComponent() {
  const { className } = useStyles({ display: 'block' });
  return React.createElement('span', {
    className,
  });
}

assert.match(
  renderToString(React.createElement(HookComponent)),
  /<span class="t[a-z0-9]+/,
);

// Exercise real React rendering and concurrent collector-backed requests.
const results = await Promise.all(
  ['first', 'second'].map(async (id) => {
    const collector = createServerStyleCollector();
    return runWithCollector(collector, async () => {
      useRawCSS(`.${id} { color: red; }`, { id: 'request-style' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const html = renderToString(React.createElement(Box));
      const css = collector.getCSS();
      assert.doesNotMatch(html, /data-tasty-rsc/);
      assert.match(html, /class="t[a-z0-9]+/);
      assert.match(css, /display:\s*flex/);
      assert.ok(css.includes(`.${id} { color: red; }`));
      return { html, css };
    });
  }),
);
assert.equal(results[0].html, results[1].html);
assert.doesNotMatch(results[0].css, /\.second\s*\{/);
assert.doesNotMatch(results[1].css, /\.first\s*\{/);
console.log('Imports, repeated renders, hooks, and concurrent SSR passed.');
