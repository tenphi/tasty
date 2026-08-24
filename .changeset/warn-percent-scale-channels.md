---
'@tenphi/tasty': patch
---

Warn when a color function's channel arrives on the percentage scale without its
`%`.

`okhsl()` / `okhst()` and any `createColorFunc()` plugin read a unitless channel
as the factor it looks like, so `okhsl(280 .8 .52)` and `okhsl(280 80% 52%)` are
the same color. Dropping the `%` therefore lands `80` in a 0-1 slot, where it
clamps to full saturation and renders as **white** — a plausible-looking color
rather than an obvious mistake.

A unitless channel above 1 cannot be a factor, so it now warns once per function
in development, naming the offending values. `1` itself is a legitimate factor
and stays silent, and the emitted color is unchanged.

Found while checking whether the producer/writer scale mismatch fixed in
[glaze#94](https://github.com/tenphi/glaze/pull/94) applied here. It does not —
`createColorFunc` already takes factors and scales to percentages on output, and
every other converter boundary (`hslStringToRgb`, `oklchStringToRgb`,
`okhstToSrgb`'s `fromTone(t * 100)`) was verified correct — but the silent
clamp on misscaled input was the same footgun.
