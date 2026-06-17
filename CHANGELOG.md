# @tenphi/tasty

## 2.7.0

### Minor Changes

- [#220](https://github.com/tenphi/tasty/pull/220) [`e9d04ac`](https://github.com/tenphi/tasty/commit/e9d04ac1616098acd07e63a6bc26dbff382c3ec1) Thanks [@tenphi](https://github.com/tenphi)! - Add the `_` fallback floor key and equalize selector specificity with `:where()`.

  A standalone `_` key in a style value map defines a map-wide fallback floor: its
  value **always applies** and is never turned off by higher-priority states,
  which simply layer over it via the cascade. This fixes the CSS
  three-valued-logic hole where a negated `@supports(...)` / container-query
  default branch silently never applies (e.g. `scroll-state` is supported but a
  specific `scroll-state(...)` query is unknown), leaving no rule active. `_` is
  standalone-only — it cannot be combined with state logic (`_ & hovered` is
  ignored with a dev warning) — and it can coexist with the bare `''` default
  (`''` is the negated default, `_` is the always-on floor).

  To make the additive cascade predictable, every stateful selector Tasty
  generates (modifiers, pseudo-classes, `:is()`/`:not()` groups, and
  `@root`/`@parent` context) is now wrapped in `:where(...)` so it carries zero
  specificity. The only specificity anchors are the doubled component class
  (`.tXX.tXX`) and sub-element `[data-element]` attributes; overlapping rules
  resolve purely by source order, which Tasty now emits ascending by priority
  (`@starting-style` last).

  Note: state selectors drop from e.g. `0,3,0` to the class baseline `0,2,0`
  specificity. This is intentional — the doubled class remains the floor — but may
  affect overrides from external CSS that relied on state-selector specificity.

### Patch Changes

- [#220](https://github.com/tenphi/tasty/pull/220) [`3c11119`](https://github.com/tenphi/tasty/commit/3c11119ee1a93dec54a23ee3883d3f915ac68703) Thanks [@tenphi](https://github.com/tenphi)! - Auto-correct and warn on misplaced or redundant default states in style maps.

  The bare default state (`''`) is the lowest-priority state and must be the first
  key in a state map. When it is authored after other states, Tasty now moves it
  to the front and emits a `MISPLACED_DEFAULT_STATE` dev warning — previously it
  silently overrode every state above it because a `TRUE` condition is never
  negated.

  Defining both a `_` fallback floor and a bare `''` default with no other states
  is redundant: the `''` default would always be superseded by the floor. Tasty
  now keeps the `_` value, drops the `''` default, and emits a
  `REDUNDANT_DEFAULT_STATE` dev warning. When other states exist, `_` and `''`
  coexist (one is the always-on floor, the other the negated default).

## 2.6.5

### Patch Changes

- [#212](https://github.com/tenphi/tasty/pull/212) [`08efe45`](https://github.com/tenphi/tasty/commit/08efe45217ceee24cccebbe6f704da1a82968c83) Thanks [@tenphi](https://github.com/tenphi)! - Internal export optimizations to reduce exposure of internal logic.

- [#218](https://github.com/tenphi/tasty/pull/218) [`6e6de33`](https://github.com/tenphi/tasty/commit/6e6de330579571d32c9ed52c375835b95f09d0d9) Thanks [@tenphi](https://github.com/tenphi)! - Fix negation of `@supports`-guarded feature queries. When an `@supports`
  feature query guards a dependent query (e.g. `@supports(container-type:
scroll-state) & @(scroll-state(...))`), the default state is now emitted under
  a bare `@supports (not (...))` fallback instead of a meaningless bare
  `@container (not scroll-state(...))` rule. Previously the default could fail to
  apply in browsers without the feature. `@supports` negation branches now sort
  ahead of other at-rule branches during exclusive expansion; cases without an
  `@supports` guard are unaffected.

## 2.6.4

### Patch Changes

- [#203](https://github.com/tenphi/tasty/pull/203) [`14d0ec2`](https://github.com/tenphi/tasty/commit/14d0ec23c7059974aa82e60c9294657ff489fd52) Thanks [@tenphi](https://github.com/tenphi)! - Fix exponential render time for large state maps that use bracket attribute selectors.

  Style maps combining many mutually-exclusive attribute states (e.g. `[data-variant="processing"] & [data-theme="..."]` across many themes) could take several seconds to render because the engine could not tell that selectors on the same attribute with different values never overlap. Bracket attribute selectors now parse as structured modifiers, so the pipeline recognizes their mutual exclusivity and drops the unnecessary negations between non-overlapping states. The generated CSS is also more compact: each state produces a single clean compound selector, and catch-all/default entries collapse `OR` chains of negations into a single `:not(...)`.

## 2.6.3

### Patch Changes

- [#192](https://github.com/tenphi/tasty/pull/192) [`832cb65`](https://github.com/tenphi/tasty/commit/832cb6521ae475ca71436cca28393610689ed493) Thanks [@tenphi](https://github.com/tenphi)! - Fix cascade order corruption in `mergeEntriesByValue` (style rendering Stage 1b). When a style map contained two non-default states with the same value separated by a state with a different value (e.g. `{ hovered: 'red', pressed: 'blue', disabled: 'red' }`), the early merge would lift the lower-priority entry up to the maximum priority of the group, producing an `:is([data-disabled], [data-hovered])` rule that shadowed `pressed` whenever `[data-hovered]` was set — so `pressed + hovered` together resolved to red instead of blue. Same-value entries are now only merged when the merge is provably safe (no intermediate-priority state could have won in a scenario the merge would block), restoring the authored cascade while preserving the existing dark/high-contrast token deduplication optimization.

- [#194](https://github.com/tenphi/tasty/pull/194) [`dd54644`](https://github.com/tenphi/tasty/commit/dd5464440e192822a224ce6f5a28a3a077ddbd61) Thanks [@tenphi](https://github.com/tenphi)! - Infer the wrapped component's prop API when `as` is a React component in the element-factory form: `tasty({ as: NextLink, ... })` now exposes `NextLink`'s own props (e.g. `href`, `replace`, `prefetch`) on the resulting Tasty component alongside the existing Tasty-specific props. Previously the resulting component was typed as if it rendered a `div` and the wrapped component's prop API was lost. Intrinsic-tag usage (`as: 'div' | 'button' | …`) and the `tasty(Component, options)` wrap form are unchanged.

## 2.6.2

### Patch Changes

- [#190](https://github.com/tenphi/tasty/pull/190) [`e9dc06f`](https://github.com/tenphi/tasty/commit/e9dc06f34a5b456172782568053a7b8a2c67a266) Thanks [@tenphi](https://github.com/tenphi)! - Stop re-attempting (and re-warning about) `@property` injections in engines that don't support them (e.g. jsdom, happy-dom). Failed `@property` attempts are now cached per registry so each property name is tried at most once, and the `[tasty] Browser rejected CSS rule:` dev warning is suppressed for `@property` only when a one-shot per-registry feature probe confirms the engine lacks `@property` support. Warnings still fire for genuinely invalid `@property` definitions in engines that do support the feature.

## 2.6.1

### Patch Changes

- [#188](https://github.com/tenphi/tasty/pull/188) [`0328aa4`](https://github.com/tenphi/tasty/commit/0328aa45f729a32966172931d066df9b14066363) Thanks [@tenphi](https://github.com/tenphi)! - Warn and ignore top-level style keys that start with `:` (e.g. `':hover'`, `'::before'`). Tasty's DSL puts pseudo-states in value maps or under nested-selector keys with an `&` prefix (`'&:hover'`); without `&` such keys previously fell through to a generic style handler and produced malformed CSS. The dev-mode warning explains the supported alternatives and the key is now dropped. Also restores the runtime `[tasty] Browser rejected CSS rule` dev warning, which was inadvertently silenced and is useful for catching exactly this kind of bug in real browsers.

## 2.6.0

### Minor Changes

- [#182](https://github.com/tenphi/tasty/pull/182) [`a8ef75c`](https://github.com/tenphi/tasty/commit/a8ef75ca3748a69eeafe3a5ef965582b12d9df67) Thanks [@tenphi](https://github.com/tenphi)! - Support multiple space-separated modifiers in the `preset` style. Modifiers can now be combined after the slash (e.g. `preset="h2 / strong italic"`, `preset="t2 / strong tight"`) and in the modifier-only shorthand (e.g. `preset="bold italic"`). Existing single-modifier syntax is unchanged.

### Patch Changes

- [#180](https://github.com/tenphi/tasty/pull/180) [`c714552`](https://github.com/tenphi/tasty/commit/c7145529686c957ab0bdf7ca1fb2d680bab9dbae) Thanks [@tenphi](https://github.com/tenphi)! - Skip OR expansion for pure-selector ORs so same-context branches like `:hover | :focus` or `:-webkit-autofill | :autofill` collapse cleanly into `:is(...)` instead of producing dead `:not()` chains. Also warn (dev only) when a state key references unmatchable `:-internal-*` pseudo-classes.

## 2.5.0

### Minor Changes

- [#178](https://github.com/tenphi/tasty/pull/178) [`81a591b`](https://github.com/tenphi/tasty/commit/81a591b7aaf4ceca9c8d2ed03b10c371d1c2e936) Thanks [@tenphi](https://github.com/tenphi)! - Revert the dispatch behaviour introduced in 2.4.0. `tasty(Component, options)`
  again unconditionally uses the prop-forwarding wrap path; the brand-based
  discriminator (`brandTastyComponent` / `isTastyComponent`) and the
  `tasty('div', options)` shorthand are removed.

  To apply styles to a third-party component (Next.js `Link`, `react-router`
  `Link`, Radix primitives, MUI, …) or to a string DOM tag via `className`, use
  the options-only form with `as`:

  ```ts
  const Link = tasty({ as: NextLink, styles: { … } });
  const Span = tasty({ as: 'span',   styles: { … } });
  ```

  This restores 2.3.x semantics for `tasty(Component, …)` and removes the silent
  prop-leakage that 2.4.0 introduced when wrapping plain `forwardRef`/`memo`
  components that were not branded.

## 2.4.0

### Minor Changes

- [#176](https://github.com/tenphi/tasty/pull/176) [`f3ee259`](https://github.com/tenphi/tasty/commit/f3ee259a72d414b1efc652f3d86ccb601c76a058) Thanks [@tenphi](https://github.com/tenphi)! - Allow `tasty(Component, options)` to wrap any React component that forwards
  `className` (Next.js `Link`, `react-router` `Link`, Radix primitives, MUI,
  plain `forwardRef`/`memo`, …). Tasty-produced components are now branded
  internally and continue to use the prop-forwarding path with their full
  `styles`/`mods`/`tokens` pipeline; non-branded components are styled via
  their `className` prop, while Tasty-specific props (`qa`, `qaVal`, `mods`,
  `tokens`, `isDisabled`, `isHidden`, `isChecked`, plus declared
  `styleProps`/`modProps`/`tokenProps`) are consumed by the wrapper and
  converted to `data-*` attributes or CSS custom properties instead of
  leaking to the DOM. As a side benefit, passing a string tag as the first
  argument (`tasty('div', { styles })`) now works too.

### Patch Changes

- [#176](https://github.com/tenphi/tasty/pull/176) [`5180130`](https://github.com/tenphi/tasty/commit/51801305cd08d4193f9ce2f1ccce948c39011954) Thanks [@tenphi](https://github.com/tenphi)! - Allow `styleProps`, `variants`, `modProps`, and `tokenProps` in the
  `tasty(Component, options)` wrap overload — previously these were typed as
  `never`, which forced consumers to cast `Component as any` even though the
  runtime already supported these options.

## 2.3.1

### Patch Changes

- [#169](https://github.com/tenphi/tasty/pull/169) [`d353271`](https://github.com/tenphi/tasty/commit/d353271562f1dadc677808a947ecb65144a15fe9) Thanks [@tenphi](https://github.com/tenphi)! - Runtime injector now registers the decomposed-components companion `@property --{name}-color-{colorSpace}` for every color token, matching the SSR formatter. Previously, `injector.property('#name', …)` (and therefore `markStylesGenerated()` and `DEFAULT_PROPERTIES` like `#white`/`#black`/`#current`) only emitted the `--name-color` rule on the client, while SSR emitted both. Non-SSR consumers (Storybook, CSR apps) can now animate/transition the components variable just like in SSR.

## 2.3.0

### Minor Changes

- [#167](https://github.com/tenphi/tasty/pull/167) [`8395c8e`](https://github.com/tenphi/tasty/commit/8395c8ea17a74e090cd9c5bfecf7ec72362a2d62) Thanks [@tenphi](https://github.com/tenphi)! - Add `namePrefix` option to control the prefix used for every generated identifier (class names, keyframe names, counter-style names). Defaults to `'t'` for the runtime/SSR/RSC paths and `'ts'` for the zero-runtime build path so static-extracted classes can never collide with runtime classes when both are loaded on the same page. Keyframes and counter-styles now consistently use single-letter discriminators (`${prefix}k…`, `${prefix}c…`) so the three name kinds stay visually distinct in devtools (e.g. `tk1a2b3` for a keyframe). Generated keyframe and counter-style names that previously matched `^k\d+$` / `^cs\d+$` are now `^tk\d+$` / `^tc\d+$` by default; class names continue to start with `t…`.

## 2.2.0

### Minor Changes

- [#156](https://github.com/tenphi/tasty/pull/156) [`552c522`](https://github.com/tenphi/tasty/commit/552c522532b5e93465bab6773221dee86f1810ac) Thanks [@tenphi](https://github.com/tenphi)! - Pseudo-element and pseudo-class patterns in the `$` selector affix now require an explicit `&` prefix to attach to the root selector. `$: '::before'` must be written as `$: '&::before'`. Without `&`, pseudo patterns are treated as descendant selectors.

### Patch Changes

- [#154](https://github.com/tenphi/tasty/pull/154) [`b926d10`](https://github.com/tenphi/tasty/commit/b926d10c9007caa3e50e5b74f67caa14a044e7a1) Thanks [@tenphi](https://github.com/tenphi)! - Add explicit return type and narrow `injectScript` stage parameter in `tastyIntegration`.

- [#153](https://github.com/tenphi/tasty/pull/153) [`dbbe9b6`](https://github.com/tenphi/tasty/commit/dbbe9b63a7c74c4364e6a95f20c2ae38f658cd6f) Thanks [@tenphi](https://github.com/tenphi)! - Add #clear color token to the default configuration.

## 2.1.2

### Patch Changes

- [#150](https://github.com/tenphi/tasty/pull/150) [`f8f0285`](https://github.com/tenphi/tasty/commit/f8f02859f91bbe631f8b8be7fc5d9f052c954704) Thanks [@tenphi](https://github.com/tenphi)! - Fix excessive CSS output for compound root states by canonicalizing @media order, removing redundant boolean selectors, improving negation subsumption, and pruning contradicted OR branches.

- [#152](https://github.com/tenphi/tasty/pull/152) [`856a7ba`](https://github.com/tenphi/tasty/commit/856a7ba54ba97075a8428f71db38e4581d79687d) Thanks [@tenphi](https://github.com/tenphi)! - Factor Cartesian-product `:is()` selector groups into independent per-dimension `:is()` groups for more compact CSS output.

## 2.1.1

### Patch Changes

- [#148](https://github.com/tenphi/tasty/pull/148) [`a6fffde`](https://github.com/tenphi/tasty/commit/a6fffde058d4fee43af242fcb5cc70a53fe86d7f) Thanks [@tenphi](https://github.com/tenphi)! - Fix `$: '> SubElementName'` selector affix syntax so that when the trailing element name matches the sub-element's own key it acts as a placeholder rather than triggering a duplicate key injection.

## 2.1.0

### Minor Changes

- [#139](https://github.com/tenphi/tasty/pull/139) [`025dd2c`](https://github.com/tenphi/tasty/commit/025dd2c6c0cb27d5ae7375d396631466cb098f9f) Thanks [@tenphi](https://github.com/tenphi)! - Add Shadow DOM support: `useStyles`, `useGlobalStyles`, and `computeStyles` now accept a `root` option (`Document | ShadowRoot`) to inject styles into a specific shadow root. Styles are injected via `adoptedStyleSheets` when targeting a shadow root, with a shared `ChunkSheetRegistry` for deduplication across multiple shadow roots.

### Patch Changes

- [#139](https://github.com/tenphi/tasty/pull/139) [`4b8bd9d`](https://github.com/tenphi/tasty/commit/4b8bd9d85cafafee41ea1764dee829061ec8e90f) Thanks [@tenphi](https://github.com/tenphi)! - Use happy-dom for injector tests, removing mock CSSStyleSheet and adoptedStyleSheets shims

- [#139](https://github.com/tenphi/tasty/pull/139) [`8f6c8fe`](https://github.com/tenphi/tasty/commit/8f6c8fe22be4f39500020ec377af4e4eaddca351) Thanks [@tenphi](https://github.com/tenphi)! - Make `SheetInfo.sheet` nullable to accurately represent adopted mode where no HTMLStyleElement exists

## 2.0.4

### Patch Changes

- [#137](https://github.com/tenphi/tasty/pull/137) [`0fcb9d9`](https://github.com/tenphi/tasty/commit/0fcb9d975cbd179aacfe0657329d99adfd3acf63) Thanks [@tenphi](https://github.com/tenphi)! - Switch from unbundled to bundled output, reducing publish size by ~74% (from 2.05 MB to ~530 KB) and file count from 313 to 63.

## 2.0.3

### Patch Changes

- [#135](https://github.com/tenphi/tasty/pull/135) [`fa72fe1`](https://github.com/tenphi/tasty/commit/fa72fe190be7dd8cf489cdf05bc730cd0d3f8644) Thanks [@tenphi](https://github.com/tenphi)! - Internal pipeline cleanup: refactor `processStyles` into named per-stage helpers, split `materialize.ts` (types + contradiction detection extracted to `materialize-types.ts` and `materialize-contradictions.ts`), document the actual stage flow in `docs/pipeline.md` and the `index.ts` header (Stage 0 normalization, user-OR vs De Morgan-OR expansion, consensus rule, `@starting-style` cascade ordering), and add tests for container style query rendering, explicit boolean-algebra laws, multi-variable consensus, De Morgan with mixed `@supports`/`@container`, empty-styles, and a known simplification gap for conflicting `@root(schema=…)` attribute values. No behavior change.

## 2.0.2

### Patch Changes

- [#133](https://github.com/tenphi/tasty/pull/133) [`7cd9dbe`](https://github.com/tenphi/tasty/commit/7cd9dbe2eb0844e6c9a31b05a1df9a5b39c73d84) Thanks [@tenphi](https://github.com/tenphi)! - Fix missing state selectors when a non-default state maps to the same value as the default in a style map. Redundant compound state dimensions are now eliminated early in the pipeline.

## 2.0.1

### Patch Changes

- [`bf19368`](https://github.com/tenphi/tasty/commit/bf19368e093f66111b3834305b9383e2015c0f6a) Thanks [@tenphi](https://github.com/tenphi)! - Fix `tastyDebug` sorting of class names. The internal `sortTastyClasses` helper still parsed class names as decimal integers, which silently produced unsorted output for the 2.0.0 base36 hash format (e.g. `t3a5f`). It now sorts lexicographically, restoring stable ordering in `tastyDebug.cache()`, `tastyDebug.summary()`, and related outputs.

## 2.0.0

### Major Changes

- [#123](https://github.com/tenphi/tasty/pull/123) [`f26409e`](https://github.com/tenphi/tasty/commit/f26409e5dfc1efaa1cd81be520cdfb4edae37884) Thanks [@tenphi](https://github.com/tenphi)! - Unified hash-based class names across RSC, SSR, and client. Same cache key now produces the same class name in all environments, enabling cross-environment style deduplication. Replaces the heavy SSRCacheState transfer with a lightweight class-name-list via `window.__TASTY__`.

  **SSR/RSC fixes included:**
  - Fix missing tokens on pages without RSC-rendered tasty components. The `globalThis.__tasty_rsc_internals_emitted__` flag leaked across requests in the same Node.js process; internals (tokens, `@property`, `@font-face`, `@counter-style`) are now emitted exclusively by the SSR collector.
  - Fix duplicate global CSS when RSC and SSR paths both emit internals in Next.js App Router. The SSR collector now skips internals already emitted by the RSC inline-style path.
  - Fix CSS class name collisions during client-side navigation in Next.js App Router. RSC inline styles used sequential counters (`r0`, `r1`, …) that reset on every request; replaced with content-based hashing (djb2) so identical content always maps to the same name.
  - Auto-skip global CSS injection on client when `<style data-tasty-ssr>` is detected, eliminating the need for `typeof window === 'undefined'` guards in `configure()` calls.

  **Internal SSR API changes (not part of the public API):**
  - `SSRCacheState` type removed — replaced by plain `string[]` class lists.
  - `ServerStyleCollector.getCacheState()` replaced by `getRenderedClassNames()`.
  - `window.__TASTY_SSR_CACHE__` replaced by `window.__TASTY__`.
  - `hydrateTastyCache()` deprecated in favor of `hydrateTastyClasses()` (the old function still works as a compat shim).
  - Class name format changed from `t{number}` to `t{base36hash}`.

### Minor Changes

- [#119](https://github.com/tenphi/tasty/pull/119) [`af8bf8a`](https://github.com/tenphi/tasty/commit/af8bf8a966e0655f61ad83565bde538364d0131b) Thanks [@tenphi](https://github.com/tenphi)! - Add `presets` and `globalStyles` options to `configure()`. `presets` is a shorthand for `generateTypographyTokens()` that merges generated tokens under explicit `tokens`. `globalStyles` is a `Record<string, Styles>` that applies Tasty styles to arbitrary CSS selectors across all rendering modes. Both options are also available in plugins and zero-runtime config. Typography preset fields now accept state maps for responsive/theme-aware values.

### Patch Changes

- [#119](https://github.com/tenphi/tasty/pull/119) [`8a7a342`](https://github.com/tenphi/tasty/commit/8a7a342f8c456c80dd35da3c882eb566f5255f28) Thanks [@tenphi](https://github.com/tenphi)! - Derive `TastyZeroConfig` from `TastyConfig` via `Omit` to keep the two types in sync automatically. This also widens `TastyZeroConfig` to accept `colorSpace`, `properties`, and `boolean` values in `replaceTokens` — options that were previously only available in the runtime config.

- [#123](https://github.com/tenphi/tasty/pull/123) [`841767c`](https://github.com/tenphi/tasty/commit/841767c5b382bdf085e9a2c7fad8741dc43789b8) Thanks [@tenphi](https://github.com/tenphi)! - Fix overlapping and duplicate CSS selectors produced by the condition simplifier.
  - Fix overlapping selectors when default and custom-state token values coincide but other state values differ.
  - Fix overlapping selectors for compound state tokens by adding consensus resolution and making inner OR branches exclusive during CSS materialization.
  - Fix complementary factoring for compound state conditions, eliminating duplicate selectors when token values match across state combinations.
  - Eliminate duplicate token CSS rules when multiple states map to the same value. Tokens now generate a single rule instead of redundant duplicates. Also fixes absorption law so `A | (A & B)` correctly simplifies to `A` regardless of condition complexity.

- [#119](https://github.com/tenphi/tasty/pull/119) [`a642337`](https://github.com/tenphi/tasty/commit/a642337c7a7cf804b1474aa482868e7a3a094d5a) Thanks [@tenphi](https://github.com/tenphi)! - Change default `letterSpacing` in typography presets from `'0'` to `'normal'`. The previous default could override inherited letter-spacing; `'normal'` matches the browser default.

## 1.5.4

### Patch Changes

- [#117](https://github.com/tenphi/tasty/pull/117) [`186d305`](https://github.com/tenphi/tasty/commit/186d305f2909bb3e56783f689ece09ac90044456) Thanks [@tenphi](https://github.com/tenphi)! - Fix SSR style loss in Next.js static export by using React context for collector discovery instead of globalThis

## 1.5.3

### Patch Changes

- [#115](https://github.com/tenphi/tasty/pull/115) [`75585fc`](https://github.com/tenphi/tasty/commit/75585fcb85cf9c1d8df1f13dd9bbccd7a0be1e97) Thanks [@tenphi](https://github.com/tenphi)! - Keep Astro SSR middleware style collection active while the response body stream is consumed, so styles from lazily rendered components are included.

- [#115](https://github.com/tenphi/tasty/pull/115) [`5c670b5`](https://github.com/tenphi/tasty/commit/5c670b5e9c33e70e73e9f68d06b5a9015d5a5217) Thanks [@tenphi](https://github.com/tenphi)! - Mirror global config (tokens, font-face, counter-style, properties) to globalThis so SSR collectors in separate module graphs (e.g. Astro middleware) can read it.

## 1.5.2

### Patch Changes

- [#113](https://github.com/tenphi/tasty/pull/113) [`547451d`](https://github.com/tenphi/tasty/commit/547451d2b1409c70fe5ee01c4925861307231a86) Thanks [@tenphi](https://github.com/tenphi)! - Fix Astro SSR middleware by buffering the response body so styles are collected when HTML is streamed. Improve parsing of nested parentheses in `@supports`, `@root`, `@parent`, `@own`, and `@(...)` state keys.

## 1.5.1

### Patch Changes

- [#111](https://github.com/tenphi/tasty/pull/111) [`0544f16`](https://github.com/tenphi/tasty/commit/0544f16d3f609ed7922e88dea096289a81b56b1e) Thanks [@tenphi](https://github.com/tenphi)! - Share SSR AsyncLocalStorage and collector getter on `globalThis` so Astro and similar setups with split module graphs see one collector.

## 1.5.0

### Minor Changes

- [#109](https://github.com/tenphi/tasty/pull/109) [`d084195`](https://github.com/tenphi/tasty/commit/d084195352b859ea64fe6e07d78bd2dad0b56e33) Thanks [@tenphi](https://github.com/tenphi)! - Add Astro Integration API (`tastyIntegration()`) with three-tier support: zero-setup for static pages, optimized static without client JS (`islands: false`), and full island hydration (default). Split client hydration into `@tenphi/tasty/ssr/astro-client`. Middleware now uses streaming `TransformStream` instead of buffering the full response.

- [#110](https://github.com/tenphi/tasty/pull/110) [`b52bad7`](https://github.com/tenphi/tasty/commit/b52bad7952e60c2a121f54f3c64bfaae539f0417) Thanks [@tenphi](https://github.com/tenphi)! - Make all style functions (`useGlobalStyles`, `useRawCSS`, `useKeyframes`, `useProperty`, `useFontFace`, `useCounterStyle`) hook-free and compatible with React Server Components. Add RSC inline support via shared per-request cache. Add `id` option to `useRawCSS` and `useGlobalStyles` for update tracking. Extract `getStyleTarget()` helper to DRY up SSR/RSC/client detection. Add deps-based factory caching to `useKeyframes` and `useRawCSS`. Remove unused factory overload from `useCounterStyle`.

  **Breaking behavior change:** `useGlobalStyles` and `useRawCSS` no longer clean up injected styles on component unmount. Styles are now permanent once injected. For dynamic styles that change over the component lifecycle, use the `id` option to enable update tracking — when styles change for the same `id`, the previous injection is replaced.

- [#107](https://github.com/tenphi/tasty/pull/107) [`9fbd328`](https://github.com/tenphi/tasty/commit/9fbd328c63f7c0ee1e6e5e35179c605b102b12bc) Thanks [@tenphi](https://github.com/tenphi)! - Simplified the injector garbage collector to a touch-count-driven mechanism.

  **Breaking changes to GC API:**
  - Removed `maybeGC()` — GC is now auto-scheduled by touch count via `requestIdleCallback`
  - Removed `gc()` options: `baseMaxAge`, `cacheCapacity` — replaced with `gc({ force?: boolean })`
  - Replaced `GCConfig` fields (`auto`, `baseMaxAge`, `cooldown`, `autoInterval`, `cacheCapacity`) with `touchInterval` and `capacity`
  - Removed `StyleUsage.hitCount` — only `lastTouchedAt` is tracked

  **New behavior:**
  - Every `touchInterval` touches (default: 1000), GC is scheduled via `requestIdleCallback`
  - GC evicts the oldest unused styles when their count exceeds `capacity` (default: 1000); actively referenced styles don't count against the limit
  - `gc({ force: true })` bypasses the capacity threshold and removes ALL unused styles
  - No timers, no scoring math — activity-proportional triggering with oldest-first eviction

### Patch Changes

- [#109](https://github.com/tenphi/tasty/pull/109) [`8cacca3`](https://github.com/tenphi/tasty/commit/8cacca386756fbe30d7d689eaed2231ee61791ab) Thanks [@tenphi](https://github.com/tenphi)! - Fix Astro streaming middleware: strip Content-Length header after injection, propagate upstream errors instead of silently truncating, remove dead hydrateTastyCache re-export.

## 1.4.2

### Patch Changes

- [#104](https://github.com/tenphi/tasty/pull/104) [`2f4576e`](https://github.com/tenphi/tasty/commit/2f4576ee665212de48253ae558498ec91f38e9b5) Thanks [@tenphi](https://github.com/tenphi)! - Relax `filterBaseProps` generic constraint from `Record<string, unknown>` to `object` so composed prop types (built from `Omit`/intersections) are accepted without requiring a string index signature.

## 1.4.1

### Patch Changes

- [#102](https://github.com/tenphi/tasty/pull/102) [`0a3a431`](https://github.com/tenphi/tasty/commit/0a3a431c01c5a838958d0ebc4f63539c54fd4d2b) Thanks [@tenphi](https://github.com/tenphi)! - Make `filterBaseProps` generic so callers can pass strongly-typed props without casting; return `Partial<T>` to preserve value types.

## 1.4.0

### Minor Changes

- [#101](https://github.com/tenphi/tasty/pull/101) [`e3847c1`](https://github.com/tenphi/tasty/commit/e3847c1e4629b74cec5b214c91acf1ed42b21de5) Thanks [@tenphi](https://github.com/tenphi)! - Add popularity-aware garbage collector for unused styles. Tracks per-className usage with DOM safety guard — styles visible in the DOM are never evicted. Exposes `gc()`, `maybeGC()`, and `touch()` APIs, with optional automatic background sweep via `configure({ gc: { auto: true } })`. Removes old dead-code auto-cleanup pipeline.

### Patch Changes

- [#99](https://github.com/tenphi/tasty/pull/99) [`b183c93`](https://github.com/tenphi/tasty/commit/b183c93d65c0702b35a8c8f06b85176937675fda) Thanks [@tenphi](https://github.com/tenphi)! - Remove `TastySSRContext` React context from SSR pipeline. All hooks now discover the SSR collector via the same global getter used by `computeStyles()`, eliminating the need for a React context Provider in `TastyRegistry`. This simplifies the SSR architecture to a single collector discovery mechanism.

## 1.3.0

### Minor Changes

- [#97](https://github.com/tenphi/tasty/pull/97) [`3d06dba`](https://github.com/tenphi/tasty/commit/3d06dba9050487291c410920f0540f9548e56f9a) Thanks [@tenphi](https://github.com/tenphi)! - Make tasty() components hook-free and compatible with React Server Components. Styles are now computed synchronously via `computeStyles()`, removing the need for `'use client'` directives. SSR collectors are discovered via AsyncLocalStorage. Removes dead code: `stringifyTokens`, top-level `allocateClassName`, and `trackRef` wrappers.

- [#95](https://github.com/tenphi/tasty/pull/95) [`310e08f`](https://github.com/tenphi/tasty/commit/310e08fbf6f7e2a317b228f89ad94446d50c28a6) Thanks [@tenphi](https://github.com/tenphi)! - Add `tokenProps` option to `tasty()` for exposing token keys as top-level component props. Supports array form (with `Color` suffix convention for color tokens) and object form (explicit `$`/`#` mapping).

### Patch Changes

- [#97](https://github.com/tenphi/tasty/pull/97) [`7eae685`](https://github.com/tenphi/tasty/commit/7eae685ef8346e601c7215c4e6a769e8222fb835) Thanks [@tenphi](https://github.com/tenphi)! - Add RSC inline style emission — tasty() components now render correctly as React Server Components by emitting inline `<style>` tags when no SSR collector or DOM is available.

- [#98](https://github.com/tenphi/tasty/pull/98) [`4adfd20`](https://github.com/tenphi/tasty/commit/4adfd2032c293859d1b68e424246eb9d7f407c55) Thanks [@tenphi](https://github.com/tenphi)! - Make internal properties overridable via `configure({ properties })` by merging user properties on top of defaults. Add `#clear` (transparent) and `#border` (rgb(0 0 0)) color tokens.

## 1.2.0

### Minor Changes

- [#94](https://github.com/tenphi/tasty/pull/94) [`ef3adef`](https://github.com/tenphi/tasty/commit/ef3adefee0ec4d87cc1d936f9ea5d7ce237ffe53) Thanks [@tenphi](https://github.com/tenphi)! - Add `longhand` modifier to force longhand CSS output for radius, padding, margin, scroll-margin, inset, and border style handlers.

- [#92](https://github.com/tenphi/tasty/pull/92) [`f1bf654`](https://github.com/tenphi/tasty/commit/f1bf6544c0f2881326ba804c6e49d1bdd01e9cc8) Thanks [@tenphi](https://github.com/tenphi)! - Overhaul style handler system with CSS-wide keyword support, directional factory, unified placement, and new scrollMargin style.
  - All style handlers now accept CSS-wide keywords (`initial`, `inherit`, `revert`, `unset`, `revert-layer`) where semantically valid
  - New `scrollMargin` style with full directional, block/inline, and priority support
  - Unified `placementStyle` handler replaces separate `align`, `justify`, and `place` with hierarchical priority (longhands override shorthands)
  - Shared directional factory eliminates code duplication across `padding`, `margin`, `inset`, and `scrollMargin`
  - Standardized handler return types to `null` for no-output
  - Fixed `preset` fontStyle handling for non-inherit CSS-wide keywords

- [#88](https://github.com/tenphi/tasty/pull/88) [`a0b1a05`](https://github.com/tenphi/tasty/commit/a0b1a05cda077823cbd40fced85477b986340c95) Thanks [@tenphi](https://github.com/tenphi)! - Add `mode: 'inject'` option to the Babel plugin. In inject mode, CSS is embedded inline in JS and injected at runtime via a tiny injector (`@tenphi/tasty/static/inject`), making `tastyStatic` calls self-contained. Ideal for reusable components and extensions.

### Patch Changes

- [#90](https://github.com/tenphi/tasty/pull/90) [`270ab75`](https://github.com/tenphi/tasty/commit/270ab75185b24233930b2e77b26235fd93f3bf70) Thanks [@tenphi](https://github.com/tenphi)! - Add `inherit` support for the `radius` style property. Standalone `radius="inherit"` outputs `border-radius: inherit`. With directional modifiers (e.g. `radius="inherit right"`), longhand properties are used since CSS-wide keywords cannot be mixed with other values.

## 1.1.0

### Minor Changes

- [#71](https://github.com/tenphi/tasty/pull/71) [`daa6704`](https://github.com/tenphi/tasty/commit/daa6704c869e5edf961cf42cf1e9c49fed365f2b) Thanks [@tenphi](https://github.com/tenphi)! - Switch preset modifier syntax from space-separated (`h2 strong`) to slash-separated (`h2 / strong`). Mod-only shorthand like `preset="bold"` is supported (equivalent to `inherit / bold`).

## 1.0.0

### Major Changes

- [`a25af0b`](https://github.com/tenphi/tasty/commit/a25af0bd75b08c85fbda9f25a948dbc8356a82fc) Thanks [@tenphi](https://github.com/tenphi)! - Promote to stable 1.0.0 release.

## 0.17.1

### Patch Changes

- [#68](https://github.com/tenphi/tasty/pull/68) [`9dd1e81`](https://github.com/tenphi/tasty/commit/9dd1e81afd6fdca6f36e9fe52da85a49c0fd9879) Thanks [@tenphi](https://github.com/tenphi)! - Preserve canonical casing for CSS transform function names (e.g. `translateX`, `scaleY`) in parser output instead of lowercasing them.

## 0.17.0

### Minor Changes

- [#66](https://github.com/tenphi/tasty/pull/66) [`2b8620a`](https://github.com/tenphi/tasty/commit/2b8620ab70ffd76f8e0f3ac809ce9408b4c2f5e2) Thanks [@tenphi](https://github.com/tenphi)! - Remove `--line-height` CSS custom property from presets and drop the `lh` custom unit in favor of the native CSS `lh` unit.

### Patch Changes

- [#66](https://github.com/tenphi/tasty/pull/66) [`4dbcdea`](https://github.com/tenphi/tasty/commit/4dbcdea94955e0b1358c0b44e7d63bb0486fcc6f) Thanks [@tenphi](https://github.com/tenphi)! - Remove unused `--font-style` CSS custom property from preset style output.

## 0.16.1

### Patch Changes

- [#64](https://github.com/tenphi/tasty/pull/64) [`1372f31`](https://github.com/tenphi/tasty/commit/1372f31f038e9e06b6ff562aad9473386dba3dc7) Thanks [@tenphi](https://github.com/tenphi)! - Nest `@starting-style` inside selector rules instead of wrapping as an outer at-rule. Fixes complex styles not applying `@starting-style` correctly.

## 0.16.0

### Minor Changes

- [#59](https://github.com/tenphi/tasty/pull/59) [`55eadac`](https://github.com/tenphi/tasty/commit/55eadac85a885138c10aa876697c51e79fbf4eab) Thanks [@tenphi](https://github.com/tenphi)! - Rename default font CSS custom properties: `--font` → `--font-sans`, `--monospace-font` → `--font-mono` to align with Tailwind/Next.js conventions.

- [#59](https://github.com/tenphi/tasty/pull/59) [`6ceb4cf`](https://github.com/tenphi/tasty/commit/6ceb4cf2495d0aa02ef01b7d5452af6024db3c06) Thanks [@tenphi](https://github.com/tenphi)! - Add @font-face and @counter-style at-rule support via `useFontFace` / `useCounterStyle` hooks, global `configure()` options, injector methods, SSR collection, and zero-runtime extraction.

### Patch Changes

- [#63](https://github.com/tenphi/tasty/pull/63) [`beaf6ce`](https://github.com/tenphi/tasty/commit/beaf6ce89148b8efdba415123337d3cac9a76c2d) Thanks [@tenphi](https://github.com/tenphi)! - Remove custom `fs` unit and `--font-size` CSS variable from preset output. Use native CSS `em` unit instead.

- [#62](https://github.com/tenphi/tasty/pull/62) [`a27dede`](https://github.com/tenphi/tasty/commit/a27dedeb1b619d8f0843756c2808c3533152282c) Thanks [@tenphi](https://github.com/tenphi)! - Replace INTERNAL_TOKENS `:root` injection with `@property` font-stack fallbacks and CSS `var()` defaults

## 0.15.3

### Patch Changes

- [`a68b132`](https://github.com/tenphi/tasty/commit/a68b1320db8a1523d7c6a388f9700217bcc4c6ee) Thanks [@tenphi](https://github.com/tenphi)! - Fix `configure()` unconditionally resetting `colorSpace` to `'oklch'` on every call, even when `colorSpace` is not provided. Now `colorSpace` follows the same merge semantics as other config options — it is only changed when explicitly passed.

## 0.15.2

### Patch Changes

- [#56](https://github.com/tenphi/tasty/pull/56) [`955caa9`](https://github.com/tenphi/tasty/commit/955caa9e917f86880d462a29b16ac997b2be515c) Thanks [@tenphi](https://github.com/tenphi)! - Fix type error where JSX elements were not assignable as children of tasty components due to `ResolveModProps` producing a catch-all index signature and `AllHTMLAttributes` intersection narrowing tag-specific attribute types.

- [#58](https://github.com/tenphi/tasty/pull/58) [`c89dc3e`](https://github.com/tenphi/tasty/commit/c89dc3e0e03ca8a21f89bb6b2cff331427c38ff0) Thanks [@tenphi](https://github.com/tenphi)! - Fix zero-runtime CSS loss in Turbopack: prevent non-contributing files from overwriting `tasty.css` with tokens-only content.

## 0.15.1

### Patch Changes

- [#55](https://github.com/tenphi/tasty/pull/55) [`24ae87b`](https://github.com/tenphi/tasty/commit/24ae87b4254a6abefa3bd39aa876fb1fc21d9529) Thanks [@tenphi](https://github.com/tenphi)! - Fix zero-runtime CSS loss in Turbopack by persisting CSSWriter across per-file Babel invocations.

- [#53](https://github.com/tenphi/tasty/pull/53) [`107c1bc`](https://github.com/tenphi/tasty/commit/107c1bc060a6508e9dff686515d5c08dd91aed1f) Thanks [@tenphi](https://github.com/tenphi)! - Group design tokens with the same state map into a single CSS rule to reduce output size.

## 0.15.0

### Minor Changes

- [#51](https://github.com/tenphi/tasty/pull/51) [`d2dc330`](https://github.com/tenphi/tasty/commit/d2dc3307bc7c01e2d4e3e9a310facaf267b96d81) Thanks [@tenphi](https://github.com/tenphi)! - Add `modProps` option to `tasty()` for exposing modifier keys as typed component props. Supports array form and object form with type descriptors (`Boolean`, `String`, `Number`, enum arrays) for full TypeScript autocomplete. Mod props merge with `mods` (mod props take precedence).

## 0.14.2

### Patch Changes

- [#49](https://github.com/tenphi/tasty/pull/49) [`63bb6ec`](https://github.com/tenphi/tasty/commit/63bb6ecc69031bc72a83d66e25786f90cc1398a8) Thanks [@tenphi](https://github.com/tenphi)! - Fix sub-element `$` selector affix for bare HTML tag names: `$: "h1"` now produces `{root} h1` instead of `{root} h1 [data-element="..."]`. Add support for the `*` universal selector in affix patterns.

## 0.14.1

### Patch Changes

- [#47](https://github.com/tenphi/tasty/pull/47) [`f5c237f`](https://github.com/tenphi/tasty/commit/f5c237f8aca633db5fd364eab2364def3e083367) Thanks [@tenphi](https://github.com/tenphi)! - Improve color style types: extract reusable `ColorValue` type, add `hsl()`, `okhsl()`, `oklch()` autocomplete hints, remove deprecated `rgba()`, document double-color fill syntax.

## 0.14.0

### Minor Changes

- [#43](https://github.com/tenphi/tasty/pull/43) [`2be334c`](https://github.com/tenphi/tasty/commit/2be334c5b60ab934496dab834e4a862e0ace2c3c) Thanks [@tenphi](https://github.com/tenphi)! - Add configurable color space for decomposed color token companion variables (`configure({ colorSpace })`) with `oklch` as the new default.

  **Breaking:** The default companion variable suffix changed from `-rgb` to `-oklch`. Any external CSS referencing `--name-color-rgb` variables directly will need to either:
  - Set `configure({ colorSpace: 'rgb' })` to restore the previous behavior, or
  - Update references to use `--name-color-oklch` instead.

  Also unifies color conversion with shared OKHSL/sRGB math, improves OKHSL plugin and token handling, and updates related docs.

### Patch Changes

- [#46](https://github.com/tenphi/tasty/pull/46) [`7b4917f`](https://github.com/tenphi/tasty/commit/7b4917fcb23b920bd2b77351112144ad954740af) Thanks [@tenphi](https://github.com/tenphi)! - Update runtime benchmark numbers and add practical performance summary to README.

- [#45](https://github.com/tenphi/tasty/pull/45) [`c6809fd`](https://github.com/tenphi/tasty/commit/c6809fdf08e227de805a6fb6f78708e2d1290c79) Thanks [@tenphi](https://github.com/tenphi)! - Refactor tastyDebug: reduce API to 8 methods, log by default (use `{ raw: true }` to suppress), add rule counts to summary/inspect, add `{ source: true }` for original CSS inspection, simplify prettifyCSS.

- [#43](https://github.com/tenphi/tasty/pull/43) [`e29d47e`](https://github.com/tenphi/tasty/commit/e29d47e7614673bb3b1b0c1b81ca4f0658ba95bf) Thanks [@tenphi](https://github.com/tenphi)! - Fix alpha channel being stripped during color space conversion, restoring transparent color tokens for fade masks and other styles.

- [#43](https://github.com/tenphi/tasty/pull/43) [`5f1ce82`](https://github.com/tenphi/tasty/commit/5f1ce82d4b80e20f2f19460cebdab9605952c8a5) Thanks [@tenphi](https://github.com/tenphi)! - Support CSS named colors (e.g. `purple`, `coral`) as color token values without emitting parse warnings.

## 0.13.1

### Patch Changes

- [#40](https://github.com/tenphi/tasty/pull/40) [`cbe5db3`](https://github.com/tenphi/tasty/commit/cbe5db38718eba80437f6521cda86db801df8c94) Thanks [@tenphi](https://github.com/tenphi)! - Auto-inject generated CSS in zero-runtime mode

  The Babel plugin now automatically replaces `@tenphi/tasty/static` imports with an import of the generated CSS file, eliminating the need to manually add `import '@/public/tasty.css'` in layout files. An empty CSS stub is created before the first build to avoid resolution errors on fresh clones. Controlled via the `injectImport` option (defaults to `true`).

- [#42](https://github.com/tenphi/tasty/pull/42) [`75b5fa0`](https://github.com/tenphi/tasty/commit/75b5fa02d49d58ed85ebf6c71889d5a1efc20cfa) Thanks [@tenphi](https://github.com/tenphi)! - Optimize CSS selectors: merge OR branches into `:is()`/`:not()` groups for `@root`, `@own`, and base modifier/pseudo conditions; sort conditions for canonical output; unify `ParentGroup` with `SelectorGroup`.

## 0.13.0

### Minor Changes

- [`7270a67`](https://github.com/tenphi/tasty/commit/7270a67394696b0efd8a62f69ba28ee9c74ffc85) Thanks [@tenphi](https://github.com/tenphi)! - Add Turbopack support for zero-runtime CSS extraction
  - Add `configFile` option to the Babel plugin (`@tenphi/tasty/babel-plugin`) so it can load config from a file path via jiti internally, without requiring a factory function from the Next.js wrapper. This makes the plugin compatible with Turbopack's requirement for JSON-serializable loader options.
  - Update `withTastyZero` (`@tenphi/tasty/next`) to emit `turbopack.rules` alongside the existing `webpack()` hook, so both bundlers work automatically with no flags needed.
  - Wrap `addExternalDependency` in a try/catch for environments where it is unavailable (e.g. Turbopack's loader runner).
  - Set `experimental.turbopackUseBuiltinBabel: true` in the returned config to silence the manual babel-loader warning while preserving compatibility with user `.babelrc` configs.

## 0.12.0

### Minor Changes

- [#37](https://github.com/tenphi/tasty/pull/37) [`c049bfd`](https://github.com/tenphi/tasty/commit/c049bfd7025ab8709b2296921f0fb802f597b0de) Thanks [@tenphi](https://github.com/tenphi)! - Add Turbopack support for zero-runtime CSS extraction
  - Add `configFile` option to the Babel plugin (`@tenphi/tasty/babel-plugin`) so it can load config from a file path via jiti internally, without requiring a factory function from the Next.js wrapper. This makes the plugin compatible with Turbopack's requirement for JSON-serializable loader options.
  - Update `withTastyZero` (`@tenphi/tasty/next`) to emit `turbopack.rules` alongside the existing `webpack()` hook, so both bundlers work automatically with no flags needed.
  - Wrap `addExternalDependency` in a try/catch for environments where it is unavailable (e.g. Turbopack's loader runner).

## 0.11.0

### Minor Changes

- [#36](https://github.com/tenphi/tasty/pull/36) [`39b2d4d`](https://github.com/tenphi/tasty/commit/39b2d4d721d7cd0bdf220e0da4838d37d6f93acf) Thanks [@tenphi](https://github.com/tenphi)! - Remove predefined design-system tokens (colors, sizes, spacing, shadows, layout, base) from the package. These tokens belong to consuming design systems (e.g. `@cube-dev/ui-kit`), not to the styling engine itself.

  The `TypographyPreset` interface and `generateTypographyTokens()` utility remain available. Built-in CSS properties (`$gap`, `$radius`, `$border-width`, `$outline-width`, `$transition`, `$sharp-radius`, `$bold-font-weight`, `#white`, `#black`) in `INTERNAL_PROPERTIES` are unaffected.

- [#36](https://github.com/tenphi/tasty/pull/36) [`ed929cc`](https://github.com/tenphi/tasty/commit/ed929cc48f14c6fce5d191c6480d30ab234adec3) Thanks [@tenphi](https://github.com/tenphi)! - Refactor token system: `configure({ tokens })` now injects CSS custom properties on `:root` with state map support

  **Breaking changes:**
  - `configure({ tokens })` no longer performs parse-time substitution. Instead, tokens are injected as CSS custom properties on `:root` when the first style is rendered. Token values are parsed through the Tasty DSL and support state maps for responsive/theme-aware values.
  - The old parse-time substitution behavior is now available via `configure({ replaceTokens })`.
  - `TYPOGRAPHY_PRESETS` has been removed. Use `generateTypographyTokens()` with your own presets instead.
  - `generateTypographyTokens()` now requires a `presets` argument (no longer has a default).

  **Migration guide:**

  ```ts
  // Before
  configure({
    tokens: { $spacing: '2x', '#accent': '#purple' },
  });

  // After — for parse-time substitution (same behavior as before)
  configure({
    replaceTokens: { $spacing: '2x', '#accent': '#purple' },
  });

  // After — for :root CSS custom properties (new recommended approach)
  configure({
    tokens: {
      $gap: '8px',
      '#primary': {
        '': '#purple',
        '@dark': '#light-purple',
      },
    },
  });
  ```

### Patch Changes

- [`6a7972a`](https://github.com/tenphi/tasty/commit/6a7972a9933127f824f9395ecc4483187bff6952) Thanks [@tenphi](https://github.com/tenphi)! - Move `jiti` from `dependencies` to optional `peerDependencies` since it is only needed by the Next.js zero-runtime wrapper (`@tenphi/tasty/next`). Document requirements for SSR and zero-runtime entry points.

## 0.10.1

### Patch Changes

- [`ff3cdf8`](https://github.com/tenphi/tasty/commit/ff3cdf86abacd2688d6862504c29471f15d66498) Thanks [@tenphi](https://github.com/tenphi)! - Add name-based `--*-opacity` suffix rule to `autoPropertyTypes`: custom properties ending with `-opacity` are now automatically typed as `<number> | <percentage>` with initial value `0`, enabling smooth CSS transitions for opacity values.

## 0.10.0

### Minor Changes

- [#20](https://github.com/tenphi/tasty/pull/20) [`d5bec8b`](https://github.com/tenphi/tasty/commit/d5bec8b91a60e183033a4829dd23ac683f927037) Thanks [@tenphi](https://github.com/tenphi)! - Add server-side rendering (SSR) support with zero-cost client hydration. New entry points: `@tenphi/tasty/ssr`, `@tenphi/tasty/ssr/next`, `@tenphi/tasty/ssr/astro`. Next.js App Router (`TastyRegistry`), Astro (`tastyMiddleware`), and generic framework integration via `ServerStyleCollector`, `TastySSRContext`, `runWithCollector`, and `hydrateTastyCache`. Requires React 19+.

### Patch Changes

- [#20](https://github.com/tenphi/tasty/pull/20) [`f39678d`](https://github.com/tenphi/tasty/commit/f39678d3071979d5847aea067a349bd97fcfd806) Thanks [@tenphi](https://github.com/tenphi)! - Upgrade auto-inferred `@property` types: length and percentage values now register as `<length-percentage>` instead of separate `<length>`/`<percentage>`, enabling smooth transitions between mixed units. Add name-based inference for `--*-line-height` properties as `<number> | <length-percentage>`.

## 0.9.0

### Minor Changes

- [#31](https://github.com/tenphi/tasty/pull/31) [`5852321`](https://github.com/tenphi/tasty/commit/5852321733f97170a4d6cb5b62b898d8afde22a3) Thanks [@tenphi](https://github.com/tenphi)! - Simplify scrollbar style handler to use standard CSS properties only (`scrollbar-width`, `scrollbar-color`, `scrollbar-gutter`), removing all `::-webkit-scrollbar-*` pseudo-element logic and the `styled` modifier.

## 0.8.0

### Minor Changes

- [#28](https://github.com/tenphi/tasty/pull/28) [`cf339c4`](https://github.com/tenphi/tasty/commit/cf339c44943c6efe3d4d11910811f04aed00e79f) Thanks [@tenphi](https://github.com/tenphi)! - Consolidate `@parent()` OR branches into a single `:is()`/`:not()` wrapper with comma-separated selector arguments instead of expanding to separate selectors.

- [#28](https://github.com/tenphi/tasty/pull/28) [`361b5a1`](https://github.com/tenphi/tasty/commit/361b5a10518cd95148bb857612e90795a6f0a124) Thanks [@tenphi](https://github.com/tenphi)! - Add support for `:is()`, `:has()`, `:not()`, and `:where()` pseudo-classes in state keys with automatic element name transformation and `:not()` normalization.

## 0.7.1

### Patch Changes

- [#26](https://github.com/tenphi/tasty/pull/26) [`bbb1e4b`](https://github.com/tenphi/tasty/commit/bbb1e4b0bcaaf02ba3ea6f105339022e2f6bb682) Thanks [@tenphi](https://github.com/tenphi)! - Fix `@property` type inference for bare zero values. A value of `0` is ambiguous in CSS (could be `<length>`, `<angle>`, `<percentage>`, etc.), so it is no longer inferred as `<number>`. This prevents incorrect `@property` registrations that would reject subsequent typed values like `10px`.

## 0.7.0

### Minor Changes

- [#23](https://github.com/tenphi/tasty/pull/23) [`9941b40`](https://github.com/tenphi/tasty/commit/9941b40895c771691cbf1bfe28245c6d237de7a3) Thanks [@tenphi](https://github.com/tenphi)! - Auto-infer CSS @property types from custom property values. Supports `<number>`, `<length>`, `<angle>`, `<percentage>`, `<time>`, and `<color>` with deferred var() chain resolution. Controlled by `autoPropertyTypes` config flag (default: true). Adds named CSS color support to `strToRgb`.

### Patch Changes

- [#23](https://github.com/tenphi/tasty/pull/23) [`871841f`](https://github.com/tenphi/tasty/commit/871841f47c88dd6df705275f39a633c25fb17cfa) Thanks [@tenphi](https://github.com/tenphi)! - Optimize @property auto-inference: skip non-custom-property declarations early, bypass token parsing indirection, remove color value detection and type mismatch validation overhead.

- [#24](https://github.com/tenphi/tasty/pull/24) [`cb219ee`](https://github.com/tenphi/tasty/commit/cb219eed6cdcc9b85b3306c7faa2e44665ef69df) Thanks [@tenphi](https://github.com/tenphi)! - Support two-color fill alongside background image by combining both layers in background-image.

## 0.6.0

### Minor Changes

- [#21](https://github.com/tenphi/tasty/pull/21) [`2546c41`](https://github.com/tenphi/tasty/commit/2546c4151a60194eac115e13cc07bcee00ea0636) Thanks [@tenphi](https://github.com/tenphi)! - Add extend-mode state maps: base styles with state maps lacking a `''` key are now applied after variant merge, allowing shared state overrides across all variants.

## 0.5.4

### Patch Changes

- [#18](https://github.com/tenphi/tasty/pull/18) [`52e4fc3`](https://github.com/tenphi/tasty/commit/52e4fc37955c9dd361bee56d9987df85aaa03406) Thanks [@tenphi](https://github.com/tenphi)! - Improve pipeline internals: add XOR chain-depth guard, consolidate duplicated deduplication/superset/absorption functions, ensure deterministic variant ordering, optimize string building in selector transform, add LRU and WeakMap caches for hot paths, introduce structured warning system with configurable handler, enable noImplicitAny across the codebase, and expand test coverage for XOR, range merging, absorption, and deduplication edge cases.

## 0.5.3

### Patch Changes

- [#16](https://github.com/tenphi/tasty/pull/16) [`caf461a`](https://github.com/tenphi/tasty/commit/caf461a8ada6f897ef3f8ebe35d1d1d2af516efb) Thanks [@tenphi](https://github.com/tenphi)! - Add top-level `types`, `main`, and `module` fields for compatibility with `moduleResolution: "node"`.

## 0.5.2

### Patch Changes

- [#14](https://github.com/tenphi/tasty/pull/14) [`d761080`](https://github.com/tenphi/tasty/commit/d7610807ac56b13052b92fc2f1fb427180d924a1) Thanks [@tenphi](https://github.com/tenphi)! - Extract style properties reference into dedicated docs/styles.md with comprehensive coverage of all custom-handled props, values, modifiers, and recommendations.

## 0.5.1

### Patch Changes

- [`2fd0a9e`](https://github.com/tenphi/tasty/commit/2fd0a9e6a1d27815878ff3c114a7e0c682aaffcb) Thanks [@tenphi](https://github.com/tenphi)! - Add eslint config file for tasty validation.

## 0.5.0

### Minor Changes

- [#11](https://github.com/tenphi/tasty/pull/11) [`4868455`](https://github.com/tenphi/tasty/commit/48684550c808d2235344aec223385234ed58d46a) Thanks [@tenphi](https://github.com/tenphi)! - Parse `@root()`, `@parent()`, and `@own()` inner content as full condition expressions instead of raw CSS selectors. This enables boolean logic (`&`, `|`, `!`) inside these conditions, correctly preserving OR branches as separate selector variants and unifying their internal representation as modifier/pseudo conditions.

  **Breaking:** `@parent` direct-child syntax changed from `@parent(cond >)` to `@parent(cond, >)`. The `,` is reserved exclusively for separating the `>` direct-child flag; use `|` for OR logic inside `@parent()`.

  **Fixed:** `@parent(a) & @parent(b)` now correctly produces two independent `:is()` wrappers that can match different ancestors. Use `@parent(a & b)` when the same ancestor must satisfy both conditions.

### Patch Changes

- [#11](https://github.com/tenphi/tasty/pull/11) [`d858e95`](https://github.com/tenphi/tasty/commit/d858e959633a0e2818437137c5d56eaf58c97762) Thanks [@tenphi](https://github.com/tenphi)! - Fix parent group dedup key missing negation, guard selector dedup against non-exact operators, and simplify materialization internals.

## 0.4.2

### Patch Changes

- [`e6a6982`](https://github.com/tenphi/tasty/commit/e6a6982c1db6a75bfce0ca00f11452a25e7102e6) Thanks [@tenphi](https://github.com/tenphi)! - Drop `react-is` dependency by replacing `isValidElementType` with a lightweight internal utility. Move `@babel/helper-plugin-utils` and `@babel/types` from dependencies to optional peer dependencies since they are only needed for the Babel plugin entry point.

## 0.4.1

### Patch Changes

- [`27bc1bf`](https://github.com/tenphi/tasty/commit/27bc1bfe81e8f93f10f9d3496fefab506b4e7fa8) Thanks [@tenphi](https://github.com/tenphi)! - Add missing exports.

## 0.4.0

### Minor Changes

- [#7](https://github.com/tenphi/tasty/pull/7) [`92b700e`](https://github.com/tenphi/tasty/commit/92b700eff8007e6307d0afa894c56ab8e86f8e2f) Thanks [@tenphi](https://github.com/tenphi)! - Add `@tenphi/tasty/core` entry point exporting the full framework-agnostic styling engine (config, pipeline, parser, injector, styles, plugins, states, chunks, utils, types). This enables building tasty integrations for non-React frameworks and tools like eslint plugins without depending on React.

  Remove `@tenphi/tasty/parser` entry point — its exports are now available via `@tenphi/tasty/core`.

  Replace internal `CSSProperties` imports from React with `csstype`, extracted into a shared `CSSProperties` type alias. Also export `InnerStyleProps` (previously missing from public API).

## 0.3.0

### Minor Changes

- [#5](https://github.com/tenphi/tasty/pull/5) [`13ecc70`](https://github.com/tenphi/tasty/commit/13ecc70e7c434e009114668e095a652ad72fec8e) Thanks [@tenphi](https://github.com/tenphi)! - Change recipe syntax separator from `|` to `/` and add support for `none` value to disable base recipes.

## 0.2.0

### Minor Changes

- [#3](https://github.com/tenphi/tasty/pull/3) [`a49afea`](https://github.com/tenphi/tasty/commit/a49afea07306630ab213fe5d1b3c599b8f607f6c) Thanks [@tenphi](https://github.com/tenphi)! - Add @parent() state for styling based on parent element state (e.g. @parent(hovered), @parent(theme=dark >) for direct parent).

## 0.1.3

### Patch Changes

- [`d95087e`](https://github.com/tenphi/tasty/commit/d95087ea4c631abec255c1268daa3055da3e0e5f) Thanks [@tenphi](https://github.com/tenphi)! - Export `StyleParser`, types, and `Bucket` enum via new `@tenphi/tasty/parser` sub-path for use by external tooling (e.g., ESLint plugin).

## 0.1.2

### Patch Changes

- Mark Node builtins (fs, path, crypto) as external to suppress build warnings
- Deduplicate CI builds on push to main

## 0.1.1

### Patch Changes

- [`ac38577`](https://github.com/tenphi/tasty/commit/ac3857771ffd88971e110517ac185044e4b1ad31) Thanks [@tenphi](https://github.com/tenphi)! - Fix node-targeted subpaths (babel-plugin, zero, next) outputting .mjs instead of .js by unifying tsdown build config into a single browser-platform entry
- Mark Node builtins (fs, path, crypto) as external to suppress build warnings
