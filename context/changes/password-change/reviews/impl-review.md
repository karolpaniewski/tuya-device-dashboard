<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Password Change (Self-Service)

- **Plan**: context/changes/password-change/plan.md
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-07-01
- **Verdict**: APPROVED
- **Findings**: 0 critical  1 warning  2 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — "user not found" branch has no test

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/server/api/routers/settings.ts:80–85 (branch) / settings.test.ts (missing)
- **Detail**: `changePassword` has two UNAUTHORIZED paths: (1) empty DB result and (2) wrong password. The test suite covered only wrong-password and success. The "user not found" branch (settings.ts:80–85) was untested.
- **Fix**: Add `describe("settings.changePassword — user not found")` with UNAUTHORIZED assertion + `expect(bcryptjs.compare).not.toHaveBeenCalled()`.
- **Decision**: FIXED — added describe block in settings.test.ts (10 tests now pass)

### F2 — updatedAt set by hook only; peer sets it explicitly

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/server/api/routers/settings.ts:101–104
- **Detail**: `setDefaultThresholds` sets `updatedAt: new Date()` explicitly in its update set. `changePassword` relied solely on `.$onUpdate()` hook — functionally equivalent but visually inconsistent.
- **Fix**: Add `updatedAt: new Date()` to `changePassword` update's `set({})` call.
- **Decision**: FIXED

### F3 — no client-side min-8 check before mutation

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/_components/setup/change-password-form.tsx:30–38
- **Detail**: `DefaultThresholdsForm` validates its constraint client-side before mutating. `ChangePasswordForm` validated passwords-match client-side but skipped the min-8 check — caught by server Zod, but at a network roundtrip cost.
- **Fix**: Add `if (newPassword.length < 8) { setFormError("Password must be at least 8 characters"); return; }` before the confirm check.
- **Decision**: FIXED
