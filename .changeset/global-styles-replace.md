---
'@tenphi/tasty': patch
---

Fix injected styles never being removed in text-injection mode, so `useGlobalStyles` layered new CSS on top of old CSS instead of replacing it.

`SheetManager` inserted rules two ways — CSSOM, or by appending to `<style>.textContent` — but only ever deleted through CSSOM. In text mode (auto-enabled in test environments, `configure({ forceTextInjection: true })`, and the fallback whenever `styleElement.sheet` is unavailable) every `dispose()` was a silent no-op against the text, so updating a slot appended another copy of the rules while the stale ones kept matching the selector:

```
useGlobalStyles(':root', { fill: '#red' },   { id: 'theme' })
useGlobalStyles(':root', { fill: '#blue' },  { id: 'theme' })
useGlobalStyles(':root', { fill: '#green' }, { id: 'theme' })

// before: three :root rules stacked      after: one :root rule, green
```

Rule texts are now tracked per sheet in text mode and the element is rebuilt on delete, mirroring how raw CSS already worked. This also makes ref-counted cleanup and GC effective in text mode.

Also fixed in the same class of bug:

- `useGlobalStyles` now clears its slot when the new styles render no CSS (previously `{}` left the old rules applied), and its slots are keyed per `root`, so the same selector in two shadow roots no longer evicts the other's rules.
- `useKeyframes` disposed nothing when a named slot's steps changed, leaking an `@keyframes` rule per change and minting `pulse-tk0`, `pulse-tk1`, … instead of reusing the name. A named slot now holds one injection and keeps its name stable.
- The client caches behind `useGlobalStyles`, `useRawCSS`, `useKeyframes` and `useCounterStyle` survived `configure()` replacing the global injector, so their change-detection keys suppressed re-injection into the new sheets and their dispose handles pointed at a dead injector. They are now keyed per injector and per root.
- With an explicit `id`, `useGlobalStyles` and `useRawCSS` were last-write-wins on the client but first-write-wins in SSR/RSC, so an update inside one render pass shipped the old CSS. Slot-keyed entries now replace on the server too; content-hashed keys still only dedup.
