---
'@tenphi/tasty': patch
---

`#current` compiles to the `currentcolor` keyword again, as it did before 3.3.0.

3.3.0 made it emit `var(--current-color)` so that a token *defined* as `#current`
could be faded on Safari 16.4 rather than 18 — relative color syntax takes a
concrete origin from 16.4, while `oklch(from currentcolor …)` needs 18. That
traded away the property `#current` exists for.

The keyword resolves against the element that reads it, so a `#current` under an
ancestor that faded its own color reads the *faded* color. A ramp built on
`#current` depends on it: the disabled state is expressed once, in `color`, and
everything painted from `#current` below fades with it. The variable cannot do
that — a faded color is deliberately never published into `--current-color`
(resolving it a second time one level down would fade it twice), so a reader saw
through to the unfaded color above and rendered at full strength.

The variable itself stays, and keeps both improvements 3.3.0 brought it. It
carries the inherited color for consumers that need it as a color rather than as
the keyword — hand-authored CSS, or anywhere the keyword will not do. Read it as
`$current-color`:

- Every color publishes it, not only a named token, so a reader below takes the
  nearest `color` rather than the nearest *token* color.
- It is registered with `initial-value: currentcolor`, so where nothing published
  it a reader still resolves against its own element.

The case 3.3.0 set out to fix goes back to needing Safari 18: a token defined as
`#current` and then faded — `{ '#ink': '#current', fill: '#ink.5' }` — gives
relative color syntax a `currentcolor` origin. Put the fade in the token instead,
`{ '#ink': '#current.5' }`, and it goes through `color-mix()` on the Safari 16.2
floor.
