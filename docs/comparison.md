# Comparison

Use this guide when you are deciding whether Tasty is the right tool. If you have already decided to adopt it and need rollout guidance, use the [Adoption Guide](adoption.md) instead.

Tasty is best understood not as a general-purpose CSS framework, but as a **styling engine for design systems and shared component APIs**.

Most styling tools focus on one of these layers:

- direct app styling
- component-level styling
- typed CSS authoring
- utility composition
- atomic CSS generation

Tasty targets a different layer: it helps teams define a **house styling language** on top of CSS, including tokens, state semantics, style props, recipes, custom units, and sub-element rules.

That does not mean a big upfront configuration step is required. Tasty's built-in units and normal CSS color values work out of the box, and `okhsl(...)` is available immediately as the recommended path for color authoring. The extra setup comes later if a team wants shared tokens, aliases, recipes, or stricter conventions.

That is why syntax-level comparisons are often shallow. The more meaningful comparison is about:

- **which layer** a tool is designed for
- **who owns the authoring language**
- **how state conflicts are resolved**
- **what kind of predictability** the tool actually guarantees

---

## High-level positioning

| System | Best described as | Main authoring model | Conflict model | Best fit |
|---|---|---|---|---|
| **Tasty** | Design-system styling engine | Custom DSL with tokens, state maps, recipes, style props, sub-elements, custom units | **Mutually exclusive selector resolution** for stateful styles | Teams building shared component APIs or a house styling language |
| **Tailwind CSS** | Utility-first styling framework | Utility classes in markup | Utility composition, variants, and framework-controlled ordering | Product teams optimizing for speed and direct authoring |
| **Panda CSS** | Typed styling engine with atomic output | Typed style objects, recipes, generated primitives, style props | Atomic CSS with static analysis | Teams wanting a DS-friendly engine with typed primitives |
| **vanilla-extract** | Zero-runtime TS-native stylesheet system | `.css.ts` files, theme contracts, style composition | Standard CSS semantics | Teams wanting static CSS and low-level control |
| **StyleX** | Compiler-based atomic styling system | JS authoring with compiler-generated atomic CSS | Compiler-controlled atomic composition | Large app teams wanting optimized, predictable atomic styling |
| **Stitches** (deprecated) **/ Emotion** | Component-first CSS-in-JS | Styled components, `css()` APIs, object/string styles | Composition within CSS-in-JS rules | Teams optimizing for component DX and flexible styling |

---

## What makes Tasty different

Tasty is built around a stronger goal than generic "predictable styling."

In many systems, predictability means:

- the compiler controls ordering
- class names do not accidentally collide
- specificity is reduced or normalized
- atomic rules compose in a stable way

Those are useful guarantees, but they are not the same as Tasty's main idea.

Tasty focuses on **stateful style resolution**. Instead of relying on ordinary cascade competition between matching rules, it compiles style logic into **mutually exclusive selectors**. For a given property and state combination, the system ensures that exactly one branch is eligible to win.

This is especially relevant for components with intersecting states such as:

- hover
- focus
- pressed
- disabled
- selected
- theme variants
- responsive conditions
- parent or root-driven conditions

Here is a minimal example. Two CSS rules for a button's background — one for `:hover`, one for `[disabled]`:

```css
.btn:hover    { background: dodgerblue; }
.btn[disabled] { background: gray; }
```

When the button is both hovered **and** disabled, both selectors match with equal specificity. The last rule in source order wins. Swap the two lines and the visual behavior silently reverses — a hovered disabled button turns blue instead of gray.

In Tasty, the same intent is declared as a state map:

```tsx
fill: {
  '': '#primary',
  ':hover': '#primary-hover',
  'disabled': '#surface',
}
```

Tasty compiles this into selectors where `disabled` is guarded by `:not(:hover)` negations (and vice versa), so exactly one rule matches regardless of source order. The outcome is defined by the state map, not by which line comes last.

That makes Tasty less of a "better way to write CSS objects" and more of a **state-aware style compiler for design systems**.

Beyond state resolution, Tasty includes several structural capabilities that most other tools do not offer:

- **CSS properties as typed React props** — `styleProps` lets a component expose selected style properties as normal props (`<Button placeSelf="end">`), including state maps for responsive values. No other tool provides this as a first-class, typed, design-system-aware feature.
- **Sub-element styling** — Compound components declare inner parts via capitalized keys in `styles` and `data-element` attributes. States, tokens, and recipes apply across the entire element tree from a single definition. See [Runtime API — Sub-element Styling](runtime.md#sub-element-styling).
- **Auto-inferred `@property`** — When a custom property is assigned a concrete value, Tasty infers the CSS `@property` syntax and registers it automatically, enabling smooth transitions on custom properties without manual declarations.
- **AI-friendly style definitions** — Style definitions are declarative, self-contained, and structurally consistent. AI tools can read, refactor, and generate Tasty styles as confidently as a human — no hidden cascade logic or implicit ordering to second-guess.
- **Companion ecosystem** — An [ESLint plugin](https://github.com/tenphi/eslint-plugin-tasty) with 27 lint rules, a [VS Code extension](https://github.com/tenphi/tasty-vscode-extension) for syntax highlighting, and [Glaze](https://github.com/tenphi/glaze) for OKHSL color theme generation with automatic WCAG contrast solving.

---

## Comparison by system

### Tasty vs Tailwind CSS

Tailwind is centered on **direct authoring in markup**.

Its strength is speed: developers compose utilities directly where they use them, with responsive and state modifiers layered on top. This works extremely well for app teams that want a shared utility vocabulary with minimal ceremony.

Tasty solves a different problem.

Tasty is more appropriate when styling should be exposed through a **design-system-owned API** rather than through raw utility composition. You can start using Tasty immediately with its built-in DSL, but it becomes especially compelling when a team wants to define:

- approved style props
- semantic tokens
- custom units
- recipes
- state semantics
- sub-element rules
- constrained component-facing styling APIs

So this is not mainly a comparison of syntax. It is a comparison of **governance models**:

- Tailwind: developers author directly with framework vocabulary
- Tasty: design-system authors define the vocabulary product teams consume

Tailwind is usually a stronger fit for fast product styling with framework-owned vocabulary. Tasty is usually a stronger fit when teams want direct usability now, but also a path toward governed design-system architecture.

To make this concrete, consider a button with `hover`, `disabled`, and `theme=danger` states.

**Plain CSS** — you need a selector for every intersection, and equal-specificity rules depend on source order:

```css
.btn { background: var(--primary); color: white; cursor: pointer; }
.btn:hover { background: var(--primary-hover); }
.btn:active { background: var(--primary-pressed); }
.btn[disabled] { background: var(--surface); color: var(--text-40); cursor: not-allowed; }

/* theme=danger overrides — must repeat disabled/hover/active */
.btn[data-theme="danger"] { background: var(--danger); }
.btn[data-theme="danger"]:hover { background: var(--danger-hover); }
.btn[data-theme="danger"]:active { background: var(--danger-pressed); }
.btn[data-theme="danger"][disabled] { background: var(--surface); }

/* Bug: .btn:hover and .btn[disabled] have the same specificity.
   A hovered disabled button gets :hover styles — unless source order saves you. */
```

Every new state doubles the selector count. Miss one intersection and you ship a visual bug.

**Tailwind** — state intersections move into conditional className logic:

```tsx
<button className={cn(
  'bg-primary text-white cursor-pointer',
  'hover:bg-primary-hover active:bg-primary-pressed',
  'disabled:bg-surface disabled:text-text-40 disabled:cursor-not-allowed',
  theme === 'danger' && 'bg-danger hover:bg-danger-hover active:bg-danger-pressed',
  theme === 'danger' && disabled && '!bg-surface',
)}>
```

The `theme` branch is runtime JS, not CSS. Intersections like `disabled + hover` need manual `!important` or extra utilities to override correctly.

**Tasty** — each property declares all its states in one map. The engine generates mutually exclusive selectors:

```tsx
const Button = tasty({
  as: 'button',
  styles: {
    fill: {
      '': '#primary',
      ':hover': '#primary-hover',
      ':active': '#primary-pressed',
      'disabled': '#surface',
      'theme=danger': '#danger',
      'theme=danger & :hover': '#danger-hover',
      'theme=danger & :active': '#danger-pressed',
    },
    color: {
      '': '#on-primary',
      'disabled': '#text.40',
    },
    cursor: {
      '': 'pointer',
      'disabled': 'not-allowed',
    },
  },
});
```

`disabled` always wins over `:hover` because Tasty emits negation selectors — no source-order dependence, no manual intersection management, no `!important`.

---

### Tasty vs Panda CSS

Panda is one of the closest comparisons.

Like Tasty, Panda sits closer to the design-system layer than many other tools. It supports typed style authoring, recipes, generated primitives, and a DS-friendly workflow. It is much more than a basic styling helper.

The difference is where each system puts its core idea.

Panda is centered on **typed atomic generation** and static analysis. It gives teams a structured, modern, design-system-friendly engine with a strong build-time story.

Tasty is more centered on:

- a custom DSL
- state mapping
- mutually exclusive resolution
- defining a team-specific styling language

So while both can support serious design-system work, they do not optimize for exactly the same thing:

- **Panda** is closer to a typed styling engine with strong DS ergonomics
- **Tasty** is closer to a design-system style compiler with explicit state semantics

If a team mostly wants typed primitives, recipes, and extracted CSS, Panda may feel more straightforward.

If a team wants to define a more opinionated styling language with stronger control over state logic and rule exclusivity, Tasty has a more specialized angle.

---

### Tasty vs vanilla-extract

vanilla-extract is a lower-level foundation.

It gives teams a zero-runtime TypeScript-native way to generate CSS, plus strong theming primitives and the ability to build architecture on top. It is excellent when a team wants maximum control over structure while staying close to normal CSS semantics.

That last point matters.

With vanilla-extract, styles are still fundamentally governed by **standard CSS behavior**. Ordering, layering, and media-query structure still matter in the usual CSS sense. That is not a flaw; it is simply a different abstraction level.

Tasty is more opinionated.

It behaves less like "TypeScript that outputs CSS" and more like a **state-aware style compiler**. It is designed to encode higher-level styling semantics rather than only expose CSS primitives in typed form.

This also makes Tasty's static mode notable:

- Runtime `tasty()` creates React components with dynamic injection
- `tastyStatic()` with the Babel plugin produces static class name strings with zero runtime overhead
- In static mode, the output is plain CSS + class names, so it can be used with any JavaScript framework — not only React

Runtime features like `styleProps`, sub-element components, and dynamic variants are React-specific. The static path is framework-agnostic.

So the tradeoff is roughly:

- **vanilla-extract**: lower-level, static, explicit, architecture left to the team
- **Tasty**: more opinionated, more state-aware, more language-defining

---

### Tasty vs StyleX

This comparison needs extra precision, because both systems care about predictability, but not in the same way.

StyleX is a compiler-based atomic system with strong guarantees around consistency and composition. Its model is designed to avoid many classic CSS pitfalls such as accidental rule collisions and specificity-driven unpredictability.

That is real value.

But it is still a different kind of guarantee from Tasty's.

StyleX predictability comes from:

- atomic decomposition
- compiler control
- constrained composition
- normalized style behavior

Tasty's differentiator is stronger in a specific area:

- **stateful per-property resolution**
- **mutually exclusive selectors**
- **conflict avoidance by construction**, not only by atomic normalization

So "collision-free atomic CSS" should not be treated as equivalent to Tasty's approach.

A better framing is:

- **StyleX** provides compiler-controlled atomic predictability
- **Tasty** provides mutually exclusive selector resolution for stateful component styling

That makes Tasty especially interesting when the hardest problem is not just style composition, but **complex intersecting component states**.

---

### Tasty vs Stitches (deprecated) / Emotion

Stitches and Emotion are component-first styling systems. (Note: Stitches has been archived and is no longer maintained. It is included here because it remains widely referenced in comparisons.)

They optimize for developer experience, flexible composition, reusable styled primitives, and ergonomic component authoring. For many teams, that is exactly the right abstraction level.

Tasty targets a different question.

It is less focused on "how do I style this component ergonomically right now?" and more focused on:

- what styling language should this design system expose?
- how should states be modeled?
- what should be allowed or constrained?
- how do we keep style behavior deterministic as the system grows?

So while Stitches and Emotion are strong tools for building components, Tasty is more naturally positioned as a **styling substrate for the design system itself**.

That makes it narrower in audience, but deeper in architectural ambition.

Tasty's runtime performance is also validated in enterprise-scale applications where styling overhead is not noticeable in normal UI flows — an important consideration for teams evaluating runtime CSS-in-JS at scale.

---

## Build-time vs runtime

Tasty is not limited to one execution model.

It can be used as a styling system with runtime behavior, but it can also be used as a **fully build-time style compiler** when that is the right fit.

That distinction matters.

In runtime mode, `tasty()` creates React components with dynamic style injection, `styleProps`, sub-element components, and variants. This path is React-specific.

In build-time mode, `tastyStatic()` with the Babel plugin generates plain static class names and CSS files. The output is framework-agnostic — any JavaScript framework can consume the resulting class names and CSS. This makes Tasty usable as the compiler layer underneath a design-system implementation, even outside the React ecosystem.

The tradeoff is that some capabilities — `styleProps`, sub-element components (`<Card.Title>`), dynamic variants — are tied to the runtime path. The static path is best understood as extraction and compilation of the DSL, tokens, and state logic.

This flexibility is one of Tasty's more unusual strengths:

- it can be used as a full authoring/runtime system for React
- or as a static compiler whose output works with any framework

---

## Comparison by abstraction level

Another useful way to think about the ecosystem is by abstraction level.

### Direct styling tools
These are optimized for styling product code directly.

Examples:
- Tailwind CSS
- Emotion
- Stitches (deprecated)

### Typed styling engines
These are optimized for generating CSS with stronger structure and tooling.

Examples:
- Panda CSS
- vanilla-extract
- StyleX

### Design-system language engines
These are optimized for helping a team define its own styling grammar and semantics.

Tasty belongs most naturally here.

That is why generic "feature matrix" comparisons often miss the point. Tasty is not only trying to style elements. It is trying to help define **how a design system talks about styling**.

---

## When Tasty is a strong fit

Tasty makes the most sense when:

- a real design system exists or is being built
- a shared component API is emerging even if the design system is still lightweight
- styling should be governed through a central platform team
- component state logic is complex
- the team wants a house styling language instead of raw CSS-shaped authoring
- tokens, recipes, and sub-elements should be first-class
- deterministic state resolution matters more than minimum abstraction overhead
- the styling engine may need to work as either a runtime tool or a build-time compiler

---

## When another tool may be a better fit

A different tool may be more appropriate when:

- the main goal is styling app code directly with minimal setup and without defining shared styling conventions
- the team prefers a shared framework vocabulary over a custom design-system language
- the complexity of intersecting states is low
- low ceremony matters more than central governance
- the team wants static CSS primitives without a more opinionated state model
- component-level DX is the primary optimization target

---

## Summary

Tasty is not best compared as "another CSS framework."

Its more meaningful comparison point is this:

> Tasty is a styling engine for building a design-system-defined authoring language, with a particular focus on explicit state semantics and mutually exclusive selector resolution.

That puts it in a different category from:

- utility-first tools that optimize for direct authoring
- component-first CSS-in-JS libraries that optimize for DX
- typed static CSS systems that expose lower-level primitives
- atomic compilers that focus on normalized composition

Those systems are all useful, but they optimize for different layers.

Tasty is most compelling when the problem is not just "how do we write styles," but:

> "How do we define a scalable, deterministic styling model for the design system itself?"

---

## Learn more

- [README](../README.md) — overview, quick start, and feature highlights
- [Style DSL](dsl.md) — state maps, tokens, units, extending semantics, keyframes, @property
- [Runtime API](runtime.md) — `tasty()` factory, component props, variants, sub-elements, hooks
- [Style Properties](styles.md) — complete reference for all enhanced style properties
- [Configuration](configuration.md) — tokens, recipes, custom units, style handlers, and TypeScript extensions
- [Zero Runtime (tastyStatic)](tasty-static.md) — build-time static styling with Babel plugin
- [Adoption Guide](adoption.md) — where Tasty sits in the stack, incremental adoption, and what changes for product engineers
- [Server-Side Rendering](ssr.md) — SSR setup for Next.js, Astro, and generic frameworks
