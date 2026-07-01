<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Per-Room Thresholds — Form Hardening & Reset

- **Plan**: context/changes/per-room-thresholds/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-07-01
- **Verdict**: APPROVED (all findings fixed during triage)
- **Findings**: 0 critical  2 warnings  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING → FIXED |
| Architecture | PASS |
| Pattern Consistency | WARNING → FIXED |
| Success Criteria | PASS |

## Findings

### F1 — Concurrent mutation race on Save + Reset buttons

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/_components/setup/room-threshold-form.tsx:131-155
- **Detail**: Save disabled on `mutation.isPending` only; Reset disabled on `clearMutation.isPending` only. Concurrent clicks race to `onSuccess`, both call `onClose()`, last write wins non-deterministically.
- **Fix**: Added `const anyPending = mutation.isPending || clearMutation.isPending` and applied to both buttons.
- **Decision**: FIXED

### F2 — No isNaN guard after switching inputs to type="text"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/_components/setup/room-threshold-form.tsx:66-79
- **Detail**: `type="number"` implicitly blocked non-numeric input. `type="text"` removed that guard. `parseFloat("abc")` → NaN; `minVal >= maxVal` is false for NaN, so mutation fires with NaN values; JSON serializes NaN as null, producing a confusing BAD_REQUEST.
- **Fix**: Added `Number.isNaN` guard before the `minVal >= maxVal` check in both `room-threshold-form.tsx` and `default-thresholds-form.tsx`.
- **Decision**: FIXED

### F3 — clearThreshold omits room-existence check

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/server/api/routers/room.ts:338-344
- **Detail**: Plan said no check needed; `setThreshold` throws NOT_FOUND. User chose to add the guard for consistency.
- **Fix**: Added room-existence guard (`NOT_FOUND` on unknown roomId) matching `setThreshold` pattern.
- **Decision**: FIXED

### F4 — default-thresholds-form.tsx still uses type="number" inputs

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/_components/setup/default-thresholds-form.tsx
- **Detail**: Sibling form for global defaults used `type="number"` + `step="0.5"` — same pattern lessons.md flags. Two forms behaved differently for identical data types on mobile locales.
- **Fix**: Applied `type="text"` + `inputMode="decimal"` + comma normalizer + `Number.isNaN` guard to `default-thresholds-form.tsx`.
- **Decision**: FIXED
