---
'@tenphi/tasty': patch
---

Fix three ways a `$name` reference could silently do nothing.

**A `-color`-suffixed reference is no longer confined to color slots.** The suffix
is the only hint the parser has about an untyped reference, and it used to decide
the bucket outright: the reference went to `colors` alone, so a handler reading
`values` found nothing and emitted its own default instead. Across 35 style props
the authored value simply vanished:

```jsx
// Previously `padding: var(--gap)` — the reference was replaced by the default.
tasty({ styles: { padding: '$brand-color' } });
// Now `padding: var(--brand-color)`.
```

Such a reference is now filed under both buckets (`Bucket.ColorValue`), so a color
slot and a value slot can each read it, and it still appears once in `all`.
`border` / `outline` place it once rather than in both the style and color slots.

**Custom-property names keep their case.** The parser lowercased its whole input
before classifying, which folded custom-property names too — and those are
case-sensitive in CSS. A camelCase name could never resolve, because the token
definition emitted `--myVar` while the reference asked for `var(--myvar)`:

```jsx
// Previously `--myVar: 16px; padding: var(--myvar);` — two different properties.
tasty({ styles: { $myVar: '2x', padding: '$myVar' } });
// Now both sides agree on --myVar.
```

Identifier bodies (`$name`, `$$name`, `#name`, `##name`) now keep their case, and
every place that derives a CSS name from one applies the same rule, so definitions
and references always agree. A leading capital is not a supported name and folds
rather than being kebab-cased — `$Foo` → `--foo`, `#Purple` → `--purple-color` —
so names should start lowercase. Everything else still folds exactly as before:
keywords, units, function names, and hex literals (`#FF0000` is a color, not a
name). Predefined-token _lookup_ stays case-insensitive; only the emitted name
preserves case.

**A reference where a token name is expected now warns instead of emitting dead
CSS.** `preset` and `transition` interpolate their input into a custom-property
name, which cannot be indirected through a reference — the name is needed at build
time, and a reference only resolves in the browser. `preset: '$my-preset'` built
`font-size: var(--var(--my-preset)-font-size, …)`: syntactically valid, unusable as
a name, dropped by the browser without a word. `preset` now falls back to
`inherit` (what an absent preset resolves to) and `transition` skips the entry,
both warning once in development. Value slots are unaffected —
`transition: 'fill $my-duration'` still works.

Size budgets are raised by 0.25–0.5 kB per entry to fit the added logic (~250 B
brotlied); every entry keeps headroom.
