# Room Heat Toggle Implementation Plan

## Overview

Add a per-room manual heat on/off toggle to the dashboard. Turning a room off closes every valve device in that room directly (independent of setpoint) and pins the room off indefinitely; automation skips a pinned room on every tick; setpoint edits on a pinned room are accepted but inert; a distinct visual indicator shows pinned-off rooms on the dashboard.

## Current State Analysis

Heat control today is entirely device-scoped: `device.setpoint` (`src/server/api/routers/device.ts:28-77`) sends a DP `temp_set` write directly to a single device via `sendSetpointCommand` (`src/server/lib/valve-control.ts:9-69`). Automation rules (`automationRules` table, `src/server/db/schema.ts:227-264`) also target a single `deviceId` and are evaluated every minute by `runAutomationTick` (`src/server/workers/automation-scheduler.ts:67-118`), which calls the same `sendSetpointCommand` at line 105. There is no concept of a room-level state, no valve-state (open/closed) write path (only setpoint), and no "this room is administratively off" flag anywhere in the schema. The dashboard's `RoomGroup` component (`src/app/_components/room-group.tsx:60-138`) renders a health badge (OK/Too Cold/Too Hot) per room but has no toggle control and no other room-level action.

## Desired End State

An admin can click a heat toggle on any room's card, confirm via an inline popover, and see that room's valve(s) close immediately and the card show a distinct "manually off" indicator. Automation no longer acts on that room. Editing setpoint on a pinned room is a no-op against the device (still returns success). Clicking the toggle again releases the pin and restores normal setpoint/automation behavior. Verify by: toggling a room off, confirming automation skips it on the next minute tick (check `automation_execution_log` for `status: "skipped"`), confirming a setpoint edit on that room doesn't change the live device's setpoint DP, and toggling it back on restores normal control.

### Key Discoveries:

- Automation rules are per-device, not per-room (`schema.ts:227-264`) — the skip-guard must resolve `deviceId → roomId` via `deviceRoomAssignments` (already done for temp-threshold checks in `getRoomAvgTemperature`, `automation-scheduler.ts:17-52`).
- `automationExecutionLogs.status` already has a `"skipped"` value in its check constraint (`schema.ts:289-292`) and `logExecution(ruleId, "skipped", reason)` is an existing helper (`automation-scheduler.ts:54-65`) — reuse it verbatim for the pin-skip case.
- `DP_CODE_MAP` (`src/server/lib/tuya/dp-codes.ts:6-14`) only maps productKey → the setpoint DP (4). Valve close needs DP 3 (`valve_state`), which has no map yet.
- `TuyaGatewayClient.sendSwitch` (`src/server/lib/tuya/types.ts:33-40`) already exists and is exactly what `sendPlugCommand` (`src/server/lib/plug-control.ts:10-74`) uses for a boolean DP write — the valve-close helper is a direct copy of that function's shape with a different DP map.
- `device.overview` (`device.ts:295-419`) already queries `roomThresholds` in a *separate* query specifically "to avoid deepening the existing mock chain in tests" (`device.ts:371`) — the new pin-state lookup must follow the same separate-query pattern, not get joined into the main query.
- `@base-ui/react/popover` is already an installed dependency (used nowhere yet) — a `Popover` wrapper component can mirror `src/components/ui/dialog.tsx`'s exact structure (`Root`/`Trigger`/`Portal`/`Backdrop`/`Popup`) instead of introducing a new library.
- No server-side `force`/confirm flag pattern exists anywhere in the routers — confirmation is purely client-side by convention (confirmed in `room.ts`/`device.ts`). The new mutation follows this: no confirm step server-side.
- A room can have multiple valve devices via `deviceRoomAssignments` (1 device → 1 room, many devices → 1 room). The chosen best-effort approach means the pin always persists; per-device close failures are collected and returned, not thrown.

## What We're NOT Doing

- No bulk/whole-building toggle — strictly per-room (confirmed non-goal in the PRD).
- No scheduled or timed auto-release of the pin — release is always a manual toggle click.
- No notifications/alerts when automation skips a pinned room — the dashboard indicator is the only signal.
- No new role/permission boundary — any admin can toggle any room, same as today.
- No persisted "pending setpoint" to auto-apply on release — a setpoint edit while pinned is simply not sent; the valve keeps its last commanded state until automation or a fresh setpoint edit reaches it after release.
- No change to the room health badge's (OK/Too Cold/Too Hot) computation — it keeps reflecting real temperature for pinned-off rooms unchanged.

## Implementation Approach

Model the pin as a new `roomHeatState` table (mirrors the existing `roomThresholds` 1:1-per-room pattern). A new `room.toggleHeat` mutation flips the pin and best-effort closes/opens every valve device in the room via a new `sendValveStateCommand` helper (DP 3, mirrors `sendPlugCommand`'s shape). `device.setpoint` gains a guard that checks the device's room pin before sending anything. `automation-scheduler.ts` gains the same kind of guard before its existing `sendSetpointCommand` call. `device.overview` is extended to surface the pin state per room so the UI can render the toggle and indicator without a second round-trip. UI work is additive to `RoomGroup`: a toggle button, a small `Popover`-based inline confirm, and an indicator rendered next to (not replacing) the existing health badge.

## Phase 1: Data model

### Overview

Add the pin-state table and the missing valve-state DP map. No behavior changes yet — purely additive schema.

### Changes Required:

#### 1. `roomHeatState` table

**File**: `src/server/db/schema.ts`

**Intent**: Persist a per-room manual-off pin, mirroring the existing `roomThresholds` table's shape and conventions (unique `roomId` FK, cascade delete, timestamps).

**Contract**: New exported table `roomHeatState` with columns: `id` (text PK, `crypto.randomUUID()` default), `roomId` (text, unique, FK → `rooms.id`, `onDelete: "cascade"`), `pinnedOff` (integer/boolean, `notNull`, default `false`), `pinnedAt` (integer timestamp, nullable), `releasedAt` (integer timestamp, nullable), `createdAt`/`updatedAt` following the same pattern as `roomThresholds` (`schema.ts:198-225`). No check constraints needed beyond the boolean default.

#### 2. Valve-state DP map

**File**: `src/server/lib/tuya/dp-codes.ts`

**Intent**: Add the DP code needed to write `valve_state` directly, separate from the existing setpoint DP map, since a device's setpoint DP and valve-state DP are different numbers for the same productKey.

**Contract**: New exported `VALVE_STATE_DP_CODE_MAP: Record<string, number>` alongside `DP_CODE_MAP`, with `ogx8u5z6: 3` (per the existing comment on line 8 confirming DP 3 = `valve_state` for that productKey). Same empty-map warning pattern as the existing map (lines 16-20) is optional — skip it for this map since it's only consulted when a valve close/open is attempted, not on every setpoint write.

#### 3. Migration

**File**: `drizzle/` (new generated `.sql` file)

**Intent**: Generate the migration for the new table via the existing toolchain.

**Contract**: Run `npm run db:generate` after the schema change lands; do not hand-write the SQL file (existing convention per `package.json` scripts and the `0000_mushy_wasp.sql`-style generated files already in `drizzle/`).

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npm run db:migrate`
- [ ] Type checking passes: `npm run typecheck` (or `tsc --noEmit` per the project's `ci` script)
- [ ] Linting passes: `npm run lint` (Biome)

#### Manual Verification:

- [ ] Confirm the generated migration file only adds the new table (no unintended diffs against `rooms`/`devices`)

---

## Phase 2: Backend mutations

### Overview

Add the valve-close/open command helper, the room toggle mutation, the setpoint inert-while-pinned guard, and extend `device.overview` to expose pin state.

### Changes Required:

#### 1. Valve-state command helper

**File**: `src/server/lib/valve-control.ts`

**Intent**: Send a direct `valve_state` DP write (open/close), independent of setpoint, reusing the same device/gateway/key resolution steps `sendSetpointCommand` already does.

**Contract**: New exported `sendValveStateCommand(deviceId: string, isOpen: boolean): Promise<void>`. Structurally identical to `sendSetpointCommand` (`valve-control.ts:9-69`) through gateway/key resolution, but looks up the DP from `VALVE_STATE_DP_CODE_MAP` instead of `DP_CODE_MAP`, and calls `client.sendSwitch({ ... }, { dps, set: isOpen, cid: device.nodeId ?? undefined })` (the same call shape `sendPlugCommand` uses, `plug-control.ts:55-66`) instead of `sendSetpoint`. Same thrown-error vocabulary (`DEVICE_NOT_FOUND`, `UNSUPPORTED_DEVICE`, `DEVICE_NOT_PAIRED`, `GATEWAY_NOT_FOUND`, `GATEWAY_KEY_NOT_SET`, `KEY_DECRYPT_FAILED`, `COMMAND_FAILED`) so callers can reuse the existing error-mapping `switch` pattern.

#### 2. `room.toggleHeat` mutation

**File**: `src/server/api/routers/room.ts`

**Intent**: Flip a room's manual-off pin and best-effort close/open every valve device assigned to that room. The pin always persists regardless of individual device command outcomes (per the best-effort resolution) — a flaky valve must not block the room-level promise that automation will stop touching it.

**Contract**: New mutation `toggleHeat`, input `{ roomId: string, pinnedOff: boolean }`, `protectedProcedure`. Steps: (1) validate room exists (mirrors `setThreshold`'s `room` lookup, `room.ts:297-304`); (2) look up all valve devices assigned to the room via `deviceRoomAssignments` + `devices` filtered to `deviceType: "valve"`; (3) upsert `roomHeatState` (`onConflictDoUpdate` on `roomId`, mirroring `setThreshold`'s upsert at `room.ts:313-328`) setting `pinnedOff`, and `pinnedAt`/`releasedAt` depending on direction; (4) call `sendValveStateCommand(deviceId, !pinnedOff)` for every valve device in parallel (`Promise.allSettled`, not `Promise.all` — a single rejection must not abort the others); (5) return `{ success: true as const, pinnedOff: input.pinnedOff, deviceErrors: [...] }` where `deviceErrors` lists `{ deviceId, message }` for any settled-rejected device commands. The pin write (step 3) happens regardless of step 4's outcome — persist first, then attempt device commands.

#### 3. Setpoint inert-while-pinned guard

**File**: `src/server/api/routers/device.ts`

**Intent**: A setpoint edit on a room that is currently pinned off must not change the live device's setpoint DP, per FR-006's resolution (accepted but inert, no new pending-value tracking).

**Contract**: At the top of the `setpoint` mutation (`device.ts:32-34`, before calling `sendSetpointCommand`), resolve the device's room via `deviceRoomAssignments` and check `roomHeatState.pinnedOff` for that room. If pinned, skip the `sendSetpointCommand` call entirely and return `{ success: true as const, setpointC: input.setpointC }` immediately (same return shape as the normal path, so the client UI doesn't need to special-case this). If the device has no room assignment, proceed as today (unaffected).

#### 4. Extend `device.overview` with pin state

**File**: `src/server/api/routers/device.ts`

**Intent**: Surface each room's pin state in the existing overview query so the dashboard can render the toggle and indicator without an extra round-trip.

**Contract**: Add a separate `ctx.db.select().from(roomHeatState)` query (same separate-query pattern as the existing `roomThresholds` query at `device.ts:372`, explicitly to avoid deepening the mock chain in tests) and build a `Map<roomId, { pinnedOff: boolean; pinnedAt: Date | null }>`. In the `scoredRooms` map (`device.ts:401-416`), add `pinnedOff` and `pinnedAt` to each room's returned shape, defaulting to `{ pinnedOff: false, pinnedAt: null }` when no row exists for that room.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm run test` (new tests added in Phase 5; existing `device.setpoint.test.ts` and `room.test.ts` continue passing unmodified in their existing cases)

#### Manual Verification:

- [ ] Toggling a room off via a direct tRPC call (or temporary script) confirms the live valve device's `valve_state` DP flips to closed
- [ ] A setpoint edit issued against a pinned-off room's valve does not change the device's live setpoint reading
- [ ] `device.overview` response includes `pinnedOff`/`pinnedAt` for a toggled room

---

## Phase 3: Automation guard

### Overview

Make `runAutomationTick` skip any rule whose device belongs to a pinned-off room, logging it the same way the existing temperature-threshold skip is logged.

### Changes Required:

#### 1. Room-pin skip check

**File**: `src/server/workers/automation-scheduler.ts`

**Intent**: A manual pin always takes precedence over automation — once a room is pinned off, automation must not write to any device in that room on any tick until released.

**Contract**: Before the existing `sendSetpointCommand` call (`automation-scheduler.ts:105`), add a check: resolve `rule.deviceId`'s room via `deviceRoomAssignments` (same lookup `getRoomAvgTemperature` already does at lines 20-23), then check `roomHeatState.pinnedOff` for that room. If pinned, call `await logExecution(rule.id, "skipped", "Room manually pinned off")` and `return` — identical shape to the existing temp-threshold skip at lines 90-100. Place this check before the temperature-threshold check so a pinned room is never even evaluated against thresholds (cheaper short-circuit, and the skip reason is more specific/useful).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Unit tests pass: `npm run test` (new automation-scheduler test added in Phase 5)

#### Manual Verification:

- [ ] With a room pinned off and an enabled automation rule targeting a device in that room, advancing past the rule's fire time produces an `automation_execution_log` row with `status: "skipped"` and the new reason text, and the device's setpoint is not changed

---

## Phase 4: Dashboard UI

### Overview

Add the `Popover` UI primitive, then the toggle button, inline confirm, and manually-off indicator on the room card.

### Changes Required:

#### 1. `Popover` UI primitive

**File**: `src/components/ui/popover.tsx` (new file)

**Intent**: A small, reusable popover for the inline confirm step — there is no existing confirm-dialog primitive, and the PRD calls for a "brief inline confirm," not a full modal.

**Contract**: Mirrors `src/components/ui/dialog.tsx`'s structure exactly, but wrapping `@base-ui/react/popover` instead of `@base-ui/react/dialog`: export `Popover` (`PopoverPrimitive.Root`), `PopoverTrigger`, `PopoverPortal`, `PopoverPositioner`/`PopoverContent` (anchored popup, not centered like Dialog's `Popup`), matching the project's existing `cn()` className conventions and CSS variable usage (`--s-border-card`, `--s-bg-card`).

#### 2. Heat toggle + confirm + indicator on `RoomGroup`

**File**: `src/app/_components/room-group.tsx`

**Intent**: Let an admin toggle a room's heat off/on from its card, with a confirm step before turning off, and show a distinct indicator when the room is pinned off — without disturbing the existing health badge.

**Contract**: `RoomGroupProps` gains `pinnedOff?: boolean` and `onToggleHeat?: (pinnedOff: boolean) => void` (mirroring the existing `onDeviceClick` callback-prop pattern, so `device-overview.tsx` wires the actual `api.room.toggleHeat.useMutation()` call, not `RoomGroup` itself). Render a toggle control next to the existing badge (`room-group.tsx:120-129`) — turning off opens the new `Popover` with a one-line confirm + Confirm/Cancel buttons; turning back on calls `onToggleHeat(false)` directly (no confirm needed for re-enabling). When `pinnedOff` is true, render a visually distinct indicator (a `Badge` variant using a color not already in `ROOM_STATUS_BADGE_CLASSES`, e.g. amber, with text like "Manually off") next to/below the room title, independent of the health `badge` prop's rendering. Verify at the existing mobile breakpoint already tested for `RoomGroup` (375px) — the toggle and indicator must remain usable there.

#### 3. Wire the mutation at call sites

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Connect `RoomGroup`'s new `pinnedOff`/`onToggleHeat` props to the live `room.toggleHeat` mutation and the overview query's new fields, at all three existing `RoomGroup` render sites (`device-overview.tsx:984`, `1016`, `1039` — note the third, "unassigned" site, never needs a toggle since it has no `roomId`/room data).

**Contract**: Add `const toggleHeat = api.room.toggleHeat.useMutation({ onSuccess: () => utils.device.overview.invalidate() })` (mirrors the existing mutation + invalidate pattern already used elsewhere in this file for setpoint/plug mutations). Pass `pinnedOff={room.pinnedOff}` and `onToggleHeat={(pinnedOff) => toggleHeat.mutate({ roomId: room.roomId, pinnedOff })}` at the two room-rendering call sites only.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] On the dashboard, clicking a room's heat toggle to turn it off shows the inline confirm popover; confirming closes the popover and the card shows the manually-off indicator within ~1 second
- [ ] The manually-off indicator is visually distinct from the OK/Too Cold/Too Hot badge and does not collide with it in color
- [ ] Clicking the toggle again on a pinned-off room turns heat back on with no confirm step, and the indicator disappears
- [ ] The toggle and indicator are usable at a 375px mobile viewport
- [ ] A pinned-off room with temperature below threshold still shows "Too Cold" on the existing health badge, unaffected by the pin

---

## Phase 5: Tests

### Overview

Add automated coverage mirroring the project's existing test conventions (Vitest, hoisted DB/auth mocks, Drizzle chain mocking).

### Changes Required:

#### 1. `room.toggleHeat` mutation tests

**File**: `src/server/api/routers/room.toggle-heat.test.ts` (new file, named after the precedent set by `device.setpoint.test.ts` for mutations with Tuya-client mocking needs)

**Intent**: Cover the pin-persists-regardless-of-device-errors behavior, the not-found guard, and the on/off DP direction.

**Contract**: Mirror `room.test.ts`'s mocking conventions (hoisted DB mock, Drizzle chain `.select().from().where()` mocks). Cases: room not found → `NOT_FOUND`; toggling off with all valves succeeding → pin persisted, `sendValveStateCommand` called with `isOpen: false` for each valve device; toggling off with one valve's command rejecting → pin still persisted (`roomHeatState` upsert still happens), `deviceErrors` includes the failed device, the mutation does not throw; toggling on → `sendValveStateCommand` called with `isOpen: true`.

#### 2. `device.setpoint` inert-while-pinned test

**File**: `src/server/api/routers/device.setpoint.test.ts` (existing file, add cases)

**Intent**: Confirm the new guard added in Phase 2.3 doesn't regress the existing setpoint cases and correctly short-circuits when pinned.

**Contract**: New test case: device's room has `roomHeatState.pinnedOff = true` → `sendSetpointCommand` (or its mock) is NOT called, mutation still returns `{ success: true, setpointC }`. Existing cases (room not pinned, device not found, etc.) continue passing unmodified.

#### 3. Automation-scheduler skip test

**File**: `src/server/workers/automation-scheduler.test.ts` (existing file, add a case)

**Intent**: Confirm a pinned room's rule is skipped and logged, mirroring the existing temp-threshold-skip test in the same file.

**Contract**: New test case following the existing "skipped — temperature condition not met" test's shape: room pinned off → `sendSetpointCommand` mock not called, `logExecution`/`automationExecutionLogs` insert called with `status: "skipped"` and the new reason text.

#### 4. `sendValveStateCommand` test

**File**: `src/server/lib/valve-control.test.ts` (new file)

**Intent**: Cover the new helper's happy path and error vocabulary, mirroring whatever test exists (or the device.setpoint test's mocking approach if `valve-control.ts` has no dedicated test today) for `sendSetpointCommand`.

**Contract**: Cases: device not found → throws `DEVICE_NOT_FOUND`; productKey not in `VALVE_STATE_DP_CODE_MAP` → throws `UNSUPPORTED_DEVICE`; happy path → `client.sendSwitch` called with the DP-3 dps value and the correct boolean `set`.

### Success Criteria:

#### Automated Verification:

- [ ] All new and existing unit tests pass: `npm run test`
- [ ] Full local CI gate passes: `npm run ci` (Biome check, `tsc --noEmit`, `vitest run`, `next build` — per the existing `package.json` script and `.github/workflows/ci.yml`)

#### Manual Verification:

- [ ] Test output shows no skipped/pending tests related to this change

---

## Testing Strategy

### Unit Tests:

- `room.toggleHeat`: not-found guard, best-effort multi-valve persistence, on/off DP direction
- `device.setpoint`: inert short-circuit when room pinned
- `automation-scheduler`: skip-and-log when room pinned, ordered before the temp-threshold check
- `valve-control.sendValveStateCommand`: error vocabulary parity with `sendSetpointCommand`, correct DP/boolean

### Integration Tests:

- None planned beyond the existing router-level tests above — no end-to-end test harness exists in this project for tRPC + live device flows; `device.overview`'s extended shape is covered implicitly by the existing overview tests plus the new pin-state assertions added in Phase 2.

### Manual Testing Steps:

1. Toggle a room with a single valve device off; confirm the live device's `valve_state` flips closed and the dashboard shows the manually-off indicator within ~1 second.
2. With that room pinned off, edit its setpoint; confirm the live device's setpoint DP does not change.
3. Wait for (or trigger) an automation tick targeting that room's device; confirm an `automation_execution_log` row with `status: "skipped"`.
4. Toggle the room back on; confirm the indicator disappears and a subsequent setpoint edit or automation tick reaches the device normally.
5. Toggle a room with two valve devices off while one device is offline; confirm the pin still persists and the dashboard reflects pinned-off, with the offline device's failure surfaced (not silently swallowed, not blocking).
6. Verify the toggle and indicator at a 375px viewport.

## Performance Considerations

None beyond what already exists — the new mutation and queries follow the same per-request DB/device patterns as `setThreshold`/`setpoint`; no new polling loops or N+1 query patterns are introduced (the pin-state lookup in `device.overview` is a single additional flat query, same as `roomThresholds`).

## Migration Notes

Additive only — `roomHeatState` has no backfill requirement (absence of a row means "not pinned," which is the correct default for every existing room). No data migration for `devices` or `rooms` is needed.

## References

- Original discussion notes: `context/changes/room-heat-toggle/change.md`
- Shaped requirements: `context/foundation/shape-notes.md`
- PRD: `context/foundation/prd-v4.md`
- Pattern to mirror (room mutation): `src/server/api/routers/room.ts:287-331` (`setThreshold`)
- Pattern to mirror (device command guard): `src/server/api/routers/device.ts:28-77` (`setpoint`)
- Pattern to mirror (automation skip): `src/server/workers/automation-scheduler.ts:90-100`
- Pattern to mirror (boolean DP write): `src/server/lib/plug-control.ts:10-74` (`sendPlugCommand`)
- Pattern to mirror (UI primitive wrapper): `src/components/ui/dialog.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model

#### Automated

- [x] 1.1 Migration applies cleanly: `npm run db:migrate` — a23170e
- [x] 1.2 Type checking passes: `npm run typecheck` — a23170e
- [x] 1.3 Linting passes: `npm run lint` — a23170e

#### Manual

- [x] 1.4 Confirm the generated migration file only adds the new table — a23170e

### Phase 2: Backend mutations

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 3f54b71
- [x] 2.2 Linting passes: `npm run lint` — 3f54b71
- [x] 2.3 Unit tests pass: `npm run test` — 3f54b71

#### Manual

- [x] 2.4 Toggling a room off via direct call flips the live valve's `valve_state` DP — 3f54b71
- [x] 2.5 Setpoint edit against a pinned-off room's valve does not change the device's live setpoint — 3f54b71
- [x] 2.6 `device.overview` response includes `pinnedOff`/`pinnedAt` — 3f54b71

### Phase 3: Automation guard

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck`
- [x] 3.2 Unit tests pass: `npm run test`

#### Manual

- [ ] 3.3 Pinned room + enabled rule produces a `skipped` execution log and no device write

### Phase 4: Dashboard UI

#### Automated

- [ ] 4.1 Type checking passes: `npm run typecheck`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Build succeeds: `npm run build`

#### Manual

- [ ] 4.4 Confirm popover appears on turn-off and the indicator shows within ~1 second
- [ ] 4.5 Indicator is visually distinct from the health badge
- [ ] 4.6 Turning back on has no confirm step and clears the indicator
- [ ] 4.7 Toggle and indicator usable at 375px viewport
- [ ] 4.8 Pinned-off + cold room still shows "Too Cold" on the health badge

### Phase 5: Tests

#### Automated

- [ ] 5.1 All new and existing unit tests pass: `npm run test`
- [ ] 5.2 Full local CI gate passes: `npm run ci`

#### Manual

- [ ] 5.3 No skipped/pending tests related to this change
