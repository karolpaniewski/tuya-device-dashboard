# Automation Rework (Modes) Implementation Plan

## Overview

Replace the per-device automation rules system (`automationRules`: one rule
per device, day/time + temperature threshold, sets a setpoint) with a
room-targeted "mode" abstraction: a named mode groups one or more rooms,
each with an on/off target state, and is either schedule-driven or
manually triggered. Modes open/close valves directly (the same mechanism
the manual heat-off pin already uses), not setpoints. The manual heat-off
pin continues to take precedence over any mode, unchanged.

## Current State Analysis

- `automationRules` (`src/server/db/schema.ts:250-287`): per-device rows —
  `deviceId`, `daysOfWeek` (JSON array of `Date.getDay()` values),
  `fireHour`, `fireMinute`, `targetSetpointC`, `tempThresholdC` (nullable),
  `isEnabled`.
- `automation.ts` router (`src/server/api/routers/automation.ts`):
  `list`/`create`/`delete`/`toggle` — **no `update`**; conflict detection in
  `create` (lines 83-124) rejects a new rule if another enabled rule in the
  same room overlaps on day + exact fire time.
- `automation-scheduler.ts`: `runAutomationTick()` runs every minute via
  `node-cron` (`"* * * * *"`). For each enabled rule: day/time match →
  `roomHeatState.pinnedOff` check (skip + log if pinned, lines 96-106) →
  optional `tempThresholdC` vs. `getRoomAvgTemperature()` gate → **calls
  `sendSetpointCommand`** (sets a target temperature — not valve
  open/close).
- `roomHeatState` (`schema.ts:227-248`): the manual heat-off pin —
  `roomId` (unique), `pinnedOff`, `pinnedAt`, `releasedAt`. Set by
  `room.toggleHeat` (`room.ts:335-398`), which finds every valve device in
  the room (`deviceRoomAssignments` join, `deviceType = 'valve'`) and calls
  `sendValveStateCommand(deviceId, !pinnedOff)` on each via
  `Promise.allSettled`, returning `deviceErrors` for partial failures.
- `device.setpoint` (`device.ts:30-95`) is **inert** (returns success,
  sends nothing) when the device's room is pinned off — the precedent for
  "accepted but no-op while pinned."
- `valve-control.ts`: `sendValveStateCommand(deviceId, isOpen)` (DP 3,
  open/close) and `sendSetpointCommand(deviceId, setpointC)` (DP 4,
  temperature) are separate functions against separate DP codes
  (`dp-codes.ts`). Modes need the former, never the latter.
- UI: `automation-manager.tsx` + `automation-form.tsx`
  (`src/app/_components/setup/`), rendered from `settings-shell.tsx:69-79`
  inside a `SettingsCard`, fed `valveDevices` computed in
  `settings-shell.tsx:39-43`. The manual-off indicator is a single amber
  `Badge` in `room-group.tsx:202-206` — no other mode-specific UI exists.
- `automation.ts` is registered in `src/server/api/root.ts` as
  `automation: automationRouter`.

## Desired End State

An admin creates a named mode, assigns one or more rooms with an on/off
target state each, and either attaches a day/time schedule or triggers it
manually. Activating a mode (by schedule or manual trigger) opens/closes
the valve devices in each target room, skips any room currently
manually-pinned-off, and logs the outcome per room. The old per-device
rules are shown read-only during mode setup, then deleted on an explicit
confirm action. Verify by: creating two modes targeting overlapping
rooms/times, confirming the later-created one's command wins at tick
time; toggling a room's manual pin and confirming a mode skips it;
running `npm run ci` green.

### Key Discoveries:

- The old scheduler controls **setpoint**, not valve state
  (`automation-scheduler.ts:123`) — modes are a different actuation path
  (`sendValveStateCommand`), not a regrouping of the same one.
- `room.toggleHeat` (`room.ts:347-356`) already contains the exact
  "find valve devices in this room" query modes need — reuse it verbatim
  rather than re-deriving it.
- `automationExecutionLogs` cascades on `ruleId` delete
  (`schema.ts:296-299`) — the new activation log should follow the same
  cascade-on-parent-delete convention.
- No `update` mutation pattern exists in `automation.ts`, but `room.rename`
  (`room.ts:86-100`) and `room.setSite`'s transactional multi-table update
  (`room.ts:166-270`) are the closest in-codebase precedents for
  `mode.update`.

## What We're NOT Doing

- **No temperature-threshold gating for modes.** The old `tempThresholdC`
  capability is not carried forward — modes fire purely on day/time or
  manual trigger, per the PRD's on/off-only scope. This is a real,
  intentional capability drop, not an oversight.
- **No arbitrary setpoint targets in modes** (PRD Non-Goal) — on/off only.
- **No dedicated conflict-resolution UI** beyond a non-blocking save-time
  warning and a deterministic tie-break at tick time (PRD Non-Goal).
- **No conversion of old rules into modes.** The confirm step deletes old
  rule data; it does not migrate it into mode form.
- **No new roles or permissions** — flat single-admin model, unchanged.
- **No UI to view past mode-activation log entries.** The log table is
  written for future debugging only, mirroring how
  `automationExecutionLogs` already has no viewing UI today.
- **No per-device target granularity within a mode** — a mode's unit of
  targeting is the room; every valve device in a targeted room gets the
  same on/off state (see Phase 2 design question resolution).

## Implementation Approach

Six phases, additive-first: new schema and API land without touching the
old rule system (phases 1-3), so the old scheduler keeps running
unmodified — the PRD only requires "no parallel operation **after
confirm**," so both systems coexisting until the admin confirms cutover is
correct, not a bug. The UI cutover and the confirm action land together
(phase 4), since the confirm button needs the new UI to exist first.
Preview (phase 5) is the nice-to-have FR and can be dropped without
affecting any other phase. The schema drop (phase 6) is sequenced last and
explicitly gated on the confirm action having actually run, since dropping
a table is irreversible and must never race ahead of the human decision
that FR-008 requires.

## Critical Implementation Details

**State sequencing — the tick's mode-iteration order IS the conflict
tie-break.** The chosen conflict policy ("warn but allow, most-recently-
created mode wins") is implemented with zero special-case logic: the tick
function fetches schedule-driven modes ordered by `createdAt ASC` and
`await`s each mode's room-application sequentially. If two modes target
the same room in the same tick, the later-created mode's command for that
room is sent after the earlier one and physically wins — no dedup or
priority field needed. This ordering is load-bearing; do not parallelize
the per-mode loop with `Promise.all` or the tie-break silently breaks.

**Timing & lifecycle — do not remove the old scheduler/router in phases
1-4.** `runAutomationTick` and `automation.ts` must keep running through
phase 4 (and the admin's actual confirm action). Phase 6 only removes them
after manually verifying the confirm action has run (or no old rules ever
existed) in the live database — see Phase 6's manual verification gate.

---

## Phase 1: Schema — mode tables

### Overview

Add the three new tables. Purely additive — no existing table or
behavior changes.

### Changes Required:

#### 1. New tables in `schema.ts`

**File**: `src/server/db/schema.ts`

**Intent**: Define `automationModes`, `automationModeTargets`, and
`automationModeActivationLogs`, following the exact column-definition
style already used by `automationRules`/`automationExecutionLogs`
(snake_case via the second string arg, `$defaultFn` UUIDs, `unixepoch()`
defaults, `$onUpdate` timestamps, `check()`/`index()` in the third
tuple-returning argument).

**Contract**:
- `automationModes`: `id` (PK), `name` (text 255 notNull), `daysOfWeek`
  (text 20, **nullable** — JSON array, same shape as `automationRules`;
  `null` means manual-trigger-only), `fireHour` (integer, nullable),
  `fireMinute` (integer, nullable), `createdAt`, `updatedAt`. No `siteId`
  column — a mode's site is implied by its target rooms (validated in
  Phase 2), matching how `automationRules` has no `siteId` either and
  relies on a join instead.
- `automationModeTargets`: `id` (PK), `modeId` (FK →
  `automationModes.id`, `onDelete: "cascade"`), `roomId` (FK → `rooms.id`,
  `onDelete: "cascade"`), `targetOn` (integer boolean, notNull — `true` =
  open valve, `false` = close valve). Unique constraint on
  `(modeId, roomId)`; index on `roomId` (needed for the Phase 2 overlap
  check, which queries "other modes targeting this room").
- `automationModeActivationLogs`: `id` (PK), `modeId` (FK →
  `automationModes.id`, `onDelete: "cascade"`), `roomId` (FK → `rooms.id`,
  `onDelete: "cascade"`), `triggeredBy` (text 10, CHECK IN
  `('schedule', 'manual')`), `targetOn` (boolean — denormalized snapshot
  of what was attempted, so the log stays meaningful after a mode is later
  edited), `status` (text 10, CHECK IN
  `('applied', 'skipped-pinned', 'failed')`), `error` (text 500,
  nullable), `firedAt` (timestamp notNull), `createdAt`. Indexes on
  `modeId`, `roomId`, `firedAt`, mirroring `automationExecutionLogs`'
  `exec_log_rule_idx` / `exec_log_fired_at_idx` pair.

#### 2. Generate and apply migration

**File**: `drizzle/` (generated)

**Intent**: Produce the Drizzle migration for the three new tables.

**Contract**: `npm run db:generate`, review the generated SQL, `npm run
db:migrate` against the dev DB.

### Success Criteria:

#### Automated Verification:
- Type checking passes: `npm run typecheck`
- Lint passes: `npm run check`
- Migration applies cleanly: `npm run db:migrate`

#### Manual Verification:
- Inspect the generated migration SQL — confirms only `CREATE TABLE`
  statements, no changes to existing tables.

---

## Phase 2: Mode CRUD API + shared activation logic

### Overview

The `mode` tRPC router (list/create/update/delete/trigger) plus a shared
`applyModeToRooms` helper that both `mode.trigger` (this phase) and the
Phase 3 scheduler tick will call — written once here so the two call
sites can't drift apart.

### Changes Required:

#### 1. Shared mode-application helper

**File**: `src/server/lib/mode-control.ts` (new)

**Intent**: One function that, given a mode's target rooms and a
`triggeredBy` source, applies each room's on/off target and writes one
activation-log row per room. Used by both manual trigger and the
scheduled tick so the pin-check / valve-command / logging logic exists in
exactly one place.

**Contract**: `applyModeToRooms(modeId: string, targets: {roomId:
string, targetOn: boolean}[], triggeredBy: "schedule" | "manual"):
Promise<{roomId: string, status: "applied" | "skipped-pinned" |
"failed", error?: string}[]>`. Per room: read `roomHeatState.pinnedOff`
for that room (same lookup as `automation-scheduler.ts:97-100`) → if
pinned, log `"skipped-pinned"` and move on; else look up that room's
valve devices (the exact query in `room.ts:347-356`) and
`Promise.allSettled` a `sendValveStateCommand(deviceId, targetOn)` call
per device — `status: "applied"` if all succeed, `"failed"` with the
first error message if any device command rejects. Insert one
`automationModeActivationLogs` row per room with `firedAt: new Date()`.

#### 2. Mode router

**File**: `src/server/api/routers/mode.ts` (new)

**Intent**: CRUD + manual trigger for modes, following the
`automation.ts` / `room.ts` conventions already in the codebase (Zod
input schemas, `protectedProcedure`, `TRPCError` with a message code the
client maps to copy, as in `automation-form.tsx`'s `RULE_CONFLICT` /
`NOT_A_VALVE` handling).

**Contract**:
- `mode.list({ siteId })` — joins `automationModeTargets` → `rooms` to
  filter by site (mirrors `automation.list`'s join-based site filter,
  since modes have no `siteId` column); returns each mode with its
  targets (`roomId`, `roomName`, `targetOn`) and schedule fields.
- `mode.create({ name, targets: {roomId, targetOn}[] (min 1), schedule:
  {daysOfWeek, fireHour, fireMinute} | null })` — validates every target
  `roomId` exists and all targets share the same `siteId` (throw
  `CROSS_SITE_TARGETS` otherwise, mirroring `room.ts`'s
  `CROSS_SITE_ASSIGNMENT` pattern); runs the **non-blocking** overlap
  check described below; inserts the mode row + target rows in a
  transaction; returns `{ id, warnings: string[] }`.
- `mode.update({ id, name, targets, schedule })` — same validation,
  full-replace: delete existing `automationModeTargets` rows for `id`,
  insert the new set, update the mode row, all in one
  `ctx.db.transaction` (mirrors `room.setSite`'s transaction style at
  `room.ts:248-267`). Returns `{ id, warnings: string[] }`.
- `mode.delete({ id })` — deletes the mode row; targets cascade. No
  extra "revert" action needed — a room with no remaining target row is
  exactly the "zero automation" state FR-006 describes.
- `mode.trigger({ id })` — loads the mode and its targets, calls
  `applyModeToRooms(id, targets, "manual")`, returns `{ results }`
  directly to the client for the ~1s responsiveness NFR (same
  synchronous-await shape as `room.toggleHeat`).

**Overlap check** (used by both `create` and `update`, non-blocking):
for each target room, query other modes (excluding self on update) whose
`automationModeTargets` include that room AND whose schedule is non-null
AND whose `daysOfWeek`/`fireHour`/`fireMinute` overlap the
input schedule (same day-overlap + exact-time-match logic as the old
`automation.ts:108-116` conflict check, but collecting matches into a
`warnings: string[]` array instead of throwing). Skip entirely if
`schedule` is `null` (manual-trigger-only modes can't schedule-conflict).

#### 3. Register the router

**File**: `src/server/api/root.ts`

**Intent**: Wire the new router into the app router.

**Contract**: Import `modeRouter` from `~/server/api/routers/mode`; add
`mode: modeRouter` to the `createTRPCRouter({...})` object, following the
exact pattern already used for `automation: automationRouter`.

### Success Criteria:

#### Automated Verification:
- Unit tests pass: `npm run test` — cover `mode.create`/`update` overlap
  warnings (warn-but-allow, never throw), `mode.delete` target cascade,
  `mode.trigger` pin-skip + partial-failure logging, all following the
  hoisted-mock + `createCaller` pattern in `automation.test.ts`.
- Type checking passes: `npm run typecheck`
- Lint passes: `npm run check`

#### Manual Verification:
- Exercise `mode.create`/`trigger` via a tRPC panel or temporary script
  against a dev device to confirm a real valve opens/closes.

---

## Phase 3: Scheduler rework

### Overview

A new tick function evaluates modes on the existing per-minute cadence,
using the Phase 2 `applyModeToRooms` helper. The old `runAutomationTick`
keeps running unmodified (see Critical Implementation Details).

### Changes Required:

#### 1. New mode tick function

**File**: `src/server/workers/automation-scheduler.ts` (extend — keep
the existing `runAutomationTick` export untouched in this phase)

**Intent**: Evaluate every schedule-driven mode each minute and apply
matching ones, in an order that makes the conflict tie-break deterministic.

**Contract**: `runModeTick(): Promise<void>` — fetch modes where
`daysOfWeek IS NOT NULL`, **ordered by `createdAt ASC`**; for each, check
`daysOfWeek.includes(currentDay)` and `fireHour`/`fireMinute` match
(identical match logic to the existing rule tick); for matches, `await
applyModeToRooms(mode.id, mode.targets, "schedule")` **sequentially, not
via `Promise.all`** (see Critical Implementation Details — this ordering
is the entire conflict tie-break mechanism).

#### 2. Register the new tick alongside the old one

**File**: `src/instrumentation.ts`

**Intent**: Start both schedulers — do not replace the old registration.

**Contract**: Add a second `cron.schedule("* * * * *", () =>
runModeTick())` registration alongside the existing
`startAutomationScheduler()` call (or extend `startAutomationScheduler`
to register both jobs — either is fine as long as both run).

### Success Criteria:

#### Automated Verification:
- Unit tests pass: `npm run test` — cover, mirroring
  `automation-scheduler.test.ts`'s fake-timer setup: schedule
  match/no-match, pinned-room skip+log, and the critical **two modes
  targeting the same room at the same tick → later-created mode's
  command is the one actually sent** (assert on call order/final state
  of the mocked `sendValveStateCommand`, not just that both were called).
- Type checking passes: `npm run typecheck`

#### Manual Verification:
- Create two modes targeting the same room at the same fire time with
  different `targetOn` values; confirm at the next tick the later-created
  mode's state wins on the real/dev device.

---

## Phase 4: Cutover UI

### Overview

Replace the automation setup UI with mode equivalents, and add the
read-old-rules-then-confirm migration panel FR-008 requires.

### Changes Required:

#### 1. Confirm-cutover mutation

**File**: `src/server/api/routers/automation.ts`

**Intent**: A mutation the new UI calls once the admin reviews old rules
and confirms — deletes the old rule data. Does not touch table schema.

**Contract**: `automation.confirmMigration` (no input) — `ctx.db.delete
(automationRules)` (no `where`; cascades `automationExecutionLogs` via
the existing FK). Returns `{ success: true as const, deletedCount:
number }` (use the deleted rows' count from a prior `select` or
`.returning()`, for the UI's confirmation toast).

#### 2. Mode UI components

**File**: `src/app/_components/setup/mode-manager.tsx` (new, replaces
`automation-manager.tsx`)

**Intent**: List modes (name, target rooms with on/off badges, schedule
summary or "Manual trigger only"), a trigger button per mode (calls
`mode.trigger`), edit/delete actions, and — only when `automation.list`
returns any rows — a "Migrate old rules" panel above the mode list
showing the old rules read-only with a "Confirm and remove old rules"
button wired to `automation.confirmMigration`.

**Contract**: Same shape as `automation-manager.tsx` (query + mutations
+ list rendering with empty state), reading from `mode.list` instead of
`automation.list` for the main list, and conditionally rendering the
legacy panel from a second `automation.list` query.

**File**: `src/app/_components/setup/mode-form.tsx` (new, replaces
`automation-form.tsx`)

**Intent**: Create/edit a mode — name, a room multi-select where each
selected room gets an on/off toggle, a "manual trigger only" checkbox
that hides the schedule fields when checked, and (when not checked) the
existing days-of-week toggle row + `HH:MM` fire-time input.

**Contract**: Reuse `automation-form.tsx`'s exact day-toggle logic
(`toggleDay`, `DAY_LABELS`) and time-masking logic (`handleTimeChange`)
verbatim — these are proven, tested patterns, not things to redesign.
Per the codebase lesson on Base UI `Select`, any room picker that can
have a pre-populated value on mount (i.e. the edit case) must pass an
`items` prop. Submit shows any `warnings` from `create`/`update` as
inline, non-blocking text distinct from a hard `formError`.

#### 3. Wire into settings shell

**File**: `src/app/_components/setup/settings-shell.tsx`

**Intent**: Swap the "Automations" `SettingsCard` for a "Modes" one.

**Contract**: Replace the `<AutomationManager />` render (lines 69-79)
with `<ModeManager />`, passing a room list (from the existing
`room.list` query, which the settings shell already has available
elsewhere on the page) instead of `valveDevices` — modes target rooms,
not devices directly.

### Success Criteria:

#### Automated Verification:
- Type checking passes: `npm run typecheck`
- Lint passes: `npm run check`
- Unit tests pass: `npm run test` — `automation.confirmMigration` deletes
  rows and cascades logs.

#### Manual Verification:
- With existing legacy rules present: the migrate panel appears, shows
  them read-only, and confirming removes them and hides the panel.
- With no legacy rules: the panel never renders.
- Create, edit, delete, and manually trigger a mode end-to-end through
  the UI; confirm a manually-pinned-off room is skipped (existing amber
  "Manually off" badge still the only indicator — no new badge appears).
- Verify the new UI at a 375px viewport — no regression versus the old
  automation form's mobile layout.

---

## Phase 5: Preview (nice-to-have)

### Overview

FR-009 — let the admin see a mode's effect before saving or triggering
it. Purely client-side; can be skipped under time pressure without
affecting any other phase.

### Changes Required:

#### 1. Preview panel in the mode form

**File**: `src/app/_components/setup/mode-form.tsx`

**Intent**: Render a read-only "This mode will: turn [room] ON/OFF, ..."
summary from the form's current (unsaved) local state, before submit.

**Contract**: Pure derived rendering from existing form state
(`targets`); no new query or mutation.

### Success Criteria:

#### Automated Verification:
- Type checking passes: `npm run typecheck`

#### Manual Verification:
- Selecting/changing rooms and on/off targets in the form updates the
  preview summary live, before saving.

---

## Phase 6: Decommission old schema

### Overview

Once the Phase 4 confirm action has actually run (or no legacy rules ever
existed), remove the dead `automationRules`/`automationExecutionLogs`
tables and the code paths that only existed to serve them.

### Changes Required:

#### 1. Drop migration

**File**: `drizzle/` (generated)

**Intent**: Remove the two legacy tables structurally.

**Contract**: `npm run db:generate` after deleting the
`automationRules`/`automationExecutionLogs` exports from `schema.ts`;
review the generated `DROP TABLE` migration before applying.

#### 2. Remove dead code

**Files**: `src/server/api/routers/automation.ts`,
`src/server/workers/automation-scheduler.ts` (the old
`runAutomationTick`/`getRoomAvgTemperature`/`logExecution` exports — keep
`runModeTick`), `src/server/api/root.ts` (remove the `automation:
automationRouter` registration), `src/app/_components/setup/
automation-manager.tsx`, `automation-form.tsx`, and their test files.

**Intent**: Delete the now-unreachable legacy code.

**Contract**: Before deleting `getRoomAvgTemperature`, grep for other
call sites — it was written for the old rule system's temperature gate,
but confirm nothing else (e.g. a room-health-badge computation) imports
it before removing it.

### Success Criteria:

#### Automated Verification:
- Type checking passes: `npm run typecheck`
- Lint passes: `npm run check`
- Unit tests pass: `npm run test` (legacy automation tests removed, mode
  tests still green)
- Build passes: `npm run build`
- Migration applies cleanly: `npm run db:migrate`

#### Manual Verification:
- **Before applying this phase's migration**, confirm in the live/dev
  database that `automation_rule` has zero rows (the Phase 4 confirm
  action has run, or there was never any legacy data) — this drop is
  irreversible and must not race ahead of that human decision.

---

## Testing Strategy

### Unit Tests:
- `mode.ts` router: create/update overlap-warning detection (warns,
  never throws), cross-site target rejection, delete cascade, trigger
  pin-skip and partial-device-failure logging — hoisted-mock +
  `createCaller` pattern from `automation.test.ts`.
- `mode-control.ts`: `applyModeToRooms` in isolation — pinned room →
  `"skipped-pinned"`; all devices succeed → `"applied"`; one device
  fails → `"failed"` with error captured.
- `automation-scheduler.ts`: `runModeTick` — schedule match/no-match
  (existing fake-timer setup from `automation-scheduler.test.ts`), and
  the two-modes-same-room-same-tick deterministic-winner case.

### Integration Tests:
- `automation.confirmMigration` deletes rows and cascades
  `automationExecutionLogs`.

### Manual Testing Steps:
1. Create a mode targeting two rooms with different on/off targets;
   manually trigger it; confirm both rooms' valves respond correctly.
2. Pin a room's heat off manually, then trigger a mode targeting that
   room; confirm the room is skipped and the pin is undisturbed.
3. Create two modes scheduled for the same room/time with different
   targets; at the next tick, confirm the later-created mode's state
   wins.
4. With legacy rules present, walk through the migrate-and-confirm flow;
   confirm old rules disappear and the panel stops rendering.
5. Test the full mode CRUD + trigger flow at a 375px viewport.

## Performance Considerations

`mode.trigger` and the tick's `applyModeToRooms` calls use
`Promise.allSettled` per room (already the pattern `room.toggleHeat`
uses in production at acceptable latency) — no new performance work
needed to hit the ~1s manual-trigger NFR.

## Migration Notes

Phase 1's migration is purely additive (new tables only) — safe to apply
at any time. Phase 6's migration drops `automationRules`/
`automationExecutionLogs` and is **irreversible**; it must only be applied
after manually confirming the Phase 4 cutover action has run (or no
legacy rows exist). There is no rollback path for Phase 6 beyond restoring
from a database backup.

## References

- PRD: `context/foundation/prd-v5.md`
- Shape notes: `context/foundation/shape-notes.md`
- Existing pin precedent: `src/server/api/routers/room.ts:335-398`
  (`room.toggleHeat`)
- Existing scheduler precedent: `src/server/workers/automation-scheduler.ts`
- Existing setpoint-gate precedent: `src/server/api/routers/device.ts:30-95`
  (`device.setpoint`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema — mode tables

#### Automated
- [x] 1.1 Type checking passes: `npm run typecheck` — ff0db16
- [x] 1.2 Lint passes: `npm run check` — ff0db16
- [x] 1.3 Migration applies cleanly: `npm run db:migrate` — ff0db16

#### Manual
- [x] 1.4 Inspect generated migration SQL — only new `CREATE TABLE` statements — ff0db16

### Phase 2: Mode CRUD API + shared activation logic

#### Automated
- [x] 2.1 Unit tests pass: `npm run test` — 428e528
- [x] 2.2 Type checking passes: `npm run typecheck` — 428e528
- [x] 2.3 Lint passes: `npm run check` — 428e528

#### Manual
- [x] 2.4 Exercise mode.create/trigger against a dev device — 428e528

### Phase 3: Scheduler rework

#### Automated
- [x] 3.1 Unit tests pass: `npm run test` — 3b425c6
- [x] 3.2 Type checking passes: `npm run typecheck` — 3b425c6

#### Manual
- [x] 3.3 Two same-room same-tick modes — later-created mode wins on real/dev device — 3b425c6

### Phase 4: Cutover UI

#### Automated
- [x] 4.1 Type checking passes: `npm run typecheck` — e66b3d4
- [x] 4.2 Lint passes: `npm run check` — e66b3d4
- [x] 4.3 Unit tests pass: `npm run test` — e66b3d4

#### Manual
- [x] 4.4 Migrate panel appears with legacy rules, confirm removes them and hides panel — e66b3d4
- [x] 4.5 Migrate panel never renders when no legacy rules exist — e66b3d4
- [x] 4.6 Full mode CRUD + manual trigger end-to-end through the UI — e66b3d4
- [x] 4.7 Manually-pinned-off room skipped by a mode, no new badge introduced — e66b3d4
- [x] 4.8 375px viewport — no regression vs. old automation form — e66b3d4

### Phase 5: Preview (nice-to-have)

#### Automated
- [x] 5.1 Type checking passes: `npm run typecheck`

#### Manual
- [x] 5.2 Preview summary updates live as form state changes

### Phase 6: Decommission old schema

#### Automated
- [ ] 6.1 Type checking passes: `npm run typecheck`
- [ ] 6.2 Lint passes: `npm run check`
- [ ] 6.3 Unit tests pass: `npm run test`
- [ ] 6.4 Build passes: `npm run build`
- [ ] 6.5 Migration applies cleanly: `npm run db:migrate`

#### Manual
- [ ] 6.6 Confirm `automation_rule` has zero rows in the live/dev DB before applying the drop migration
