/**
 * The agent harness in `harness/`: what `tasty:styles` renders and flags, the
 * docs index, and the manifest. The tool's logic runs against the source, so
 * these tests need no build; the CLI test runs only once `dist/` exists, as it
 * does in CI after `pnpm build`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  configChanged,
  configSummary,
  findIssues,
  formatCss,
  parseCss,
  renderCss,
} from '../harness/dev.harnesspm/scripts/render.mjs';

import type * as Core from './core';

const ROOT = join(__dirname, '..');
const HARNESS = join(ROOT, 'harness');
const DOCS = join(ROOT, 'docs');

/** A fresh copy of Tasty for every test, so configure() starts unlocked. */
async function freshTasty(): Promise<typeof Core> {
  vi.resetModules();
  const t = await import('./core');
  t.resetConfig();
  return t;
}

describe('tasty:styles rendering', () => {
  it('renders through computeStyles, with the configured units and recipes', async () => {
    const t = await freshTasty();
    t.configure({
      units: { x: 'var(--gap)' },
      recipes: { card: { radius: '1cr', fill: '#surface' } },
    });

    const { classNames, css } = renderCss(t, {
      recipe: 'card',
      padding: '2x',
    });

    expect(classNames.length).toBeGreaterThan(0);
    expect(css).toContain('padding: calc(2 * var(--gap))');
    expect(css).toContain('background-color: var(--surface-color)');
    // A bare renderStyles() would print the recipe as a declaration.
    expect(css).not.toContain('recipe:');
  });

  it('shows state keys as selectors and at-rules', async () => {
    const t = await freshTasty();
    t.configure({ states: { '@mobile': '@media(w < 768px)' } });

    const { css } = renderCss(t, {
      color: { '': '#text', hovered: '#accent', '@mobile': '#red' },
    });

    expect(css).toContain('[data-hovered]');
    expect(css).toContain('@media (width < 768px)');
  });
});

describe('tasty:styles config summary', () => {
  it('changes when a setup configures Tasty', async () => {
    const t = await freshTasty();
    const before = configSummary(t);

    t.configure({
      units: { x: 'var(--gap)' },
      states: { '@dark': '@root(schema=dark)' },
      tokens: { '#surface': '#fff' },
    });
    const after = configSummary(t);

    expect(configChanged(before, after)).toBe(true);
    expect(after.units.x).toBe('var(--gap)');
    expect(after.states).toContain('@dark');
    // Pins the global key the tool reads the config tokens from.
    expect(after.tokens).toContain('#surface');
  });

  it('stays the same without configure()', async () => {
    const t = await freshTasty();
    expect(configChanged(configSummary(t), configSummary(t))).toBe(false);
  });
});

describe('tasty:styles issues', () => {
  it('flags a recipe when no recipes are configured', async () => {
    const t = await freshTasty();
    const styles = { recipe: 'card / disabled', Title: { recipe: 'reset' } };
    const { css } = renderCss(t, styles);

    const issues = findIssues(t, styles, css);

    expect(issues).toHaveLength(3);
    expect(issues[0]).toContain('Recipe "card" was dropped');
    expect(issues.join('\n')).toContain('"reset"');
  });

  it('leaves unknown recipes to Tasty once some are configured', async () => {
    const t = await freshTasty();
    t.configure({ recipes: { card: { radius: '1cr' } } });
    const styles = { recipe: 'card pill' };

    expect(findIssues(t, styles, renderCss(t, styles).css)).toEqual([]);
  });

  it('flags a number whose unit is neither a Tasty nor a CSS unit', async () => {
    const t = await freshTasty();
    const styles = { width: '10foo', padding: '2x', margin: '1.5rem' };

    const issues = findIssues(t, styles, renderCss(t, styles).css);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('"10foo" in width');
  });

  it('checks preset names only when the config defines presets', async () => {
    const t = await freshTasty();
    const styles = {
      preset: { '': 't3', hovered: 'h9 strong' },
      Label: { preset: 'h3' },
    };
    expect(findIssues(t, styles, renderCss(t, styles).css)).toEqual([]);

    const configured = await freshTasty();
    configured.configure({
      presets: {
        h3: { fontSize: '20px', lineHeight: '28px' },
        t3: { fontSize: '14px', lineHeight: '20px' },
      },
    });
    const issues = findIssues(
      configured,
      styles,
      renderCss(configured, styles).css,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Preset "h9"');
  });
});

describe('tasty:styles CSS formatting', () => {
  it('prints one declaration per line and nests at-rules', () => {
    const css =
      '@media (width < 768px) { .a.a { padding: var(--gap); color: red; } }\n.a.a { background: url("x;{y}.png"); }';

    expect(formatCss(css)).toBe(
      [
        '@media (width < 768px) {',
        '  .a.a {',
        '    padding: var(--gap);',
        '    color: red;',
        '  }',
        '}',
        '',
        '.a.a {',
        '  background: url("x;{y}.png");',
        '}',
      ].join('\n'),
    );
  });

  it('keeps keyframe steps without a trailing semicolon', () => {
    const [keyframes] = parseCss(
      '@keyframes fade { 0% { opacity: 0 } 100% { opacity: 1 } }',
    );

    expect(keyframes).toMatchObject({
      prelude: '@keyframes fade',
      children: [
        { prelude: '0%', children: [{ property: 'opacity', value: '0' }] },
        { prelude: '100%', children: [{ property: 'opacity', value: '1' }] },
      ],
    });
  });
});

describe('harness files', () => {
  const plugin = JSON.parse(
    readFileSync(join(HARNESS, 'plugin.json'), 'utf8'),
  ) as {
    name: string;
    extensions: {
      'dev.harnesspm': { scripts: Record<string, { file: string }> };
    };
  };

  it('points every script at a file', () => {
    for (const script of Object.values(
      plugin.extensions['dev.harnesspm'].scripts,
    )) {
      expect(existsSync(join(HARNESS, script.file))).toBe(true);
    }
  });

  it('keeps the always-on rule short, since every consumer pays for it', () => {
    const rule = readFileSync(
      join(HARNESS, 'dev.harnesspm/rules/usage.md'),
      'utf8',
    );
    expect(Buffer.byteLength(rule)).toBeLessThanOrEqual(640);
  });

  it('links only to docs pages that exist', () => {
    const index = readFileSync(join(DOCS, 'llms.txt'), 'utf8');
    const links = [...index.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(existsSync(join(DOCS, link)), link).toBe(true);
    }
  });

  it('lists every consumer page, so a new page is not left out by accident', () => {
    // Internals and positioning pages that agents in an app do not need.
    const notListed = new Set([
      'README.md',
      'adoption.md',
      'comparison.md',
      'injector.md',
      'pipeline.md',
      'runtime-benchmarks.md',
    ]);
    const index = readFileSync(join(DOCS, 'llms.txt'), 'utf8');
    const pages = readdirSync(DOCS).filter((name) => name.endsWith('.md'));

    for (const page of pages) {
      if (notListed.has(page)) {
        expect(index, page).not.toContain(`(${page})`);
      } else {
        expect(index, page).toContain(`(${page})`);
      }
    }
  });
});

const BUILD = join(ROOT, 'dist/core/index.js');

describe.runIf(existsSync(BUILD))('tasty:styles CLI (needs pnpm build)', () => {
  const script = join(HARNESS, 'dev.harnesspm/scripts/styles.mjs');
  const fixtures = join(__dirname, 'harness-fixtures');
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [script, ...args], {
      cwd: fixtures,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HARNESSPM_PROJECT_DIR: fixtures },
    });

  it('loads a setup module that calls configure() on import', () => {
    const out = run(
      '{"padding":{"":"2x","@mobile":"1x"}}',
      '--setup',
      './setup.mjs',
    );

    expect(out).toContain('setup ./setup.mjs');
    expect(out).toContain('padding: calc(2 * var(--gap));');
    expect(out).toContain('@media (width < 768px) {');
    expect(out).not.toContain('Warnings:');
  });

  it('passes a default-exported config to configure()', () => {
    const result = JSON.parse(
      run('{"recipe":"pill"}', '--setup', './tasty-zero.config.mjs', '--json'),
    );

    expect(result.setup).toEqual([
      { module: './tasty-zero.config.mjs', configured: 'default export' },
    ]);
    expect(result.css).toContain('border-radius: 9999rem');
    expect(result.warnings).toEqual([]);
  });

  it('warns without a setup and names the files that configure Tasty', () => {
    const out = run('{"padding":"2x"}');

    expect(out).toContain('padding: 16px;');
    expect(out).toContain('No --setup');
    expect(out).toContain('setup.mjs');
  });

  it('refuses the lint-only tasty.config file', () => {
    expect(() =>
      run('{"padding":"2x"}', '--setup', './tasty.config.ts'),
    ).toThrow(/only lists names/);
  });
});
