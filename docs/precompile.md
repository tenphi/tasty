# Precompiled Component Catalogs

Precompiled catalogs let a design system render a curated component matrix at
build time, publish the resulting CSS as a static asset, and teach Tasty which
classes and ancillary rules that asset already contains. Covered chunks then
return their existing class names without running the style pipeline or
inserting CSS. Uncovered runtime styles continue through the normal path.

This mode complements SSR and `tastyStatic()`:

- SSR collects the styles used by one request.
- `tastyStatic()` extracts explicitly static style calls through a build
  transform.
- A precompiled catalog covers the stable runtime `tasty()` styles shared by
  many applications, while retaining runtime props and overrides.

## Compile a Catalog

`@tenphi/tasty/precompile` is Node-only. Each case returns a React tree; Tasty
renders it inside the active style collector. The entry requires the optional
`react` and `react-dom` peers used by the component library.

```tsx
import { writeFile } from 'node:fs/promises';
import { precompileTastyStyles } from '@tenphi/tasty/precompile';

import { Button, Dialog } from './index.js';

const artifact = await precompileTastyStyles({
  id: '@acme/ui',
  cases: [
    {
      id: 'button/default',
      render: () => <Button>Continue</Button>,
    },
    {
      id: 'button/danger',
      render: () => <Button variant="danger">Delete</Button>,
    },
    {
      id: 'dialog/default',
      render: () => (
        <Dialog open title="Account">
          Content
        </Dialog>
      ),
    },
  ],
});

await Promise.all([
  writeFile('dist/precompiled.css', artifact.css),
  writeFile(
    'dist/precompiled.manifest.json',
    JSON.stringify(artifact.manifest),
  ),
  writeFile('dist/precompiled.report.json', JSON.stringify(artifact.report)),
]);
```

Run the catalog with the same Tasty configuration and exact Tasty version that
the design system publishes. Generation rejects page-relative CSS resources
such as `url(font.woff2)` because their meaning changes when the stylesheet is
moved. Absolute, root-relative, and data URLs are accepted.

The output is deterministic for a deterministic catalog and configuration.
The report lists the classes and ordered collector artifacts first introduced
by each case; use it to remove cases that add no coverage.

The Node-only precompile entry renders each returned tree with React DOM's
`renderToStaticMarkup()` inside the collector context. Catalog cases only need
to construct their representative component tree, including any providers the
design system normally requires.

## Publish and Register

The production default is a static stylesheet plus manifest registration:

```ts
// @acme/ui/precompiled
import { registerTastyPrecompiled } from '@tenphi/tasty/precompile/register';
import manifest from './precompiled.manifest.json';
import './precompiled.css';

registerTastyPrecompiled(manifest);
export * from './index.js';
```

Mark this module and the CSS asset as side-effectful in the UI package. Keep the
normal entry unchanged so adoption is explicit. Applications that link the CSS
from HTML or a framework layout must still execute the registration module
before rendering Tasty components.

A static asset is preferred because the browser can load and cache it in
parallel with JavaScript, it is available for first paint, and it requires no
CSP nonce. Environments that must bundle CSS text can use the fallback:

```ts
import {
  installTastyPrecompiled,
  type TastyPrecompiledManifest,
} from '@tenphi/tasty/precompile/register';
import css from './precompiled.css?raw';
import manifestJSON from './precompiled.manifest.json';

installTastyPrecompiled({
  css,
  manifest: manifestJSON as TastyPrecompiledManifest,
});
```

Call `installTastyPrecompiled()` before the first Tasty render. It appends one
`<style data-tasty-precompiled>` element, assigns `textContent` once, and does
not place the CSS in Tasty's normal rule lifecycle. An explicit nonce overrides
the nonce from `configure()`.

## What the Artifact Contains

The stylesheet contains only collector artifacts attributed to components:

- style chunks;
- component-local and standalone `@property`, `@keyframes`, `@font-face`,
  `@counter-style`, and native `@function` rules;
- properties inferred from component declarations.

It excludes `configure()` internals, `useGlobalStyles()`, and `useRawCSS()`.
Tokens, palettes, body styles, and application globals therefore remain
dynamic. The asset is a base stylesheet: dynamic globals and uncovered chunks
are appended later and can override it. It intentionally does not use
`data-tasty-ssr`, which would incorrectly tell hydration that configured
globals were already emitted.

Dependency metadata seeds browser, SSR, and RSC caches as immutable external
definitions. Tasty neither inserts duplicate ancillary rules nor adds external
classes to its garbage-collected rule set. A precompiled hit is restricted to
the document the catalog CSS lives in — a static stylesheet in the page, or the
`<style>` `installTastyPrecompiled()` appends to the global `document`. Any
other root uses the normal runtime path: a `ShadowRoot`, which cannot see
document CSS, and another `Document` such as an iframe's, which the asset was
never installed into.

Registration is global across server module graphs and idempotent for the same
manifest ID and CSS hash. Tasty rejects incompatible versions, name prefixes,
or conflicting lookup mappings in development and safely falls back to runtime
generation.

## Catalog Policy for UI Kits

Use the smallest matrix that exposes every unique styled structure:

1. Render one default case for every public styled component.
2. Render every declared visual variant.
3. Add controlled states or props only when they change Tasty input or mount a
   distinct styled subtree.
4. Use multiple items in collections and compound components only to expose
   different internal styled primitives.
5. Do not add a clear or close case when it only reuses a shared action such as
   `ItemAction` and adds no class or dependency.
6. Remove non-default cases whose report delta is empty unless a documented
   structural reason requires them.
7. Catalog every public styled component or mark it runtime-only with a reason.

Consumer changes to parser functions, units, states, handlers, recipes, chunk
assignments, `replaceTokens`, or other compilation-affecting configuration
invalidate a shared catalog. Such applications should use runtime generation or
build a project-specific artifact.

Theming does not invalidate a catalog. `configure({ tokens })` emits `:root`
custom properties, which the asset excludes, and a chunk written against
`#brand` compiles to `var(--brand-color)` whatever the current value is — so a
palette swap leaves every compiled chunk correct. `replaceTokens` is listed
above because it is the opposite: it substitutes at parse time and bakes its
value into the declaration.

Chunk lookup is exact. A shared UI-kit catalog is most useful when applications
render those components close to their cataloged styles; frequent project
overrides can leave a large static asset mostly inactive while the expensive
custom chunks still run through the pipeline. Use `tastyDebug.summary()` to
compare active runtime and precompiled classes and to inspect distinct
precompiled classes used since metrics were reset. For heavily styled
applications, prefer a project-specific catalog that renders representative
application routes and states under the application's real Tasty
configuration. Do not load both the broad shared asset and a project-specific
asset containing the same coverage.

## Performance Verification

Catalog generation, registration, and stylesheet loading are startup work and
should stay outside render samples. `pnpm bench:injection` includes a
1,000-rule precompiled lookup case alongside cold generation and an
already-present CSS control. It asserts up front that the case is actually
being served from the catalog, and fails the run otherwise: a class name is
`hashString(cacheKey)` whether it came from the catalog or from runtime
generation, so nothing in the name or the rendering distinguishes a hit from a
miss, and a case that quietly stopped hitting would report the runtime path
under the precompiled label. Use `pnpm bench`, `pnpm bench:overhead`, and
`pnpm bench:injection` in alternating runs on the same idle machine when
changing this path.

With no registered manifest, the registry does not allocate lookup maps and
`computeStyles()` performs only the disabled-path boolean check before
continuing through its existing cache and injection behavior.
