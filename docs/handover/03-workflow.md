# Workflow

## The owner's preferences (follow these)

- **Confirm before writing code.** Explain the plan first, and **always give a recommended option**.
- Plain, non-technical language. The owner **merges pull requests**, so give exact click steps for GitHub
  (open the link → **Merge pull request** → **Confirm merge**).
- Times in **GMT+5**.
- **No paid services.**
- If a usage limit is hit, **say clearly to take a break**, and how long until it resets if known.
- Never break the code: run every check before pushing. When edits are few and simple, find-and-replace steps are fine.
- When the owner says to finish the current release first, queue new requests for after it (see `04-backlog.md`).

## Branches and pull requests

- One pull request per release, merged by the owner. Merging to `main` builds the Windows release and publishes
  the web version automatically.
- After a merge, restart the working branch from the latest `main` before new work.
- Don't push new work onto a branch whose pull request is still open for a different release; keep it local until
  that one is merged.
- Version: `npm version X.Y.Z --no-git-tag-version` in each release pull request; the release workflow tags it.

## Releases

`.github/workflows/build-installer.yml` (on merge to `main`) builds with `--publish never`, creates the GitHub
release as a draft if missing, uploads `Mimar-Setup-X.exe`, its `.blockmap`, `Mimar-Portable-X.exe` and
`latest.yml`, then publishes it as the latest release. **Nobody should edit or publish a draft release by hand
while it builds.** About 3 minutes. After each merge, check the release has all four files and isn't a draft.

## Checks before every push

```
npm run check            # types, lint, format, unit tests, build
npx playwright test      # browser tests (build + preview on port 4173)
```

- Unit tests: `src/**/*.test.ts` (Vitest, node). Browser tests: `e2e/*.spec.ts`; helpers in `e2e/helpers.ts`
  (`at`, `tool`, `menu`, `openSection`, `ready`). Touch tests use Chromium touch events (`e2e/touch.spec.ts`).
- The welcome screen is skipped in automated browsers unless the URL has `?welcome`.
- For visual checks, a throwaway Playwright spec that saves screenshots works well; delete it before committing.
- `src/store/everyType.test.ts` runs one of every item type through editing, 3D and every export: extend it when
  adding a type.
