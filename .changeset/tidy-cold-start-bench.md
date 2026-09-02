---
'@tenphi/tasty': patch
---

Add two benchmarks that cover paths nothing measured before: `bench:interaction`
for the steady-state path a loaded application actually spends its time on (mod
flips on mounted elements, styled subtrees opening and closing), and
`bench:cold-start` for page load end to end — bundle transfer, module
compilation, execution, first render and first contentful paint under CDP
network and CPU throttling, against a server-rendered control. Both verify
before timing that every arm renders the same pixels. Results and how to read
them are in `docs/runtime-benchmarks.md`.
