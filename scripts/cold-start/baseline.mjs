/**
 * Build the control page: the same components, server-rendered.
 *
 * The control has to be the identical page with the runtime removed — same
 * markup, same class names, same CSS — or the delta between it and the runtime
 * modes measures more than Tasty. Server-rendering the very fixtures the page
 * renders gives exactly that: the class names Tasty would have produced in the
 * browser, and a stylesheet the page links like any other static asset.
 */
import { writeFile } from 'node:fs/promises';
import { brotliCompressSync } from 'node:zlib';
import { createElement } from 'react';

import { stylesFor } from './fixtures.mjs';
import { loadConfiguredRuntime } from './runtime.mjs';

const CLASS_ATTR = /\sclass="([^"]*)"/;

export async function buildBaseline({ out, components }) {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createServerStyleCollector, runWithCollector } =
    await import('../../dist/ssr/index.js');
  // Configured before the collector exists, so its `:root` custom properties
  // land in the stylesheet the control links.
  const { tasty } = await loadConfiguredRuntime();

  const collector = createServerStyleCollector();
  const classNames = runWithCollector(collector, () =>
    stylesFor(components).map((styles) => {
      const Component = tasty({ styles });
      const html = renderToStaticMarkup(createElement(Component, null, 'x'));
      const className = CLASS_ATTR.exec(html)?.[1];
      if (!className) {
        throw new Error(
          `Server render produced no class name for a styled component:\n${html}`,
        );
      }
      return className;
    }),
  );

  const css = collector.getCSS();
  await writeFile(`${out}baseline.css`, css);
  await writeFile(
    `${out}baseline.js`,
    `export default ${JSON.stringify(classNames)};\n`,
  );

  return {
    classes: classNames.length,
    cssBytes: css.length,
    brotliBytes: brotliCompressSync(Buffer.from(css)).length,
  };
}
