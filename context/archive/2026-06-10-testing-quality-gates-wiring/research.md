---
date: 2026-06-10T10:36:00+02:00
researcher: Claude Sonnet 4.6
git_commit: c3d09c6532333052f71faa0929e02f8efd8530ab
branch: main
repository: tuya-device-dashboard
topic: "Quality gates wiring — Phase 4 grounding"
tags: [research, quality-gates, ci, lint, typecheck, vitest, github-actions]
status: complete
last_updated: 2026-06-10
last_updated_by: Claude Sonnet 4.6
---

# Research: Quality gates wiring — Phase 4 grounding

**Date**: 2026-06-10T10:36:00+02:00
**Researcher**: Claude Sonnet 4.6
**Git Commit**: c3d09c6532333052f71faa0929e02f8efd8530ab
**Branch**: main
**Repository**: tuya-device-dashboard

## Research Question

Ground rollout Phase 4 of `context/foundation/test-plan.md`. Understand what CI/quality gate infrastructure currently exists vs. what needs to be wired to make lint + typecheck + Vitest required gates on every PR. Naming and wiring only — no YAML authoring (per CLAUDE.md Module 3 lesson boundary: CI/CD YAML is Module 1 Lesson 5 / Module 2 Lesson 5).

## Summary

**All three gate commands exist and pass cleanly locally. No CI infrastructure exists yet.** The scope of Phase 4 is precisely bounded:

1. **Add a composite `ci` script** to `package.json` so the full gate sequence has a single entrypoint when CI YAML is eventually authored.
2. **Fix 6 Biome `noNonNullAssertion` warnings** in 3 files so `npm run check` produces zero-warning output — warnings exit 0 today but producing warnings in CI is ambiguous hygiene.
3. **Document the post-edit hook** in `§6` cookbook (test-plan §5 marks this "recommended after §3 Phase 4").
4. **Update §5 Quality Gates** to reflect that the three required gates are now confirmed wired locally and the post-edit hook recommendation is documented.

Nothing in Phase 4 touches production application code. Every change is tooling configuration or documentation.

---

## Detailed Findings

### 1. CI/CD infrastructure — gap analysis

**No `.github/` directory exists.** No GitHub Actions workflows, no dependabot, no branch protection rules, no pre-commit hooks (no `.husky/`, no `lint-staged` in `package.json`).

Tech stack explicitly declares the intended provider:

- `context/foundation/tech-stack.md:9` — `ci_provider: github-actions`
- `context/foundation/tech-stack.md:10` — `ci_default_flow: auto-deploy-on-merge`

CLAUDE.md (Module 3) draws a hard lesson boundary: **do not author CI/CD YAML in this lesson**. Phase 4 prepares the ground (confirmed commands, composite script, documentation) so the GitHub Actions skill lands on a clean surface. Writing `.github/workflows/*.yml` is not in scope.

### 2. Build tooling & scripts

**File:** `package.json:6–21`

| Script | Command | CI-relevant? | Current exit code |
|--------|---------|---|---|
| `check` | `biome check .` | Yes — lint gate | 0 (6 warnings, no errors) |
| `typecheck` | `tsc --noEmit` | Yes — type gate | 0 (clean) |
| `test` | `vitest run` | Yes — unit/integration gate | 0 (30/30 passing) |
| `build` | `next build` | Optional — production verification | not tested |
| `check:write` | `biome check --write .` | No — auto-fix, not a gate | — |
| `check:unsafe` | `biome check --write --unsafe .` | No | — |

**No composite `ci` script exists.** A future GitHub Actions workflow would need to call these three scripts individually, or a single `npm run ci` entry point can be added now to make that trivial.

**Linter:** Biome v2.2.5 (`biome.jsonc:23–36`). Recommended ruleset enabled. `noNonNullAssertion` is a `style` rule — it fires at warning level by default in the recommended set. Biome exits 0 for warnings; errors would be required to block CI.

**Type checker:** `tsc --noEmit`, strict mode (`tsconfig.json:14`). Exit 0, clean.

**Test runner:** Vitest v4.1.8, Node environment (`vitest.config.ts:9`). `vitest run` = single-pass mode, no watch — correct for CI. Exit 0, 5 files, 30 tests in 3.22s.

### 3. Current gate health (verified 2026-06-10)

All three gates pass on commit `c3d09c6`:

| Gate | Command | Result | Duration |
|------|---------|--------|----------|
| Lint | `npm run check` | 0 warnings→errors, exit 0 (6 style warnings) | 84ms |
| Typecheck | `npm run typecheck` | Clean, exit 0 | ~2s |
| Tests | `npm test` | 5/5 files, 30/30 tests, exit 0 | 3.22s |

**The 6 Biome warnings are in three files:**

| File | Line | Rule | Description |
|------|------|------|-------------|
| `src/server/api/routers/device.test.ts` | 71 | `noNonNullAssertion` | `result.unassigned[0]!.isStale` |
| `src/server/api/routers/device.test.ts` | 82 | `noNonNullAssertion` | `result.unassigned[0]!.isStale` |
| `src/server/api/routers/device.test.ts` | 88 | `noNonNullAssertion` | `result.unassigned[0]!` |
| `src/server/api/routers/device.ts` | 40 | `noNonNullAssertion` | `DP_CODE_MAP[device.productKey]!` |
| `src/server/workers/tuya-poller.test.ts` | 45 | `noNonNullAssertion` | `deviceStateStore.get("d1")!` |
| `src/server/workers/tuya-poller.test.ts` | 72 | `noNonNullAssertion` | `deviceStateStore.get("d1")!.lastPolledAt` |

Four are fixable by Biome (`--write`); two are not auto-fixable (the replacement requires semantic judgment). The one production warning at `device.ts:40` carries mild real risk: if a device's `productKey` is absent from `DP_CODE_MAP`, the `!` coerces `undefined` to `DpsConfig` silently — this is already guarded by the `BAD_REQUEST` check higher in the function, but the lint warning is accurate.

**Recommended approach for Phase 4:** Fix all 6 manually. The test-file fixes are straightforward (`!` → non-null assertion stays correct in test context but can be replaced with `as`-casts or restructured to avoid the assertion). The production fix at `device.ts:40` should use a null-check with early return rather than `?.` (the optional chain would silently propagate `undefined` into a type that expects `DpsConfig`).

### 4. Historical context from prior phases

All three prior phases established local commands only — no CI YAML was ever written.

**Phase 1** (`context/archive/testing-bootstrap-auth-crypto/plan.md`):
- Added `"test": "vitest run"` and `"typecheck": "tsc --noEmit"` to `package.json`. These are the two scripts Phase 4 inherits.
- The `check` (Biome) script was already present from the T3 scaffold.
- Phase 1's own §Phase 4 (cookbook update sub-phase) completed at commit `4328232` — §6.1 and §6.2 filled in. Not to be confused with rollout Phase 4.

**Phase 2** (`context/archive/testing-polling-worker/plan.md`):
- No CI or gate configuration. §6.3 cookbook filled in.

**Phase 3** (`context/archive/testing-valve-control-scoring/plan.md`):
- No CI or gate configuration. §6.4 and §6.5 cookbook filled in.
- Explicitly deferred hardware smoke gate pending S-04 DP code docs. Phase 4 must NOT attempt to wire the hardware smoke gate.

**Test-plan §5** (`context/foundation/test-plan.md:103–114`):
- `lint + typecheck` → `required` in `local + CI` — local wired (Phase 1), CI not yet.
- `unit + integration (Vitest)` → `required after §3 Phase 1` in `local + CI` — local wired (Phase 1), CI not yet.
- `post-edit hook (Vitest)` → `recommended after §3 Phase 4` — Phase 4's unique documentation responsibility.
- `hardware smoke (S-04)` → `required after §3 Phase 3` — manual, NOT in scope for Phase 4 (S-04 blocked).

---

## Code References

- `package.json:6–21` — all scripts (check, typecheck, test, build)
- `package.json:42` — `@biomejs/biome: ^2.2.5`
- `package.json:53` — `vitest: ^4.1.8`
- `package.json:52` — `typescript: ^5.8.2`
- `biome.jsonc:23–36` — linter config, recommended ruleset, `noNonNullAssertion` warning source
- `tsconfig.json:14` — `"strict": true`
- `tsconfig.json:20` — `"noEmit": true`
- `vitest.config.ts:9` — `environment: "node"`
- `vitest.config.ts:10` — `setupFiles: ["./src/test/setup.ts"]`
- `src/server/api/routers/device.ts:40` — production `!` assertion on `DP_CODE_MAP` lookup (1 lint warning)
- `src/server/api/routers/device.test.ts:71,82,88` — test-file `!` assertions (3 lint warnings)
- `src/server/workers/tuya-poller.test.ts:45,72` — test-file `!` assertions (2 lint warnings)
- `context/foundation/test-plan.md:103–114` — §5 Quality Gates authoritative spec
- `context/foundation/tech-stack.md:9–10` — `ci_provider: github-actions`, `ci_default_flow: auto-deploy-on-merge`

---

## Architecture Insights

**Biome warnings ≠ CI failure today, but they're noise.** Biome's `noNonNullAssertion` rule at `warn` level is a deliberate choice — it doesn't block the build. However, starting a CI pipeline with 6 existing warnings makes it hard to notice regressions (a new warning looks like noise). Fixing them before CI is wired is cheaper than fixing them with CI already running.

**The composite `ci` script is low-cost and high-value.** A single `npm run ci` that chains `check && typecheck && test` gives the future GitHub Actions YAML a stable, version-controlled entry point. If gate order or composition changes, the YAML doesn't need to change — only `package.json`.

**Post-edit hook is documentation-only in Phase 4.** The test-plan notes "recommended after §3 Phase 4" — this means Phase 4 should add a cookbook entry (§6.6 or a new §6.x) explaining how to configure Vitest as a post-edit hook in the Claude Code agent loop. No tooling change is needed; it's a recipe.

**Node version not pinned.** No `.nvmrc` or `.node-version` file. Next.js 15.2.3 requires Node 18+; npm@11 requires Node 20+. A CI workflow will need to pin Node explicitly (e.g., `node-version: '20'` in the actions/setup-node step). This is out of scope for Phase 4 (no YAML authoring) but worth noting as a prerequisite for the CI YAML skill.

---

## Historical Context (from prior changes)

- `context/archive/testing-bootstrap-auth-crypto/plan.md` — Phase 1 added `vitest run` and `tsc --noEmit` scripts; its own §Phase 4 cookbook update is already complete.
- `context/archive/testing-polling-worker/plan.md` — Phase 2 added worker test patterns (§6.3); no CI work.
- `context/archive/testing-valve-control-scoring/plan.md` — Phase 3 added command pipeline + scoring patterns (§6.4, §6.5); no CI work; hardware smoke gate explicitly deferred to S-04.

---

## Open Questions

1. **Composite `ci` script: include `build`?** Adding `next build` to the CI sequence catches type errors that only surface at build time (Next.js-specific checks beyond `tsc`). It adds ~30–60s but catches a real class of error. Recommend: include it — CI is the right place for the slow gate.

2. **`noNonNullAssertion` in test files: `as`-cast or restructure?** Biome's auto-fix (`?.`) changes semantics: `arr[0]?.prop` returns `undefined` when `arr[0]` is undefined, which in a test assertion would silently pass (`undefined === undefined`) rather than fail loudly. The correct fix in tests is to use `as NonNullable<typeof arr[0]>` or to restructure with a null-guard that throws. This needs to be spelled out clearly in the plan's sub-phase so the implementer doesn't blindly run `biome check --write`.

3. **Post-edit hook format:** The Claude Code agent loop accepts a `hooks` configuration in `settings.json`. The cookbook entry should give the exact config snippet rather than a vague instruction. Research can supply the format; the plan should commit to the specific snippet.
