---
'@tenphi/tasty': patch
---

Fix named sub-element syntax for vendor-prefixed pseudo-elements.

The selector-affix tokenizer rejected pseudo-elements starting with a hyphen
(`::-webkit-slider-thumb`, `::-moz-range-thumb`) because the pseudo token
pattern required a lowercase letter immediately after `::`. Allow an optional
leading `-` so vendor pseudo-elements work in `$` affixes like
`@::-webkit-slider-thumb`.
