---
'@tenphi/tasty': patch
---

Fix `gridColumns` / `gridRows` emitting invalid CSS for numeric strings.

The track-count shorthand only expanded real numbers, so `gridColumns={3}`
produced `grid-template-columns: minmax(1px, 1fr) minmax(1px, 1fr) minmax(1px, 1fr)`
while `gridColumns="3"` produced `grid-template-columns: 3` — invalid CSS that
browsers drop silently. Every value inside a state map arrives as a string, so
responsive grids were the common way to hit this:

```jsx
// Previously emitted `grid-template-columns: 3` / `: 1` and applied neither.
tasty({ styles: { gridColumns: { '': '3', '@media(w <= 600px)': '1' } } });
```

Digit strings now expand exactly like numbers. Real track lists (`'1fr 2fr'`,
`'repeat(auto-fit, minmax(200px, 1fr))'`, `'0'`) still pass through untouched,
and `gridTemplate` converts each side independently instead of discarding the
side that isn't a count. A negative count no longer throws inside
`String.repeat`.
