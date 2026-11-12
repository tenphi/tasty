# Tasty styles

## Writing styles

- Before you write or review styles, read `ai-agents.md` from the Tasty docs index.
- Use only the tokens, units, presets, recipes and states the project defines in `tasty.config.ts` or `configure()`.
- Style with `tasty()` and `styles`, not the `style` prop. Colors are `#tokens`, sizes are units (`2x`, `1r`): no hex, `rgb()` or `px`.
- One state map per property, `''` first. Sub-elements are capitalized keys, not nested selectors.

## Checking styles

- To see the CSS that styles produce, run `tasty:styles '<json>' --setup <module that calls configure()>`.
