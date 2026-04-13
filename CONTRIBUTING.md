# Contributing to Tasty

Thanks for your interest in contributing to Tasty! This document covers everything you need to get a development environment running, propose changes, and ship them.

By participating in this project you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to Contribute

- **Report a bug** — open a [GitHub issue](https://github.com/tenphi/tasty/issues) with a minimal reproduction (CodeSandbox/StackBlitz link or a small repo is ideal).
- **Propose a feature** — open an issue describing the use case before opening a PR. For non-trivial changes it's worth discussing the design first to save you time.
- **Improve the docs** — typo fixes, clarifications, and new examples are all welcome. Docs live under `docs/` and the project root.
- **Submit a fix or feature** — see the workflow below.

For security vulnerabilities, do **not** open a public issue — see [SECURITY.md](SECURITY.md).

## Prerequisites

- Node.js **20+**
- pnpm **10+** (the project uses `packageManager: pnpm@10.x` in `package.json`)
- Git

## Local Setup

```bash
git clone https://github.com/tenphi/tasty.git
cd tasty
pnpm install
pnpm build
pnpm test
```

## Project Layout

```
src/                 Source code
  pipeline/          Style rendering pipeline (parse → exclusives → materialize)
  ssr/               Server-side rendering integrations
  static/            Zero-runtime entry (tastyStatic)
  zero/              Babel plugin for build-time extraction
docs/                Public documentation
scripts/             Repo automation (CI helpers)
.changeset/          Pending changelog entries
```

For a deeper map of the codebase, see [`AGENTS.md`](AGENTS.md).

## Common Scripts

| Script | Purpose |
|--------|---------|
| `pnpm build` | Build all entry points with `tsdown` |
| `pnpm test` | Run the test suite once |
| `pnpm test:watch` | Watch mode for tests |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm typecheck` | Run `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | Lint with ESLint |
| `pnpm format` / `pnpm format:check` | Prettier formatting |
| `pnpm hygiene` | Lint + format check + typecheck (CI mirror) |
| `pnpm hygiene:fix` | Auto-fix lint + format, then typecheck |
| `pnpm size` | Run size-limit checks against the built bundles |
| `pnpm bench` | Run pipeline benchmarks |

Run `pnpm hygiene` before pushing — CI runs the same checks.

## Development Workflow

1. **Fork** the repository and create a feature branch from `main`:
   ```bash
   git checkout -b fix/short-description
   ```
2. **Make your change.** Keep PRs focused — one logical change per PR is much easier to review and ship.
3. **Add or update tests.** Bug fixes should include a regression test; features should include coverage for the new behavior. Tests use [Vitest](https://vitest.dev/) and live next to the source they exercise.
4. **Update the docs.** Public-API changes need a corresponding update under `docs/` (and usually the README's relevant section).
5. **Add a changeset** (see below) describing the user-facing change.
6. **Run hygiene + tests:**
   ```bash
   pnpm hygiene
   pnpm test
   ```
7. **Commit and push.** Use clear, present-tense commit messages (`fix: …`, `feat: …`, `docs: …`). Conventional Commits aren't enforced, but they help.
8. **Open a pull request** against `main`. Describe the motivation, the change, and any trade-offs. Link the related issue if there is one.

## Changesets

Tasty uses [Changesets](https://github.com/changesets/changesets) to manage versions and the changelog. Every PR with a user-visible change must include a changeset:

```bash
pnpm changeset
```

The CLI walks you through selecting the bump type (`patch`, `minor`, `major`) and writing a short summary. The summary becomes the changelog entry, so write it for the *consumer*, not the implementer:

> Fix overlapping selectors when default and custom-state token values coincide but other state values differ.

Internal-only changes (refactors, CI tweaks, doc-only updates) don't need a changeset — note that in the PR description.

## Coding Guidelines

- **TypeScript first.** Keep the public API fully typed; prefer narrow, descriptive types over `any`.
- **No hooks in the core.** `tasty()`, style functions, and SSR helpers are intentionally hook-free so they work in React Server Components. Don't introduce React-only runtime dependencies in `src/` outside the React entry points.
- **Determinism.** The selector model relies on mutually exclusive conditions. When touching the pipeline, add tests that exercise selector exclusivity, not just snapshot output.
- **Performance.** The pipeline has multi-level caches (parser, state-key, simplify, condition). When changing hot paths, run `pnpm bench` before and after and include the numbers in the PR.
- **Bundle size.** `pnpm size` enforces per-entry-point limits. If a change increases bundle size, justify it in the PR.
- **Prettier + ESLint.** No style debates — let the tools format the code.

## Documentation Style

- Audience-first headings (the docs hub at `docs/README.md` is organized by role and task).
- Short, real-world code examples over exhaustive enumerations.
- Link to the relevant source files when describing internals.

## Testing Tips

- Unit-style tests live alongside the code they cover (`*.test.ts(x)`).
- Pipeline behavior is best tested at the `renderStyles` boundary so you catch interactions across stages.
- For SSR/RSC behavior, the integration tests under `src/ssr/` are the source of truth.

## Reviewing Pull Requests

Reviewers look for:

- A clear description of motivation and scope
- Tests that fail without the change and pass with it
- Updated docs and a changeset (when user-visible)
- Green CI: lint, typecheck, tests, build, size-limit
- No unrelated changes (formatting drift, dependency churn, etc.)

PRs that touch the pipeline or SSR collectors will usually take an extra round of review — that's expected.

## Releases

Releases are automated via the [release workflow](.github/workflows/release.yml):

- Merging changesets to `main` opens a **Version Packages** PR that bumps versions and rewrites `CHANGELOG.md`.
- Merging that PR publishes to npm via OIDC trusted publishing and creates a GitHub Release.
- Snapshot releases are published from PRs under the `pr_<number>` dist-tag for early testing.

Maintainers are responsible for merging the Version Packages PR — contributors don't need to do anything beyond adding changesets.

## Getting Help

- Open a [GitHub Discussion](https://github.com/tenphi/tasty/discussions) for design questions or general help.
- Open an [issue](https://github.com/tenphi/tasty/issues) for bugs or concrete proposals.

Thanks again — every contribution helps make Tasty better.
