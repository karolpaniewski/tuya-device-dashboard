# Automation Rework (Modes) — Plan Brief

> Full plan: `context/changes/automation-rework/plan.md`

## What & Why

Today's automation rules are scoped per-device (day/time + temperature
threshold, one rule per valve), so reacting to a real situation —
"everyone's leaving early," "weekend, no one's in" — means hunting down
and editing several drifted-out-of-sync rules instead of flipping one
switch. This rework replaces per-device rules with named, room-targeted
"modes" that group rooms with an on/off target state and a schedule or
manual trigger.

## Starting Point

The existing `automationRules` system ticks every minute, matches
day/time, checks the manual heat-off pin, and calls `sendSetpointCommand`
(sets a temperature) — not the valve open/close command. The manual pin
(`roomHeatState.pinnedOff`, set via `room.toggleHeat`) already fans out to
every valve device in a room and always takes precedence; modes must
respect this unchanged.

## Desired End State

An admin creates a mode, assigns rooms with on/off targets, and schedules
or manually triggers it. Modes open/close valves directly. A manually
pinned-off room is always skipped, with no new UI beyond the existing
amber "Manually off" badge. Old per-device rules are shown read-only once
during mode setup, then deleted on explicit confirm — never converted.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Mode target granularity | Rooms, fanning out to all valve devices in the room | Reuses `room.toggleHeat`'s existing per-room pattern exactly; nothing in the PRD needs mixed states within one room | Plan |
| On/off state representation | Separate mode tables; `roomHeatState.pinnedOff` is never written by mode logic | Keeps the manual-pin precedence guardrail mechanically simple — no risk of a mode being confused with a deliberate manual pin | Plan |
| Mode-vs-mode schedule conflicts | Warn but allow; deterministic tie-break via `createdAt`-ordered sequential tick evaluation | Matches the PRD's explicit non-goal (no conflict-resolution UI) while staying deterministic, not silently random | Plan |
| Old rule tables | Drop via schema migration, sequenced as the final phase | Matches "no parallel operation after confirm" without racing the drop ahead of the human confirm action | Plan |
| Mode-activation observability | New activation-log table, no viewing UI | Preserves the debugging capability `automationExecutionLogs` gave today, scoped to rooms; a viewing UI isn't required by any FR | Plan |
| Old scheduler during rollout | Keeps running unmodified through phases 1-4 | The PRD's "no parallel operation" constraint is explicitly scoped to *after* confirm, not before | Plan |

## Scope

**In scope:**
- New mode/target/activation-log schema, mode CRUD + manual trigger API
- Scheduler tick evaluating modes (day/time match, pin-respecting,
  deterministic same-room tie-break)
- New mode-manager/mode-form UI replacing the automation setup section
- Read-old-rules-then-confirm migration panel and deletion mutation
- Mode preview (nice-to-have, droppable without affecting other phases)
- Final decommission of the old `automationRules`/`automationExecutionLogs`
  schema and code

**Out of scope:**
- Temperature-threshold gating for modes (intentionally not carried over)
- Arbitrary setpoint targets in modes (on/off only)
- Dedicated conflict-resolution UI beyond the non-blocking warning
- Converting old rules into modes (deletion only)
- New roles/permissions
- A UI to view past mode-activation log entries

## Architecture / Approach

Three new tables (`automationModes`, `automationModeTargets`,
`automationModeActivationLogs`) sit alongside the untouched
`roomHeatState` pin mechanism. A single shared helper,
`applyModeToRooms()`, contains the pin-check → valve-command → log
sequence and is called by both the manual-trigger tRPC procedure and the
new per-minute scheduler tick — so schedule-driven and manual activation
can never drift apart in behavior. The tick's mode-iteration order
(`createdAt ASC`, sequential `await`) is itself the entire conflict
tie-break mechanism for overlapping mode schedules.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema | Three new tables, additive migration | None — purely additive |
| 2. Mode CRUD API | `mode` router + shared `applyModeToRooms` helper | Getting the cross-site target validation and overlap-warning query right |
| 3. Scheduler rework | `runModeTick`, running alongside the old tick | Iteration order must stay sequential or the tie-break silently breaks |
| 4. Cutover UI | New mode UI + migrate-and-confirm panel | UI parity with the old form's mobile layout; confirm step must be unmistakable |
| 5. Preview (nice-to-have) | Client-side mode-effect summary | None — droppable |
| 6. Decommission | Drop old tables + dead code | Irreversible; must not run before the confirm action has actually executed |

**Prerequisites:** None beyond the existing stack (already verified
agent-friendly and CI-green per `stack-assessment.md`/`health-check.md`).
**Estimated effort:** ~3 weeks of after-hours work across the 6 phases,
matching the PRD's `delivery_weeks: 3` budget.

## Open Risks & Assumptions

- The confirm-cutover mutation deletes `automationRules` rows app-wide
  (no site scoping) — acceptable for this single-effective-site app, but
  would need revisiting if multi-site usage ever became real.
- `getRoomAvgTemperature` may or may not have other call sites beyond the
  old scheduler — Phase 6 explicitly gates its removal on a grep-first
  check rather than assuming it's safe to delete.

## Success Criteria (Summary)

- Creating, scheduling, editing, deleting, and manually triggering a mode
  all work end-to-end through the UI, including on a 375px viewport.
- A manually-pinned-off room is always skipped by every mode, with no new
  UI indicator beyond the existing "Manually off" badge.
- Old per-device rules are reviewable once, then removed only on explicit
  confirm — never silently lost, never auto-converted.
