<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Room Quick-Overview Panel

- **Plan**: context/changes/room-quick-overview-panel/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-29
- **Verdict**: NEEDS ATTENTION (triaged → all resolved)
- **Findings**: 0 critical  2 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — RoomPanelChart renders blank chart on empty data

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/_components/room-quick-overview-panel.tsx:52
- **Detail**: The only guard was `if (!data)`. Empty array [] is truthy, so `data = []` skipped the loading guard and rendered a blank LineChart with no message. Comparator room-temperature-panel.tsx uses a 3-state guard.
- **Fix**: Added `if (data.length === 0)` guard returning a "No data yet" div after the `!data` check.
- **Decision**: FIXED

### F2 — toggleHeatMutation has no onError handler

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/_components/device-overview.tsx:221
- **Detail**: Pre-existing gap. Mutation had onSuccess but no onError. The panel's confirm-popover flow makes silent failure more consequential — user sees no feedback after a failed heat toggle.
- **Fix**: Added `onError: () => toast.error("Failed to toggle heat.")` to the mutation options; covers both room-group header and panel call paths.
- **Decision**: FIXED

### F3 — enabled: true is redundant in RoomPanelChart query

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/_components/room-quick-overview-panel.tsx:43
- **Detail**: RoomPanelChart only mounts when primarySensorId !== null (parent guard), so enabled is always true. No other query in this codebase passes `enabled: true` explicitly.
- **Fix**: Removed `enabled: true` from query options.
- **Decision**: FIXED

### F4 — w-[420px] overrides the Sheet's responsive base width

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/_components/room-quick-overview-panel.tsx:141
- **Detail**: `w-[420px]` unconditionally overrides Sheet's responsive `data-[side=right]:w-3/4` base. Panel exceeds viewport on screens narrower than ~420px.
- **Fix**: Replaced `w-[420px]` with `w-full sm:w-[420px]`.
- **Decision**: FIXED

### F5 — Two unplanned additions in the panel

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/_components/room-quick-overview-panel.tsx:202, 262
- **Detail**: (1) Device rows include a device-type label badge not in the plan. (2) "Manage modes in Settings →" link below Modes section not in the plan, though it mirrors room-modal.tsx:77–81. Both are benign additive changes.
- **Decision**: SKIPPED — accepted as-is; both match reference pattern and violate no scope guardrail.
