# Runtime Benchmarks

Tasty keeps its performance claims in reproducible benchmarks rather than
combining unlike measurements into one score. The repository measures five
different costs:

1. Style parsing and generation in Node.
2. The React overhead of an empty `tasty({})` wrapper.
3. Cold browser generation and injection compared with equivalent CSS that is
   already on the page.
4. The steady-state interaction path — mod flips and styled subtrees opening
   and closing after the page has loaded.
5. Page-load cold start: network, module compilation, execution and first
   paint, end to end in a throttled browser.

The first four are focused microbenchmarks, not page-level scores. The fifth is
a page-level measurement and is the only one that answers "what does a visitor
wait for". Run them several times on an otherwise idle machine and use a
production profile to decide whether any cost matters in an application.

## Reproducing the Results

```bash
pnpm bench
pnpm bench:overhead
pnpm bench:injection
pnpm bench:interaction
pnpm bench:cold-start
```

`pnpm bench` runs the core pipeline benchmarks in Node. The rest use production
code paths in headless Chromium. The first checkout may require
`pnpm test:setup` to download Chromium, and `pnpm bench:cold-start` needs a
current `dist/` — run `pnpm build` first.

Run the Node and browser suites separately so they do not compete for CPU. The
browser timer has 0.1 ms resolution, so the browser benchmarks perform many
matched operations per sample and divide the absolute difference by the number
of elements, rules or interactions. Machine load, browser versions, and CPU
power will move the results — on a loaded machine the absolute columns drift
several percent while the raw/Tasty delta holds, so read the delta.

**On a laptop, check the power state first.** Low Power Mode caps CPU frequency,
and it is the single largest source of error here — larger than background load.
Measured on the machine below, running on battery with Low Power Mode enabled
made every one of the 53 Node cases slower, by a median of 26%, and halving the
background load recovered only 3 points of that. A frequency cap scales every
case by roughly the same factor, so it does not look like noise; it looks like a
uniformly slower library. Verify before trusting a run:

```bash
pmset -g ps | head -2      # want 'AC Power'
pmset -g | grep -i lowpowermode   # want 0
```

## Core Style Pipeline

Single-call throughput, three consecutive runs on an Apple M3 Pro with Node
24.18.0 on AC power:

| Operation                                                   |               ops/sec | Latency (mean) |
| ----------------------------------------------------------- | --------------------: | -------------: |
| `renderStyles` — 5 flat properties (cold)                   |       143,000–158,000 |     6.3–7.0 us |
| `renderStyles` — state map with media/hover/modifier (cold) |         31,000–36,000 |       28–32 us |
| `renderStyles` — OR state map across contexts (cold)        |         13,000–14,000 |       71–76 us |
| `renderStyles` — same styles (cached)                       |  9,830,000–10,420,000 |       ~0.10 us |
| `parseStateKey` — simple key like `:hover` (cold)           |   1,910,000–1,980,000 |       ~0.50 us |
| `parseStateKey` — value modifier key (cold)                 |   1,120,000–1,160,000 |       ~0.90 us |
| `parseStateKey` — complex OR/AND/NOT key (cold)             |       341,000–357,000 |     2.8–2.9 us |
| `parseStateKey` — any key (cached)                          |  4,900,000–16,530,000 |    0.10–0.20 us |
| `parseStyle` — value tokens like `2x 4x` (cold)             |       575,000–605,000 |       ~1.7 us |
| `parseStyle` — color tokens (cold)                          |   1,160,000–1,240,000 |    0.80–0.90 us |
| `parseStyle` — layered functions (cold)                     |       175,000–184,000 |     5.4–5.7 us |
| `parseStyle` — any value (cached)                           | 29,500,000–30,750,000 |      <0.05 us |

“Cold” cases use unique inputs to bypass the relevant caches. Cached cases
reuse one input and measure the LRU hot path. Run-to-run spread on an idle
machine was 1–7% for most cases, rising to 10–16% for the two `renderStyles`
cold cases. These benchmarks do not include React, DOM work, stylesheet
injection, style resolution, layout, or paint.

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

On an Apple M3 Pro with React 19.2.8 and Chromium 151, three consecutive runs
produced these ranges:

| Work on 10,000 siblings             | Raw elements | `tasty({})` | Extra per wrapped element |
| ----------------------------------- | -----------: | ----------: | ------------------------: |
| Mount + remove                      |   4.2–4.3 ms |  9.2–9.7 ms |              0.50–0.54 us |
| Rerender, same host props           |   1.2–1.3 ms |  6.3–6.5 ms |              0.51–0.52 us |
| Rerender, change one host attribute |   2.5–2.7 ms | 11.2–11.6 ms |             0.86–0.91 us |

The useful result is the raw/Tasty time difference divided by 10,000, not the
ratio between the two times. The ratio becomes large because the raw baseline
is tiny. In this synthetic workload, an empty wrapper adds roughly 0.5 us per
participating element, or ~0.9 us when React also changes a DOM attribute.

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
| One new rule + immediate resolution, per transaction |          2.6–3.0 us | 102.8–107.0 us |         100.3–104.3 us |
| 1,000 new rules + one resolution                     |        1.69–1.79 ms |   7.42–7.67 ms |           5.73–5.94 ms |
| 1,000-rule workload, incremental cost per rule       |                   — |              — |             5.7–5.9 us |

Directly compared, injecting 1,000 rules before one resolution boundary cost
about 55–59 times as much in total as injecting one rule and resolving it—not
1,000 times as much. Its average incremental cost per rule was about 17–18
times lower. This is the same Tasty generation and injection path in both cases;
the group amortizes fixed transaction work and lets the browser resolve all the
stylesheet writes together.

The per-transaction single-rule figure is the one number here that engine work
does not move: it is dominated by the browser's injection-to-resolution
boundary, which is crossed once per rule regardless of how fast generation is.
The 1,000-rule column, where Tasty's own generation dominates, is where engine
changes show up.

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

## Steady-State Interaction

The benchmarks above measure mounting and whole-tree updates. A running
application spends most of its time on neither. It flips mods — hovered,
pressed, selected, expanded — on elements whose styles never change, one
element at a time, and it mounts and unmounts small styled subtrees as menus
and dialogs open. Both paths go through the state-map and ref-counting
machinery rather than the parser, so a regression in them is invisible to every
other benchmark here.

[`tasty-interaction.bench.tsx`](../src/tasty-interaction.bench.tsx) pairs each
case with a raw-DOM equivalent driven by a hand-written stylesheet that
produces the same computed color and background in both states. The benchmark
fails if either arm resolves to anything else, so an arm that quietly rendered
unstyled elements cannot report a flattering number.

Each leaf owns its own `useState`, which is what keeps a single-element
interaction single: re-rendering the root to flip one row would time the whole
tree. One toggle is far below Chromium's 0.1 ms timer resolution, so a sample
flips a 100-element tree three times over — 300 commits — and the churn case
performs 20 open/close cycles. Divide the raw/Tasty difference by those counts.

Two things had to be sized deliberately, and both are the difference between a
readable number and noise:

- **The tree is small (100 elements), not large.** React locates a leaf's
  pending update by walking the sibling list, so in a 1,000-element tree a
  single-element update costs ~68 us of traversal — identical in both arms and
  an order of magnitude above anything the styling layer contributes.
- **The sample resolves style once, not once per flip.** Forcing a recalc
  between flips costs ~70 us in both arms, which buries the delta the same way.
  The browser's side of an interaction is real, but it is the browser's;
  resolution boundaries are what the injection benchmark above measures.

The contract check also reads the injected CSS **before** any toggle and fails
if the hovered rule is not already there. That a style map's states all ship in
one chunk on first render is the premise of this case; if the hovered rule
arrived lazily, the first sample would be timing injection.

On an Apple M3 Pro with React 19.2.8 and Chromium 151, three consecutive runs:

| Workload                                             | Raw elements | Tasty mods |           Extra per unit |
| ---------------------------------------------------- | -----------: | ---------: | -----------------------: |
| 300 single-element mod toggles in a 100-element tree |   1.7–1.8 ms | 2.0–2.1 ms | 1.2–1.3 us / interaction |
| 20 mount + unmount cycles of a 200-element subtree    |   5.2–5.4 ms | 8.3–8.6 ms |   0.77–0.81 us / element |

The absolute columns move several percent with machine load; the delta between
the arms is the stable quantity, so read that rather than either column.

Two things are worth reading out of this.

A mod flip on an already-mounted element costs about 1.2 us. The CSS for both
states already exists — Tasty emits every state of a style map in one chunk on
first render — so both arms perform the same commit, and what is left is
Tasty's props and mod handling. That is the same order as the ~0.5 us empty
wrapper measured above, which is most of where it comes from.

Subtree churn is not about styling at all. Its ~0.8 us per element sits right
on the empty-wrapper mount cost, because the styles are already cached:
reopening a menu re-pays the React wrapper, not the style pipeline.

## Page-Load Cold Start

Every benchmark above deliberately excludes the network, module compilation and
the first render. [`scripts/cold-start`](../scripts/cold-start) measures exactly
those: what a visitor waits for between requesting a page and seeing styled
content, in a real Chromium under CDP network and CPU throttling.

Three pages render the same 50 styled components and are verified, before any
timing, to produce the same 50 elements at the same computed color:

- **baseline** — the components server-rendered: identical markup, identical
  class names, a linked stylesheet, and no Tasty on the page. Every other
  column is a delta against this one.
- **runtime** — Tasty generates the CSS in the browser, as a client-rendered
  application does. The run asserts it really did (69 rules generated).
- **prewarm** — the same, after one throwaway `computeStyles()` against a
  detached root before the first component renders.

Each cell is the median of 5 uncached loads in a fresh browser context. The run
ends at the first contentful paint, observed through a `PerformanceObserver`
rather than counted in animation frames — `requestAnimationFrame` fires before
paint, so a page that commits fast can reach its second frame with nothing
painted yet.

Two things about the payload decide whether this measures a deployment or a
straw man, so both are enforced rather than assumed:

- **Assets are served brotli-compressed**, the way a static host serves them.
  The bundle is 51.5 KB on the wire and 180 KB decoded; putting the decoded
  bytes on a 1.6 Mbps link would add ~700 ms and charge it to Tasty. The run
  reads `encodedBodySize` back out of resource timing and fails if what
  crossed the wire is not the compressed size the table reports.
- **The bundle is built from what the page imports** (`tasty`, `configure`,
  `computeStyles`, `tastyDebug`), so it is tree-shaken as an application's
  would be. Re-exporting the whole library adds ~4 KB brotli of code no page
  here calls.

On an Apple M3 Pro with React 19.2.8 and Chromium 151, first contentful paint,
median of three full runs of the matrix:

| Link / CPU            | baseline | runtime | prewarm | Tasty's cost | noise |
| --------------------- | -------: | ------: | ------: | -----------: | ----: |
| No throttling, 1x     |    36 ms |   40 ms |   40 ms |        +4 ms |  0 ms |
| Fast 4G, 1x           |   628 ms |  672 ms |  688 ms |       +44 ms | 20 ms |
| Slow 4G, 1x           |  2044 ms | 2308 ms | 2308 ms |      +264 ms | 24 ms |
| No throttling, 4x CPU |   112 ms |  144 ms |  144 ms |       +32 ms | 16 ms |
| Fast 4G, 4x CPU       |   656 ms |  728 ms |  736 ms |       +72 ms |  4 ms |
| Slow 4G, 4x CPU       |  2064 ms | 2360 ms | 2360 ms |      +296 ms |  8 ms |

The `noise` column is not an estimate. The `baseline` page contains no Tasty at
all, so its three samples should be identical; the spread they actually show is
this cell's measurement error, and it applies to the other columns too.

Read that column before any other. Only the Slow 4G rows carry a cost an order
of magnitude above their own noise. The unthrottled 1x row (+4 ms) means "too
small to measure this way", not "4 ms". And a single run is genuinely not
enough here: taken alone, the first of these three runs put Fast 4G 1x at
+72 ms, which the median over three corrects to +44 ms.

For the same reason, `prewarm` landing above `runtime` in the Fast 4G 1x row is
noise, not a cost — the two modes differ only in when the engine compiles, and
that difference is measured in the phase table below, not in FCP.

**The cost is the bundle, not the work.** On Slow 4G the extra transfer alone
accounts for 263 ms of the 264 ms FCP delta — effectively all of it. Everything
Tasty then *does* is small by comparison (median of three runs):

| Phase (Slow 4G, 1x)     | baseline | runtime | prewarm |
| ----------------------- | -------: | ------: | ------: |
| js+css transfer         |  1423 ms | 1686 ms | 1690 ms |
| module compile (shared) |   3.5 ms |  3.3 ms |  3.0 ms |
| tasty top-level execute |        — |  1.2 ms |  0.8 ms |
| `configure()`           |        — |  0.6 ms |  0.4 ms |
| prewarm                 |        — |       — |  3.3 ms |
| render 1st component    |   3.0 ms |  7.3 ms |  1.9 ms |
| render 49 more          |   1.3 ms |  5.2 ms |  3.8 ms |

Importing Tasty costs about 1 ms of top-level execution; `configure()` costs
half of one. The rest of the CPU delta — about 10 ms for 50 components — is
generation and injection, which is the cost the injection benchmark isolates.

One asymmetry is worth naming: the control links a render-blocking stylesheet
and the runtime modes have none, so the control's first paint waits for CSS the
runtime modes never request. That is the real difference between the two
delivery models, not a thumb on the scale, but it means the FCP delta is not
purely "what Tasty costs to execute".

**Prewarming moves the wake-up, it does not remove it.** The first styled render
is ~5.4 ms more expensive than the ones after it, because that is when the
engine's deferred payload is actually compiled. A throwaway `computeStyles()`
against a detached root pays it early: `render 1st` drops from 7.3 ms to
1.9 ms. The prewarm itself costs 3.3 ms, so the work is moved rather than
removed and FCP does not move. It is worth doing only when something else can
overlap it, or when the first render is on a latency-critical path and the page
has idle time before it.

**Retained heap.** After a forced collection, the runtime page holds about
985 KB more than the control (2,605 KB vs 1,619 KB) for 50 components — the
parser caches, the chunk cache, the injector's registry and the generated CSS.
The control is not zero either; most of its 1.6 MB is React and the DOM.

CPU throttling changes which line moves. At 4x, module compilation of the
larger graph becomes visible (2.6 ms → 19 ms) where at 1x it is free: V8
pre-parses at import and compiles lazily, so a slower CPU pays for code the
faster one never fully compiled. Transfer numbers from the unthrottled cells
are not worth reading — with no emulated link, resource timings are scheduling
jitter.

## Reading the Results Together

Do not add the microbenchmark numbers together to estimate an application
blindly. They describe different paths:

- A stable `tasty()` factory can skip the style pipeline on later renders, but
  its React wrapper still participates in reconciliation.
- A cached style avoids cold parsing and generation and does not insert a new
  rule.
- A genuinely new style pays generation and injection once, then becomes
  reusable.
- A mod flip on an already-styled element pays neither; it is a class-name
  change.
- Browser style resolution, layout, and paint depend on the actual document and
  need application-level profiling.

The cold-start measurement is the one that puts the rest in proportion. On a
slow connection, nearly all of Tasty's page-load cost is transferring the
library — 263 ms of a 264 ms delta — while the generation and injection the
microbenchmarks obsess over is ~10 ms for 50 components. Bundle size is
therefore the lever with the largest effect on first paint, and the runtime
levers matter for what happens after it.

The practical optimization target is therefore repeated work: keep style input
stable when possible, reuse generated chunks, and generate CSS at build or
server time when runtime flexibility is unnecessary.
