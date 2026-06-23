<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Automation Rework (Modes)

- **Plan**: context/changes/automation-rework/plan.md
- **Scope**: Phase 1 of 6 through Phase 6 of 6 (full plan)
- **Date**: 2026-06-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — mode.delete skips the existence check its siblings use

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/server/api/routers/mode.ts:273-280
- **Detail**: `mode.delete` deleted by id with no prior existence check, so deleting a nonexistent mode silently returned `{ success: true }`. Every other mutation in the same router (`update`, `trigger`) and the closest sibling (`room.delete`) check existence first and throw `NOT_FOUND`.
- **Fix**: Added a `select` existence check before the delete, throwing `TRPCError({ code: "NOT_FOUND", message: "Mode not found" })` on miss, matching `mode.update`/`mode.trigger`'s pattern. Added a `NOT_FOUND` test case to `mode.test.ts`.
- **Decision**: FIXED

### F2 — Dashboard widget/KPI swap was outside the plan's original file list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/_components/cc-modes-widget.tsx, src/app/_components/device-overview.tsx, src/lib/dashboard-widgets.ts
- **Detail**: `cc-automations-widget.tsx` → `cc-modes-widget.tsx`, the `kpi-modes` KPI card, and the `DEFAULT_WIDGET_ORDER` edit were not in any phase's original "Changes Required" list — the plan's Current State Analysis missed this second UI surface entirely. It surfaced mid-session after Phase 6 dropped the schema, was explicitly requested by the user, and is fully documented in the plan's Phase 6 Progress note. Both review sub-agents independently verified the actual code matches that note's description exactly.
- **Fix**: None needed — already documented in plan.md and correct.
- **Decision**: ACCEPTED

### F3 — Stale "kpi-automations" id can linger in old saved dashboard layouts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: `.bootstrap-scaffold_dashboard_layout` (persisted `widget_order`/`hidden_widgets` JSON)
- **Detail**: The single shared `dashboardLayout` row (id `"default"`) still listed `"kpi-automations"` in its `widget_order` JSON. Since `widgetDefinitions` no longer defines that id, it was silently dropped at render time — harmless, no user-visible effect, pure dead data.
- **Fix**: Updated the live row directly: `UPDATE dashboard_layout SET widget_order = replace(widget_order, 'kpi-automations', 'kpi-modes') WHERE id = 'default'` — preserves the existing custom widget order/position rather than resetting it.
- **Decision**: FIXED

## Sub-agent reports (condensed)

**Plan Drift Detection**: Full MATCH across all 6 phases — schema additions/removals, migrations (0010 additive-only, 0011 drop-only), mode-control.ts/mode.ts/mode.test.ts contracts, scheduler sequential-tick ordering, root.ts wiring, UI cutover, Phase 5 preview, Phase 6 dead-code removal. Codebase-wide grep for `automationRules`/`automationExecutionLogs`/`api.automation.*`/deleted symbol names returned zero hits. One documented deviation (Phase 4's migrate-panel literal text vs. its removal in Phase 6) — correctly resolved and explained in the plan's own Progress note.

**Safety, Quality & Pattern Compliance**: No CRITICAL findings. All `mode.ts` procedures use `protectedProcedure`. `runModeTick` confirmed sequential (plain `for...of` + `await`, not `Promise.all`) preserving the conflict tie-break contract, with an order-asserting test. `mode.create`/`mode.update` confirmed transactional. Cascade FKs (`onDelete: "cascade"`) confirmed on `automationModeTargets`/`automationModeActivationLogs` → `automationModes`, so `mode.delete` cannot orphan rows. `mode-form.tsx` correctly sidesteps the codebase's Base-UI-`Select` lesson by using plain checkboxes instead of `Select` for the room picker. One WARNING (F1, now fixed).

## Success criteria

- `npm run typecheck`: pass
- `npm run check` (biome): pass, 136 files
- `npm run test`: 134/134 pass (was 133 before the F1 fix added a test)
- `npm run build` / `npm run db:migrate`: verified earlier in-session at commit `1880082` (Phase 6); not re-run during this review to avoid corrupting the locally running `next dev` server (build and dev share `.next` and conflict if run concurrently — this bit us once already this session).
- All Progress manual checkboxes (`[x]`) backed by real evidence gathered earlier in this session: Playwright screenshots, SQL row-count checks, and toast-text confirmations — not rubber-stamped.
