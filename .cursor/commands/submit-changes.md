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

- Use `patch` for fixes and small changes, `minor` for new features or non-breaking API changes, `major` for breaking changes.
- The description should be a concise user-facing summary (what changed, not how).

## 2. Typecheck

Run `pnpm typecheck`. **Stop and report the error if it fails** — do not proceed to formatting or committing.

## 3. Format code

Run `pnpm format` to format code before committing.

## 4. Commit

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

## 5. Push

- **Never push to `main`**. Verify the current branch first.
- If on `main`, stop and warn the user.
- Push with `git push -u origin HEAD`.
