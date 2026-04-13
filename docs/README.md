# Tasty Docs

Tasty is a styling engine for design systems that turns component state into deterministic CSS by compiling state maps into mutually exclusive selectors. Use this hub to choose the right guide once you know whether you are evaluating the model, adopting it in a design system, or implementing reusable, stateful components day to day.

## Start Here

- **New to Tasty**: [Getting Started](getting-started.md) for installation, the first component, optional shared `configure()`, ESLint, editor tooling, and rendering mode selection.
- **Learning the component model**: [Methodology](methodology.md) for root + sub-elements, `styleProps`, tokens, extension, and recommended boundaries between `styles`, `style`, and wrappers.
- **Evaluating the selector model**: [Style rendering pipeline](pipeline.md) for how mutually exclusive selectors make stateful styling deterministic.
- **Evaluating fit**: [Comparison](comparison.md) for tool-selection context, then [Adoption Guide](adoption.md) for audience fit and rollout strategy inside a design system.

## By Role

- **Application developer using an existing design system**: [Getting Started](getting-started.md), then [React API](react-api.md).
- **Design-system author**: [Methodology](methodology.md), [Building a Design System](design-system.md), [Configuration](configuration.md), and [Adoption Guide](adoption.md).
- **Platform or tooling engineer**: [Configuration](configuration.md), [Zero Runtime (tastyStatic)](tasty-static.md), [Server-Side Rendering](ssr.md), and [Debug Utilities](debug.md).

## By Styling Approach

- **React components**: [React API](react-api.md)
- **Zero-runtime / build-time extraction**: [Zero Runtime (tastyStatic)](tasty-static.md)
- **Runtime `tasty()` with server collection and hydration**: [Server-Side Rendering](ssr.md)

## By Task

- **Learn the style language**: [Style DSL](dsl.md)
- **Look up a property handler**: [Style Properties](styles.md)
- **Define tokens, units, recipes, keyframes, or properties globally**: [Configuration](configuration.md)
- **Debug generated CSS or cache behavior**: [Debug Utilities](debug.md)
- **Understand how selector generation works internally**: [Style rendering pipeline](pipeline.md)
- **Understand runtime injection internals**: [Style Injector](injector.md)
