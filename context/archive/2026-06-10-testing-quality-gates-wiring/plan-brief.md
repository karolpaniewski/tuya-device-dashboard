# Quality Gates Wiring — Plan Brief

> Full plan: `context/changes/testing-quality-gates-wiring/plan.md`
> Research: `context/changes/testing-quality-gates-wiring/research.md`

## What & Why

Close rollout Phase 4: fix 6 Biome lint warnings, add a composite `ci` script, and document the post-edit hook recipe. All three gate commands already pass locally — this plan cleans up warning noise and creates the stable entry point the GitHub Actions YAML skill (Module 1 Lesson 5) needs to wire CI.

## Starting Point

Three gate commands pass locally (`npm run check` exit 0 / 6 warnings, `npm run typecheck` exit 0, `npm test` 30/30). No composite `ci` script exists, no `.github/` directory, and `test-plan.md §6.6` is an empty placeholder. The prior three rollout phases only established local commands — no CI was ever wired.

## Desired End State

`npm run ci` chains lint → typecheck → tests → build and exits 0. `npm run check` exits 0 with zero warnings. `test-plan.md §5` accurately states which gates are locally confirmed vs. CI-pending, and `§6.6` contains the exact recipe for configuring the post-edit Vitest hook.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| `ci` script includes `next build` | Yes | `next build` catches App Router type errors that `tsc --noEmit` misses | Plan |
| Biome warning fix method | `biome-ignore` comments with explanation | Suppression-with-reason preserves semantics and documents the invariant; auto-fix (`?.`) breaks test assertion semantics | Research |
| §5 Quality Gates update | Add "local ✔; CI YAML pending" footnotes | Accuracy — §5 currently says "required in CI" but CI doesn't exist | Plan |

## Scope

**In scope:**
- Fix 6 `noNonNullAssertion` warnings via `biome-ignore` comments in 3 files
- Add `"ci"` script to `package.json` (4-gate chain: check, typecheck, test, build)
- Update `test-plan.md §5` (two status footnotes)
- Add `test-plan.md §6.6` post-edit hook recipe with `.claude/settings.json` snippet
- Mark `test-plan.md §3` Phase 4 as `complete`

**Out of scope:**
- `.github/workflows/*.yml` (Module 1 Lesson 5)
- Hardware smoke gate (blocked on S-04)
- Husky, lint-staged, or pre-commit hooks
- `.nvmrc` / Node version pinning (CI YAML concern)

## Architecture / Approach

Pure tooling + documentation: no production logic changes. Phase 1 clears warning noise so CI starts clean. Phase 2 adds the stable `ci` entry point. Phase 3 updates the living test-plan.md contract to reflect what shipped. All changes are independently verifiable via `npm run check`, `npm run ci`, and visual inspection of test-plan.md.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Fix Biome warnings | `npm run check` exits 0 with zero warnings | Auto-fix via `biome --write` would break test assertions — must fix manually |
| 2. Add `ci` script | `npm run ci` exits 0 through all four gates | `next build` fails if `.env` is absent locally |
| 3. Update test-plan.md | §5 accuracy, §6.6 hook recipe, §3 Phase 4 complete | Markdown table formatting — one misplaced pipe breaks the table |

**Prerequisites:** `.env` must exist locally for `npm run ci` to pass Phase 2.
**Estimated effort:** ~1 session; all three phases are mechanical with no design unknowns.

## Open Risks & Assumptions

- `next build` passes locally — not verified during planning (only `check`, `typecheck`, `test` were run). Phase 2 success criteria require it; if it fails due to env setup, fix `.env` before proceeding.
- CI env var injection is Module 1 Lesson 5's responsibility — this plan does not address it.

## Success Criteria (Summary)

- `npm run check` exits 0 with **zero** warnings
- `npm run ci` exits 0 end-to-end
- `test-plan.md` §3 Phase 4 reads `complete`
