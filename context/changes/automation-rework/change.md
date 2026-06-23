---
change_id: automation-rework
title: Rework the automation rules system
status: implemented
created: 2026-06-22
updated: 2026-06-23
archived_at: null
---

## Notes

User wanted to reprogram automations — replacing the per-device temperature+time rule system (S-11) with a room-targeted "mode" abstraction: a named mode groups one or more rooms, each with an on/off target state, and is either schedule-driven or manually triggered. Modes open/close valves directly (the same mechanism the manual heat-off pin already uses), not setpoints.

Shipped across 6 phases (see `plan.md` Progress):
1. Schema — `automationModes`, `automationModeTargets`, `automationModeActivationLogs` tables (additive).
2. Mode CRUD API (`mode` router) + shared `applyModeToRooms` activation helper.
3. Scheduler rework — `runModeTick`, deterministic last-created-wins conflict tie-break.
4. Cutover UI — Modes replaces Automations in Setup; one-time "migrate old rules" panel + `automation.confirmMigration`.
5. Live preview in the mode form (nice-to-have).
6. Decommissioned the old schema (`automation_rule`, `automation_execution_log` dropped) and dead code (`automation` router, old scheduler tick, Settings automation UI). Also caught and fixed a gap the original plan missed: the home dashboard's "Active Automations" KPI card + widget read the same deleted router — replaced with a "Active Modes" KPI card and `CcModesWidget`, per follow-up user request.

Roadmap: tracked as **S-23** in `context/foundation/roadmap.md`, superseding S-11. S-12 (automation-history, never built) is now obsolete — the old `automation_execution_log` table it would have read from is deleted; mode activations have their own log table but no viewing UI by design (Non-Goal).
