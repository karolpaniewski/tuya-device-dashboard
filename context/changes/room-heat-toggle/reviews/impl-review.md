<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Room Heat Toggle Implementation Plan

- **Plan**: context/changes/room-heat-toggle/plan.md
- **Scope**: Full plan (Phases 1-5)
- **Date**: 2026-06-22
- **Verdict**: APPROVED (minor warnings, no blocking issues)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Per-device toggle failures are silently discarded by the UI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/server/api/routers/room.ts:382-391 (deviceErrors built), src/app/_components/device-overview.tsx:173-175 (mutation call site)
- **Detail**: `room.toggleHeat`'s best-effort design is correct per the plan: the pin persists in `roomHeatState` before device commands run, and per-device failures land in `deviceErrors` rather than throwing. But the dashboard's `toggleHeatMutation` only does `onSuccess: () => utils.device.overview.invalidate()` — `deviceErrors` from the mutation result is never read. An admin can toggle a multi-valve room off, see "Manually off" with full confidence, while one valve is still physically open (e.g. offline device) — and get zero indication. Automation has also now stopped touching that room, so nothing will correct it either.
- **Fix**: Surface `deviceErrors` in the UI (e.g. a toast or inline warning listing failed device names) when the array is non-empty, instead of discarding the mutation result.
  - Strength: Closes the one place where the plan's "best-effort, not silently hidden" intent (explicitly stated in the plan's Key Discoveries) doesn't actually reach the user.
  - Tradeoff: Small UI addition — needs a toast/banner pattern check (does one already exist elsewhere in this app?).
  - Confidence: HIGH — the plan itself says per-device errors must be "surfaced, not silently hidden," and right now they aren't.
  - Blind spot: Haven't checked whether this app has an existing toast component to reuse, or whether this needs a new one.
- **Decision**: FIXED — toggleHeatMutation's onSuccess now calls toast.error() when deviceErrors is non-empty, using the existing sonner pattern from device-card.tsx

### F2 — device.test.ts touched in Phase 2 without being listed in the plan's Changes Required

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/server/api/routers/device.test.ts (commit 3f54b71)
- **Detail**: Extending `device.overview` with a `roomHeatState` query shifted the positional `db.select()` mock-call order that 5 existing tests in `device.test.ts` depend on. I had to edit those mock chains to keep the existing tests passing. This was necessary, correct, and verified (no assertions changed, only an inserted no-op mock) — but it's not listed anywhere in the plan's Phase 2 or Phase 5 "Changes Required" sections, so a plan-only reader wouldn't know this file was touched.
- **Fix**: No code change needed — this is a documentation-only gap. Already disclosed in the Phase 2 commit message and verified safe by both the test run and this review.
- **Decision**: FIXED — added an "## Addenda" section to plan.md documenting the device.test.ts mock-chain touch

### F3 — No optimistic disable on the heat-toggle button during a double-click

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/_components/room-group.tsx:60-113 (HeatToggle)
- **Detail**: `roomHeatState`'s upsert is atomic, so a rapid double-click toggle can't corrupt the DB row, but each click fires its own `Promise.allSettled` against the same valve devices — two in-flight gateway calls can race, leaving the final physical valve state out of sync with the last-committed pin. `HeatToggle` has no `isPending`/disabled guard.
- **Fix**: Pass the mutation's `isPending` down and disable the toggle button while a toggle is in flight.
- **Decision**: FIXED — added isToggleHeatPending prop threaded from toggleHeatMutation.isPending through RoomGroup to HeatToggle, disabling both the on/off buttons while a toggle is in flight

### F4 — sendValveStateCommand's COMMAND_FAILED catch swallows the error without logging

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/server/lib/valve-control.ts:134
- **Detail**: `sendPlugCommand` (plug-control.ts:67-73) logs via `getLogger().error(...)` before throwing `COMMAND_FAILED`; `sendValveStateCommand`'s identical catch block doesn't. This matches its direct sibling `sendSetpointCommand` in the same file (pre-existing gap, not introduced by this feature), but a failed manual valve-close is exactly the kind of event worth logging.
- **Fix**: Add a `getLogger().error({ err, deviceId, dps, isOpen }, ...)` call before the throw, mirroring `plug-control.ts`.
- **Decision**: FIXED — added getLogger().error() call in sendValveStateCommand's catch block before the COMMAND_FAILED throw
