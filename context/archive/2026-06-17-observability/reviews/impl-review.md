<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Observability Infrastructure Implementation Plan

- **Plan**: `context/changes/observability/plan.md`
- **Scope**: Phase 1-3 of 3 (full plan)
- **Date**: 2026-06-17
- **Verdict**: REJECTED → fixed during triage (see decisions below)
- **Findings**: 1 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Redact config leaks top-level localKey/passwordHash

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/server/lib/logger.ts:12-19
- **Detail**: The redact config `paths: ["*.localKey", "*.gateway.localKey", "*.passwordHash", "*.user.passwordHash"]` was implemented exactly as specified in plan.md:77 (a plan defect, faithfully built — not implementation drift). fast-redact's `*` wildcard requires a parent key, so a bare top-level `{ localKey: secret }` object was NOT redacted, confirmed via a direct script: top-level leaked in plaintext, nested forms redacted correctly. No current call site logs a raw top-level localKey/passwordHash object, but the safety net was one careless `logger.info({ ...gatewayRow })` away from a real leak — directly threatening the Desired End State invariant (plan.md:25) and the project's `lessons.md` rule on localKey/AES-256-GCM handling.
- **Fix**: Add bare top-level paths to the redact array: `paths: ["localKey", "*.localKey", "*.gateway.localKey", "passwordHash", "*.passwordHash", "*.user.passwordHash"]`.
- **Decision**: FIXED — applied in `src/server/lib/logger.ts`. Verified via `npx vitest run src/server/lib/logger.test.ts` (11/11 pass, including new top-level cases) and full `npm run ci` (114/114 tests, lint clean, build clean).

### F2 — Test suite duplicates redact config instead of testing the real one

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/server/lib/logger.test.ts:9-28
- **Detail**: `loggerWithCollector()` hand-built a second Pino instance with the redact paths copied as an inline literal instead of importing `logger.ts`'s real config. None of the 4 redaction tests covered the bare top-level case — exactly where F1's leak was — which is why `npm run ci` stayed green despite the gap.
- **Fix**: Export `redact` from `logger.ts`; import the real config in the test and add a top-level test case.
- **Decision**: FIXED — `redact` exported from `logger.ts`, `logger.test.ts` now imports it via `loggerWithCollector()`, two new tests added (`never leaks a bare top-level localKey`, `never leaks a bare top-level passwordHash`).

### F3 — Wildcard ceiling beyond the four hardcoded shapes

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/server/lib/logger.ts:12-19
- **Detail**: fast-redact's single-segment `*` only covers exactly the documented shapes (top-level-under-any-key, now fixed by F1; depth-2 specifically under literal "gateway"/"user"). A shape like `{foo:{bar:{localKey}}}` (3 deep, non-gateway/user middle key) would still leak. No current call site produces this shape.
- **Fix**: Could switch to a recursive/deep-redact scheme; not worth the complexity without a call site that needs it.
- **Decision**: SKIPPED — no current call site produces this shape; revisit if one does.

### F4 — logger.ts reads raw process.env, bypassing t3-env validation

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture
- **Location**: src/server/lib/logger.ts:7-9
- **Detail**: Explicitly disclosed in-code and consistent with the plan's phase boundary — Phase 3's file list never included `logger.ts`. An invalid `LOG_LEVEL` bypasses the zod enum check silently.
- **Fix**: Could switch `logger.ts` to import the validated `env` object now that Phase 3 exists.
- **Decision**: SKIPPED — accepted by design; Phase 3 never planned to touch `logger.ts`.

### F5 — roadmap.md (S-19 dashboard-personalization) bundled into the Phase 2 commit

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: context/foundation/roadmap.md
- **Detail**: Unrelated dirty path staged via the user's explicit "Stage all" choice during the Phase 2 commit-ritual dirty-path prompt. Disclosed and approved at the time, not silent scope creep.
- **Fix**: N/A — deliberate choice mid-implementation.
- **Decision**: SKIPPED — nothing to fix.
