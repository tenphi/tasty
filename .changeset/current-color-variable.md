---
'@tenphi/tasty': patch
---

`#current` resolves through `--current-color` instead of the `currentcolor`
keyword, which lets a token defined as `#current` be faded on Safari 16.4 rather
than 18.

Relative color syntax takes a concrete origin from Safari 16.4, but
`oklch(from currentcolor …)` needs Safari 18. A token defined as `#current` used
to emit the bare keyword, so fading it — `{ '#ink': '#current', fill: '#ink.5' }`
— produced exactly that unsupported form. `#current` now emits
`var(--current-color)`, so the origin is a real color wherever a `color` style
published one.

Three things make the swap invisible everywhere else:

- `--current-color` is registered with `initial-value: currentcolor`. A
  registered `<color>` property keeps the keyword as its computed value and
  resolves it against each element's own color, so an unpublished `#current` is
  indistinguishable from the keyword rather than falling back to `transparent`.
- The `color` style now publishes `--current-color` for **every** color, not only
  a named token. A literal `color: 'red'` has to displace an ancestor's token
  color, or a descendant's `#current` would read the ancestor's.
- `#current.N` keeps `currentcolor` inside its `color-mix()`. The mix composes, so
  a nested fade must read the already-faded color that reaches it — `#current.4`
  with `#current.18` under it still lands at `.072`. It has worked since Safari
  16.2 regardless.

Still uncovered, and unchanged from before: a token defined as `#current` and
faded where no `color` style published the variable — the origin is the keyword
again, so that one case needs Safari 18.

Verified against Safari 16.5.1, 17.3 and 18.4, and the whole chain is pinned by
computed-style tests in a real engine.
