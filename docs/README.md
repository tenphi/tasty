# Tasty Docs

Tasty is CSS-in-JS for React design systems. You describe hover, disabled, variants, themes, responsive behavior, and other conditions as state maps; Tasty compiles them so one branch wins without specificity fights or source-order surprises.

Use this hub to move from the core idea to a working component, then into design-system patterns or API reference as needed.

## Start Here

- **Understand why**: [Introduction](../README.md) for the problem, the state-map model, and the product overview.
- **Try it**: [Getting Started](getting-started.md) to build a stateful component, add shared configuration, and choose a rendering mode.
- **Build a component system**: [Methodology](methodology.md) for root + sub-elements, typed public APIs, tokens, and extension patterns; then [Building a Design System](design-system.md).
- **Evaluate or adopt it**: [Comparison](comparison.md) for tool-selection context and [Adoption Guide](adoption.md) for an incremental rollout.
- **Understand the compiler**: [Style rendering pipeline](pipeline.md) for how state maps become mutually exclusive selectors.

## By Role

- **Application developer using an existing design system**: [Getting Started](getting-started.md), then [React API](react-api.md).
- **Design-system author**: [Methodology](methodology.md), [Building a Design System](design-system.md), [Configuration](configuration.md), and [Adoption Guide](adoption.md).
- **Platform or tooling engineer**: [Configuration](configuration.md), [Build-Time Extraction (`tastyStatic`)](tasty-static.md), [Server-Side Rendering](ssr.md), and [Debug Utilities](debug.md).

## By Styling Approach

- **React components**: [React API](react-api.md)
- **Zero-client-runtime React with `tasty()`**: [Server-Side Rendering](ssr.md), especially the static Astro integration
- **Build-time extraction with `tastyStatic()`**: [Build-Time Extraction](tasty-static.md)
- **Hydrated `tasty()` with server collection**: [Server-Side Rendering](ssr.md)
- **Upgrading from v2**: [Migration Guide (v2 → v3)](migration-v3.md)

## By Task

- **Learn the style language**: [Style DSL](dsl.md)
- **Brief an AI agent (or yourself) on writing correct styles**: [Style Rules for AI Agents](ai-agents.md)
- **Look up a property handler**: [Style Properties](styles.md)
- **Define tokens, units, recipes, keyframes, properties, functions, or polyfills globally**: [Configuration](configuration.md)
- **Extend Tasty with a plugin, custom handler, or custom prop**: [Plugins & Extension Points](plugins.md)
- **Debug generated CSS or cache behavior**: [Debug Utilities](debug.md)
- **Understand how selector generation works internally**: [Style rendering pipeline](pipeline.md)
- **Understand runtime injection internals**: [Style Injector](injector.md)
