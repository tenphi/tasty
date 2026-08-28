# Runtime Benchmarks

Tasty keeps its performance claims in reproducible benchmarks rather than
combining unlike measurements into one score. The repository measures three
different costs:

1. Style parsing and generation in Node.
2. The React overhead of an empty `tasty({})` wrapper.
3. Cold browser generation and injection compared with equivalent CSS that is
   already on the page.

These are focused microbenchmarks, not page-load or interaction scores. Run
them several times on an otherwise idle machine and use a production profile
to decide whether any cost matters in an application.

## Reproducing the Results

```bash
pnpm bench
pnpm bench:overhead
pnpm bench:injection
```

`pnpm bench` runs the core pipeline benchmarks in Node. The other two commands
use production code paths in headless Chromium. The first checkout may require
`pnpm test:setup` to download Chromium.

Run the Node and browser suites separately so they do not compete for CPU. The
browser timer has 0.1 ms resolution, so both browser benchmarks perform many
matched operations per sample and divide the absolute difference by the number
of elements or rules. Machine load, browser versions, and CPU power will move
the results.

## Core Style Pipeline

The following numbers are single-call throughput measured on an Apple M1 Max
with Node 22:

| Operation                                                   |              ops/sec | Latency (mean) |
| ----------------------------------------------------------- | -------------------: | -------------: |
| `renderStyles` — 5 flat properties (cold)                   |              ~60,000 |         ~17 us |
| `renderStyles` — state map with media/hover/modifier (cold) |              ~18,500 |         ~54 us |
| `renderStyles` — same styles (cached)                       |           ~5,800,000 |       ~0.17 us |
| `parseStateKey` — simple key like `:hover` (cold)           |             ~790,000 |        ~1.3 us |
| `parseStateKey` — complex OR/AND/NOT key (cold)             |             ~140,000 |          ~7 us |
| `parseStateKey` — any key (cached)                          | ~3,400,000–8,300,000 |    ~0.1–0.3 us |
| `parseStyle` — value tokens like `2x 4x` (cold)             |             ~344,000 |        ~2.9 us |
| `parseStyle` — color tokens (cold)                          |             ~567,000 |        ~1.8 us |
| `parseStyle` — any value (cached)                           |          ~15,250,000 |       ~0.07 us |

“Cold” cases use unique inputs to bypass the relevant caches. Cached cases
reuse one input and measure the LRU hot path. Expect roughly ±10% between runs.
These benchmarks do not include React, DOM work, stylesheet injection, style
resolution, layout, or paint.

The benchmark sources are colocated with the code they exercise:
[`pipeline.bench.ts`](../src/pipeline/pipeline.bench.ts),
[`parseStateKey.bench.ts`](../src/pipeline/parseStateKey.bench.ts), and the
parser benchmark files under [`src/parser`](../src/parser).

## Empty Wrapper Overhead

Skipping the style pipeline does not make a `tasty()` component free. Even
`tasty({})` is a React component between its parent and the host element. React
tracks another fiber, and Tasty still processes and forwards the element's
props.

[`tasty-overhead.bench.tsx`](../src/tasty-overhead.bench.tsx) compares 10,000
raw `<div className>` siblings with 10,000 instances of one module-scoped
`tasty({})` component. Both receive the same props, and the benchmark fails if
they do not produce equivalent DOM.

The benchmark uses production React in headless Chromium. The factory is
created and its empty class-name cache is warmed before timing, so factory
creation, style generation, and injection are excluded. A detached container
excludes layout, paint, and stylesheet matching. Every commit is wrapped in
`flushSync`, keeping its synchronous reconciliation and commit inside the
sample. This does not estimate React's concurrent scheduling latency.

On an Apple M3 Pro with React 19.2.4 and Chromium 151, three consecutive runs
produced these ranges:

| Work on 10,000 siblings             | Raw elements |  `tasty({})` | Extra per wrapped element |
| ----------------------------------- | -----------: | -----------: | ------------------------: |
| Mount + remove                      |   4.5–4.9 ms | 14.0–14.9 ms |              0.95–1.00 us |
| Rerender, same host props           |   1.3–1.4 ms | 10.9–11.4 ms |              0.96–1.00 us |
| Rerender, change one host attribute |   2.8–3.4 ms | 15.0–15.7 ms |              1.21–1.27 us |

The useful result is the raw/Tasty time difference divided by 10,000, not the
ratio between the two times. The ratio becomes large because the raw baseline
is tiny. In this synthetic workload, an empty wrapper adds roughly 1 us per
participating element, or 1.2–1.3 us when React also changes a DOM attribute.

This is the floor Tasty consumes when it has no styling job. It is not a
page-level score. Real trees include application components, effects, layout,
paint, and usually far fewer simultaneous styled-element updates. The benchmark
also does not measure retained memory; that requires a matched-tree heap
snapshot experiment with controlled garbage collection.

## Cold Generation and Injection

[`tasty-injection.bench.ts`](../src/tasty-injection.bench.ts) measures the extra
work when Tasty must generate and inject CSS that an otherwise equivalent page
already has. It does not compare different stylesheet insertion techniques.

The benchmark covers two useful workloads:

- **One new rule:** add one rule to an existing stylesheet, append its one
  element, and immediately read its computed style. Each timed sample performs
  50 independent one-rule transactions and reports their total; dividing the
  raw/Tasty difference by 50 produces a stable per-rule result despite
  Chromium's 0.1 ms timer resolution.
- **1,000 new rules together:** generate and insert all 1,000 rules into one
  stylesheet, append all 1,000 elements, then read every computed color without
  another write in between. This gives the browser one style-resolution
  boundary for the group.

For every transaction, the existing-CSS control has the equivalent stylesheet
parsed, adopted, and attached before timing. The runtime root has a Tasty
stylesheet pre-created with an unrelated sentinel rule, but not the measured
rules. Both paths perform the same class assignment, DOM commit, and
computed-style reads. Only the runtime path calls `computeStyles()` and inserts
the new rules.

Preparation and cleanup happen outside the sample timer. Every runtime style
value is unique within a cycle, the relevant caches are cleared between cycles,
and a guard verifies that both paths resolve to the same color. React and the
`tasty()` wrapper are absent so their independently measured costs do not enter
the result. Pre-creating both stylesheets also excludes one-time sheet creation
and adoption from the subtraction.

On an Apple M3 Pro with Chromium 151, three consecutive runs produced these
ranges:

| Workload                                             | CSS already present |  Tasty runtime | Incremental Tasty cost |
| ---------------------------------------------------- | ------------------: | -------------: | ---------------------: |
| One new rule + immediate resolution, per transaction |          2.8–3.3 us | 110.3–113.8 us |         107.3–111.0 us |
| 1,000 new rules + one resolution                     |        1.86–2.06 ms |   9.01–9.98 ms |           7.13–7.92 ms |
| 1,000-rule workload, incremental cost per rule       |                   — |              — |             7.1–7.9 us |

Directly compared, injecting 1,000 rules before one resolution boundary cost
about 66–71 times as much in total as injecting one rule and resolving it—not
1,000 times as much. Its average incremental cost per rule was about 14–16
times lower. This is the same Tasty generation and injection path in both cases;
the group amortizes fixed transaction work and lets the browser resolve all the
stylesheet writes together.

The subtraction is the meaningful result. It includes Tasty's cold style
generation, cache and injector bookkeeping, rule insertion, and any additional
style invalidation exposed by that workload's resolution boundary. It does not
pretend to isolate `insertRule()` from the system that calls it.

This is a deliberately cold workload. Reused styles resolve from cache and do
not inject another rule. Different rule complexity, DOM shape, stylesheet size,
browser, and hardware will change the number. The single-rule and 1,000-rule
results are not interchangeable: the first crosses the injection-to-resolution
boundary once per rule, while the second lets the browser resolve 1,000 writes
together. Because the same resolution pattern is present in each workload's
control, the difference answers the narrower delivery question: how much extra
work did Tasty perform when the same CSS was not already there?

## Reading the Results Together

Do not add all three benchmark numbers to estimate an application blindly.
They describe different paths:

- A stable `tasty()` factory can skip the style pipeline on later renders, but
  its React wrapper still participates in reconciliation.
- A cached style avoids cold parsing and generation and does not insert a new
  rule.
- A genuinely new style pays generation and injection once, then becomes
  reusable.
- Browser style resolution, layout, and paint depend on the actual document and
  need application-level profiling.

The practical optimization target is therefore repeated work: keep style input
stable when possible, reuse generated chunks, and generate CSS at build or
server time when runtime flexibility is unnecessary.
