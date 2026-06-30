<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Personalized dashboard layout (drag-and-drop widgets + room order)

- **Plan**: context/changes/dashboard-personalization/plan.md
- **Scope**: Phase 2 of 3 (Widget reorder + hide/restore)
- **Date**: 2026-06-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Stale-closure race on rapid successive layout saves

- **Severity**: ⚠️ WARNING (reclassified from agent's initial CRITICAL — low-stakes, single shared-admin-login UI preference, recoverable by re-dragging, not a security/data-safety issue)
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/_components/device-overview.tsx (saveLayoutMutation / handlers)
- **Detail**: Rapid successive layout actions (drag, hide, restore, reset) each fired an independent `setData` + `mutate` pair against `dashboardLayout.save` with no in-flight sequencing. Out-of-order server responses could let a stale full-overwrite payload clobber a newer one.
- **Fix A ⭐ Recommended (applied)**: Serialize saves via a queue-of-one (`pendingLayoutSaveRef` + `layoutSaveInFlightRef`), with `onSettled` firing the next queued save, plus `onMutate: () => utils.dashboardLayout.get.cancel()` to stop an outstanding GET from clobbering the optimistic write.
- **Decision**: FIXED (via Fix A) — implemented in `persistLayout()`, verified via `npm run typecheck`/`npm run check`/`npm run test` and a live Playwright re-run of the full drag/hide/restore/reset flow (all behaviors intact, order persists after reload).

### F2 — SortableWidget accepts an undocumented `className` prop

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/_components/sortable-widget.tsx
- **Detail**: Plan's literal contract was `{id, onHide, children}`; implementation adds an optional `className` passed to the wrapper `div`, used to apply `col-span-full` to the room-temp-panel widget so it isn't squeezed into a single grid cell.
- **Fix**: Document the extra prop as a deliberate, narrow extension in the plan rather than removing it (removal would visually break room-temp-panel's grid layout).
- **Decision**: FIXED — addendum added to plan.md's Phase 2 "Drag wrapper for widgets" contract section.

### F3 — roomOrder stale-closure footgun for Phase 3

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; no fix needed yet, just a heads-up
- **Dimension**: Architecture
- **Location**: src/app/_components/device-overview.tsx (persistLayout call sites)
- **Detail**: All Phase 2 handlers pass the closure-captured `roomOrder` into `persistLayout({...})` unchanged. Harmless today (Phase 2 never touches room order), but once Phase 3 adds room-reorder handlers that also call `persistLayout`, two saves racing on overlapping fields could silently drop one side's update since `persistLayout` takes a plain object, not an updater function — the queue-of-one pattern serializes requests but doesn't merge partial state.
- **Decision**: ACKNOWLEDGED — revisit when implementing Phase 3; no action needed now since Phase 2 alone can't trigger this.

### F4 — Redundant cache write/invalidate compounds F1

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; no fix needed, informational
- **Dimension**: Pattern Consistency
- **Location**: src/app/_components/device-overview.tsx (saveLayoutMutation onSuccess/onError)
- **Detail**: `persistLayout` already writes the optimistic value via `setData`; `onSuccess`/`onError` both call `invalidate()`, triggering an extra refetch round-trip per save. Harmless now that F1's fix (queue-of-one + `cancel()`) prevents it from racing a newer optimistic write — a minor efficiency note, not a correctness issue.
- **Decision**: ACKNOWLEDGED — no action needed.
