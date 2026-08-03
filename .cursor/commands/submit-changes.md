# submit-changes

Submit changes by creating a changeset, committing, and pushing. Follow these steps **in order**.

## 1. Create a changeset

Create a changeset file directly (non-interactive):

- Create a markdown file in `.changeset/` with a random kebab-case name (e.g. `.changeset/bright-dogs-fly.md`).
- Format:

```markdown
---
'@tenphi/tasty': patch
---

Short description of what changed.
```

- Use `patch` for fixes and small changes, `minor` for new features and other more significant changes. Do not use `major` unless explicitly asked.
- The description should be a concise user-facing summary (what changed, not how).

## 2. Typecheck

Run `pnpm typecheck`. **Stop and report the error if it fails** — do not proceed to formatting or committing.

## 3. Lint

Run `pnpm lint`. **Stop and report the error if it fails** — do not proceed to formatting or committing.

## 4. Format code

Run `pnpm format` to format code before committing.

## 5. Build and check bundle size

Run `pnpm build && pnpm size`.

The limits exist to catch **unintended** size jumps — they are a tripwire, not a budget you must squeeze under. A limit sitting just above the current size is normal and expected.

**If `size-limit` fails** (a bundle exceeds its limit):

1. Account for the growth first. If you can't explain it from your own change, don't raise the limit — find out what pulled the extra code in (a stray import, a barrel file, a newly reachable module).
2. Once it's explained, raise the failing limit(s) in the `"size-limit"` array in `package.json`, **rounding up** to the next whole (or half) kB above the reported size — e.g. `53.53 kB` → `54 kB`, `50.63 kB` → `51 kB`. Never set a limit to the exact measurement; that leaves zero headroom and the next unrelated change trips it.
3. Re-run `pnpm size` to confirm it passes, and include the `package.json` change in the commit.

To tell your growth apart from pre-existing drift, measure a clean baseline: `git stash -u && pnpm build && pnpm size`, then restore. Report the per-bundle delta in the PR.

## 6. Commit

Use **Conventional Commits** format:

```
type(scope): short description
```

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`
- Scope is optional — use it when changes are isolated to a specific module (e.g. `fix(parser): ...`).
- Keep the message as short as possible.
- Include the changeset file in the same commit.
- Before 1.0.0 release treat major changes as minor and minor as patches.
- Do not include markdown files that are not in the repo yet and wasn't staged manually by the user.

## 7. Push

- **Never push to `main`**. Verify the current branch first.
- If on `main`, stop and warn the user.
- Push with `git push -u origin HEAD`.
