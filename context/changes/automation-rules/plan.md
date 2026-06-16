# Automation Rules Implementation Plan

## Overview

Implement time-based automation rules that allow an admin to schedule a heating valve setpoint command for a specific time-of-day and days-of-week, optionally guarded by a room temperature condition ("only fire if room < X °C"). Rules are persisted, listed, individually toggled, and deleted through the Setup → Automations tab. Execution is logged to a stub table (UI deferred to S-12). An in-process node-cron scheduler fires rules every minute alongside the existing polling loop.

## Current State Analysis

- S-01 (device overview) and S-04 (valve setpoint control) are both done — all dependencies are satisfied.
- `src/instrumentation.ts` registers the Next.js startup hook; `startPollingLoop()` is already called there. The automation scheduler hooks into the same file.
- `src/server/workers/tuya-poller.ts` uses `setInterval` at 30 s cadence. No cron library is installed yet.
- `src/server/db/schema.ts` has 7 tables: `sites`, `users`, `gateways`, `rooms`, `devices`, `deviceRoomAssignments`, `deviceTemperatureReadings`, `roomThresholds`. No automation tables.
- `src/server/api/root.ts` registers `device`, `room`, `site` routers. No `automation` router.
- `src/app/_components/setup/setup-shell.tsx` has an Automations `TabsTrigger` that is `disabled` with placeholder text. The tab content slot exists and is ready to receive a component.
- The valve setpoint Tuya command is inlined in the `device.setpoint` tRPC mutation (≈80 lines). The scheduler needs the same logic — it must be extracted to a shared helper before the scheduler is wired.
- `node-cron` is not installed. `date-fns` is available but not needed for cron scheduling.
- Days-of-week must use JavaScript `Date.getDay()` convention (0 = Sunday … 6 = Saturday) so the cron tick comparison is a direct match with no conversion.

## Desired End State

An admin can open Setup → Automations, create a rule by choosing a valve device, days of week, fire time (HH:MM), target setpoint, and an optional "only fire if room < X °C" temperature guard. Created rules appear in a list with their status (enabled/disabled), can be toggled on/off and deleted. Every minute, the in-process scheduler checks all enabled rules against the current server local time; matching rules evaluate the temperature condition (if set) and send the valve command. Each execution — success, failure, or skipped — is written to the execution log table. Overlapping rules (same room, same day overlap, same minute) are rejected at creation time with a clear error.

### Key Discoveries:

- `src/instrumentation.ts:3-4` — `startPollingLoop()` is imported dynamically and called inside `register()` guarded by `NEXT_RUNTIME === "nodejs"`. The same pattern applies to `startAutomationScheduler()`.
- `src/server/api/routers/device.ts:25-106` — `device.setpoint` mutation contains the full Tuya send path (device lookup → DP code check → gateway fetch → key decrypt → `client.sendSetpoint()`). This block must be extracted before the scheduler can reuse it.
- `src/server/db/schema.ts:8-10` — table prefix is `.bootstrap-scaffold_` via `sqliteTableCreator`. All new tables must use the same `createTable` helper.
- `src/server/db/schema.ts:136-158` — `deviceRoomAssignments` is the join that links a device to its room. Conflict detection and temperature evaluation both require this join.
- `src/server/lib/device-state-store.ts` — in-memory map keyed by `tuyaDeviceId` with `{ temperatureC, isOnline, lastPolledAt, … }`. The scheduler reads room sensor temperatures from here (no extra DB read needed for condition evaluation).
- `src/app/_components/setup/setup-shell.tsx:48` — `<TabsTrigger disabled value="automations">` is the only line that needs changing to enable the tab.

## What We're NOT Doing

- No execution log UI — S-12 owns that; this change only writes the table rows.
- No retry on failed valve commands — failure is logged and skipped; the next matching tick retries naturally.
- No per-site timezone — scheduler uses server local time (`process.env.TZ` / system timezone).
- No temperature-condition operator choices (above/below/not-at-setpoint) — only "only if room < X °C" is supported.
- No room-level rule targeting — rules target a specific valve device.
- No OS-level cron or external job runner.
- No rule priority or manual ordering — conflicts are blocked at creation; two rules in the same room at the same minute are rejected.

## Implementation Approach

Six sequential phases: schema → shared valve helper → tRPC router → scheduler worker → frontend → tests. Each phase is independently mergeable and verifiable. The shared valve helper (Phase 2) must land before the scheduler (Phase 4) because both call the same code path. The tRPC router (Phase 3) must land before the frontend (Phase 5). Tests (Phase 6) cover the three pure-logic units: conflict detection, temperature condition evaluation, and the scheduler tick dispatcher.

## Critical Implementation Details

**Days-of-week encoding**: store as a JSON-encoded array of integers using `Date.getDay()` convention (0 = Sunday, 1 = Monday … 6 = Saturday). The cron tick reads `new Date().getDay()` and checks membership in the parsed array — no mapping required. Validate with `z.array(z.number().int().min(0).max(6)).min(1).max(7)` at the tRPC layer; no DB-level check constraint needed.

**Conflict detection scope**: Two rules conflict when they share at least one day-of-week value AND the same `fireHour` + `fireMinute` AND their target devices belong to the same room. The check is room-scoped even though rules target individual devices — a valve in Room A and another valve in Room A at 07:00 Monday are a conflict. If the target device has no room assignment, skip the conflict check (allow the rule, since no room context exists).

**Temperature condition evaluation order**: the scheduler skips execution (status = `'skipped'`) only when a threshold is set AND a room average can be computed AND that average is ≥ the threshold. If the device has no room assignment, no sensors exist in the room, or no fresh state-store readings are available, the condition is treated as met and execution proceeds — erring on the side of heating.

**Scheduler tick is stateless**: rules are read from the DB on every minute tick. There is no in-memory rule cache. Changes (create/toggle/delete) take effect on the next minute with no explicit reload signal.

---

## Phase 1: Schema

### Overview

Add two tables to the schema and generate + apply the migration. No application logic changes.

### Changes Required:

#### 1. New tables in schema

**File**: `src/server/db/schema.ts`

**Intent**: Add `automationRules` and `automationExecutionLogs` tables using the existing `createTable` pattern.

**Contract**:

`automationRules` columns:
- `id` — text UUID PK, `$defaultFn(() => crypto.randomUUID())`
- `name` — `text({ length: 255 }).notNull()`
- `deviceId` — `text("device_id", { length: 255 }).notNull().references(() => devices.id, { onDelete: "cascade" })`
- `daysOfWeek` — `text("days_of_week", { length: 20 }).notNull()` — JSON array, e.g. `"[1,2,3,4,5]"`
- `fireHour` — `integer("fire_hour").notNull()` — 0–23
- `fireMinute` — `integer("fire_minute").notNull()` — 0–59
- `targetSetpointC` — `real("target_setpoint_c").notNull()` — 5–35
- `tempThresholdC` — `real("temp_threshold_c")` — nullable; skip fire if room avg ≥ this
- `isEnabled` — `integer("is_enabled", { mode: "boolean" }).notNull().default(true)`
- `createdAt`, `updatedAt` — same pattern as existing tables
- Index: `automation_rule_device_idx` on `deviceId`
- Check constraint: `automation_rule_hour_check` — `fireHour BETWEEN 0 AND 23`
- Check constraint: `automation_rule_minute_check` — `fireMinute BETWEEN 0 AND 59`

`automationExecutionLogs` columns:
- `id` — text UUID PK
- `ruleId` — `text("rule_id", { length: 255 }).notNull().references(() => automationRules.id, { onDelete: "cascade" })`
- `firedAt` — `integer("fired_at", { mode: "timestamp" }).notNull()`
- `status` — `text({ length: 10 }).notNull()` — `'success' | 'failed' | 'skipped'`
- `error` — `text({ length: 500 })` — nullable; populated on `'failed'`
- `createdAt` — timestamp default
- Index: `exec_log_rule_idx` on `ruleId`
- Index: `exec_log_fired_at_idx` on `firedAt`
- Check constraint: `exec_log_status_check` — `status IN ('success', 'failed', 'skipped')`

#### 2. Generate and apply migration

**File**: run `npm run db:generate` then `npm run db:migrate`

**Intent**: Produce the SQL migration file and apply it to the local SQLite database so subsequent phases can read/write the new tables.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npm run db:generate && npm run db:migrate`
- Type checking passes: `npm run typecheck`

#### Manual Verification:

- `npm run db:studio` — both new tables are visible with the expected columns
- Inserting a test row via Drizzle Studio and reading it back succeeds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Shared Valve-Control Helper

### Overview

Extract the Tuya send-setpoint path from `device.setpoint` into a shared library function. Update the tRPC mutation to delegate to the helper. The scheduler (Phase 4) will also call this function — without this extraction the scheduler would duplicate 80 lines of device/gateway lookup logic.

### Changes Required:

#### 1. New shared helper

**File**: `src/server/lib/valve-control.ts`

**Intent**: Create `sendSetpointCommand(deviceId: string, setpointC: number): Promise<void>` that encapsulates the full setpoint send path: device lookup, DP code guard, gateway fetch, local key decryption, and `client.sendSetpoint()` call. On any error (device not found, unsupported device, gateway missing, key decrypt failure, Tuya command failure) it throws a typed error that callers can catch and log.

**Contract**: The function signature is `async function sendSetpointCommand(deviceId: string, setpointC: number): Promise<void>`. Errors are plain `Error` instances with a `.message` matching the existing tRPC error message strings (`"UNSUPPORTED_DEVICE"`, `"DEVICE_NOT_PAIRED"`, `"COMMAND_FAILED"`, etc.) so the scheduler's catch block can log them meaningfully. The function does NOT throw `TRPCError` — that type stays in the router layer.

#### 2. Update device.setpoint tRPC mutation

**File**: `src/server/api/routers/device.ts`

**Intent**: Replace the inlined Tuya send logic (approximately lines 33–103) with a single `await sendSetpointCommand(input.deviceId, input.setpointC)` call. Wrap it in a `try/catch` that re-throws as `TRPCError` with the appropriate code, preserving the existing error contract exactly.

**Contract**: External behavior of `device.setpoint` is unchanged — same input schema, same return type `{ success: true, setpointC: number }`, same `TRPCError` codes and messages on failure.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`
- Existing setpoint-related tests pass: `npm run test`

#### Manual Verification:

- Open device modal, adjust a valve setpoint — confirm success toast still appears
- Trigger an unsupported-device error — confirm "UNSUPPORTED_DEVICE" error message still surfaces

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: tRPC Automation Router

### Overview

Create the `automationRouter` with four procedures, register it in the root router, and wire conflict detection at save time.

### Changes Required:

#### 1. New router file

**File**: `src/server/api/routers/automation.ts`

**Intent**: Define `automationRouter` with the following procedures.

**`automation.list`** — `protectedProcedure`, input: `{ siteId: z.string() }`.

Returns all automation rules for devices belonging to the given site. Join: `automationRules` → `devices` (for device name and `tuyaDeviceId`) → `deviceRoomAssignments` → `rooms` (for room name). Result shape per rule: `{ id, name, deviceId, deviceName, roomName | null, daysOfWeek: number[], fireHour, fireMinute, targetSetpointC, tempThresholdC: number | null, isEnabled }`. Parse `daysOfWeek` from JSON before returning.

**`automation.create`** — `protectedProcedure`, input:
```ts
z.object({
  name: z.string().min(1).max(255),
  deviceId: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  fireHour: z.number().int().min(0).max(23),
  fireMinute: z.number().int().min(0).max(59),
  targetSetpointC: z.number().min(5).max(35),
  tempThresholdC: z.number().min(5).max(35).optional(),
})
```

**Intent**: Validate, run conflict detection, then insert the new rule. Return the inserted row's `id`.

**Conflict detection logic** (run inside the mutation before insert):
1. Find the target device — verify it exists and its `deviceType === 'valve'`; throw `BAD_REQUEST / "NOT_A_VALVE"` otherwise.
2. Look up the device's room via `deviceRoomAssignments` where `deviceId = input.deviceId`. If no room assignment, skip conflict check.
3. Find all device IDs assigned to the same room via `deviceRoomAssignments where roomId = <room>`.
4. Find all enabled rules where `deviceId IN <roomDeviceIds>`.
5. For each such rule: parse its `daysOfWeek` array; check if `input.daysOfWeek` intersects AND `rule.fireHour === input.fireHour` AND `rule.fireMinute === input.fireMinute`.
6. If any conflict found: throw `TRPCError({ code: "BAD_REQUEST", message: "RULE_CONFLICT" })`.

**`automation.delete`** — `protectedProcedure`, input: `{ id: z.string() }`. Delete the rule by ID. Execution logs cascade-delete via FK. Return `{ success: true }`.

**`automation.toggle`** — `protectedProcedure`, input: `{ id: z.string(), isEnabled: z.boolean() }`. Update `isEnabled` and `updatedAt`. Return `{ success: true }`.

#### 2. Register router in root

**File**: `src/server/api/root.ts`

**Intent**: Import `automationRouter` and add `automation: automationRouter` to the `createCallerFactory` router map, following the existing `device`, `room`, `site` pattern.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`
- All existing tests pass: `npm run test`

#### Manual Verification:

- `npm run db:studio` — create a test rule row directly; call `automation.list` via tRPC devtools or curl and confirm the row appears
- Attempt to create two rules for devices in the same room at the same time on overlapping days — confirm `RULE_CONFLICT` error
- Attempt to create a rule targeting a sensor device — confirm `NOT_A_VALVE` error

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Automation Scheduler Worker

### Overview

Install `node-cron`, create the scheduler worker that fires every minute, and wire it into `src/instrumentation.ts` alongside the existing polling loop.

### Changes Required:

#### 1. Install node-cron

**File**: `package.json` (via `npm install`)

**Intent**: Run `npm install node-cron` and `npm install --save-dev @types/node-cron` to add the cron library. Verify it appears in `dependencies` in `package.json`.

#### 2. New scheduler worker

**File**: `src/server/workers/automation-scheduler.ts`

**Intent**: Export `startAutomationScheduler(): void`. When called, register a node-cron job on the `* * * * *` pattern (every minute) that calls an async `runAutomationTick()` function. Log `[automation-scheduler] tick` at the start of each execution.

**`runAutomationTick()`** logic:
1. Capture `now = new Date()`, extract `currentDay = now.getDay()`, `currentHour = now.getHours()`, `currentMinute = now.getMinutes()`.
2. Fetch all enabled rules from DB: `select from automationRules where isEnabled = true`.
3. For each rule:
   a. Parse `daysOfWeek` from JSON; skip if `currentDay` not in array.
   b. Skip if `rule.fireHour !== currentHour || rule.fireMinute !== currentMinute`.
   c. If `rule.tempThresholdC` is set: call `getRoomAvgTemperature(rule.deviceId)` (see below); if result is non-null and `result >= rule.tempThresholdC`, insert execution log with `status = 'skipped'`, `error = 'Temperature condition not met'`, continue.
   d. Call `await sendSetpointCommand(rule.deviceId, rule.targetSetpointC)`.
   e. On success: insert log row with `status = 'success'`.
   f. On error: insert log row with `status = 'failed'`, `error = err.message`.
4. Log `[automation-scheduler] tick done — N rules evaluated, M fired`.

**`getRoomAvgTemperature(deviceId: string): Promise<number | null>`** (private helper):
1. Query `deviceRoomAssignments` to find the room for `deviceId`. If no assignment, return `null`.
2. Query `deviceRoomAssignments` for all devices in that room.
3. Query `devices` for those IDs filtering `deviceType = 'sensor'`.
4. For each sensor device, look up `deviceStateStore.get(tuyaDeviceId)`. Collect non-null `temperatureC` values whose `lastPolledAt` is within 5 minutes.
5. Return average of collected values, or `null` if none.

**Contract**: The module imports `sendSetpointCommand` from `~/server/lib/valve-control`, `db` from `~/server/db`, the schema tables, and `deviceStateStore`. It does NOT import anything from the tRPC layer.

#### 3. Wire scheduler into instrumentation

**File**: `src/instrumentation.ts`

**Intent**: Add a dynamic import of `startAutomationScheduler` inside the `NEXT_RUNTIME === "nodejs"` block, called immediately after `startPollingLoop()`.

**Contract**:
```ts
const { startAutomationScheduler } = await import("~/server/workers/automation-scheduler");
startAutomationScheduler();
```

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`
- All existing tests pass: `npm run test`

#### Manual Verification:

- Start dev server (`npm run dev`); check server console for `[automation-scheduler] tick` log at the top of each minute
- Insert a test rule in Drizzle Studio set to fire 1 minute from now on the current day; observe the tick log and confirm an execution log row appears in the DB with `status = 'success'` or `'failed'`
- Insert a rule with a temperature threshold above the current room reading; confirm `status = 'skipped'` row in execution log

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Frontend UI

### Overview

Enable the automations tab in the Setup shell and build the `AutomationManager` and `AutomationForm` components.

### Changes Required:

#### 1. Enable automations tab

**File**: `src/app/_components/setup/setup-shell.tsx`

**Intent**: Remove the `disabled` prop from `<TabsTrigger value="automations">` and replace the placeholder `<p>` in the `automations` `TabsContent` with `<AutomationManager activeSiteId={activeSiteId} rooms={rooms} utils={utils} />`. Filter valve-only devices from `allDevices` and pass as a `valveDevices` prop.

**Contract**: The existing tab structure (Rooms, Devices, Automations, Sites) is unchanged in order and layout. The Automations tab is now interactive.

#### 2. AutomationManager component

**File**: `src/app/_components/setup/automation-manager.tsx`

**Intent**: Render a list of existing automation rules and an "Add rule" button. Each list row shows: rule name, device name, room name (or "–" if unassigned), days abbreviations (Mon Tue …), fire time (HH:MM), target setpoint, temperature threshold ("< X °C" or "—"), enabled/disabled badge with a toggle button, and a delete button. The "Add rule" button reveals the `AutomationForm`. Empty state: "No automation rules yet. Add one to get started."

**Contract**: Queries `api.automation.list.useQuery({ siteId: activeSiteId })`. Toggle calls `api.automation.toggle.useMutation()` with `{ id, isEnabled: !rule.isEnabled }`. Delete calls `api.automation.delete.useMutation()` with `{ id }` after a confirmation. On mutation success, invalidate `api.automation.list`. Day abbreviations: `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]` indexed by day number.

#### 3. AutomationForm component

**File**: `src/app/_components/setup/automation-form.tsx`

**Intent**: Render a controlled form with six fields: rule name (text input), device selector (dropdown filtered to `deviceType === 'valve'`), days-of-week checkboxes (all 7 days), time picker (two selects or a time input for HH:MM), target setpoint (number input 5–35), and optional temperature threshold (number input 5–35, clearly labelled "Only fire if room < X °C — leave empty to always fire"). Submit button triggers `api.automation.create.mutate(…)`. On `RULE_CONFLICT` error, show an inline message: "A rule already targets this room at the same time on one or more of the selected days." On `NOT_A_VALVE` error: "Only valve devices can be targeted."

**Contract**: Form state is local React state. On successful mutation: call `utils.automation.list.invalidate()` and collapse the form. Time values are parsed from the HH:MM string into separate `fireHour` and `fireMinute` integers before calling the mutation. `daysOfWeek` is a `number[]` built from checked checkbox values.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`

#### Manual Verification:

- Setup → Automations tab is accessible (no longer disabled)
- Empty state message displays when no rules exist
- Creating a rule with all fields fills the list with the new row
- Creating a conflicting rule shows the "same room at the same time" error message
- Toggling a rule's enabled state updates the badge immediately (optimistic or refetch)
- Deleting a rule removes it from the list
- The "Only fire if room < X °C" field can be left empty (rule fires unconditionally)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Unit Tests

### Overview

Write Vitest unit tests for the three pure-logic units: scheduler tick dispatch, conflict detection, and temperature condition evaluation. Follow the patterns established in `tuya-poller.test.ts` (vi.mock for DB and external deps, no real I/O).

### Changes Required:

#### 1. Scheduler tick tests

**File**: `src/server/workers/automation-scheduler.test.ts`

**Intent**: Test `runAutomationTick` in isolation. Mock `db` (rules query), `sendSetpointCommand`, and `deviceStateStore`. Verify:
- A rule whose `daysOfWeek` does not match current day is not executed
- A rule whose `fireHour`/`fireMinute` does not match current time is not executed
- A matching rule without a temperature threshold calls `sendSetpointCommand` with correct args
- A matching rule with a temperature threshold where room avg ≥ threshold does NOT call `sendSetpointCommand` and inserts a `'skipped'` log row
- A matching rule where `sendSetpointCommand` throws inserts a `'failed'` log row with the error message
- A matching rule on success inserts a `'success'` log row

#### 2. Conflict detection tests

**File**: `src/server/api/routers/automation.test.ts`

**Intent**: Test the conflict detection logic extracted into a pure function (or tested via mock DB calls). Verify:
- Two rules in different rooms at the same time on the same day are NOT a conflict
- Two rules for devices in the same room at different times on the same day are NOT a conflict
- Two rules for devices in the same room at the same time on non-overlapping days are NOT a conflict
- Two rules for devices in the same room at the same time on one overlapping day ARE a conflict
- A rule for a device with no room assignment is NOT blocked

#### 3. Temperature condition evaluation tests

**File**: `src/server/workers/automation-scheduler.test.ts` (same file as tick tests)

**Intent**: Test `getRoomAvgTemperature` in isolation (if exported for testing; otherwise test via the tick mock). Verify:
- Returns `null` when device has no room assignment
- Returns `null` when room has no sensor devices
- Returns `null` when sensors exist but all state-store entries are stale (> 5 min)
- Returns the average of non-null fresh readings when sensors are available
- A single sensor with a fresh reading returns that reading's value directly

### Success Criteria:

#### Automated Verification:

- All new tests pass: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`
- CI script passes: `npm run ci`

#### Manual Verification:

- Test output shows all new test names in the passing list with no skipped tests

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Scheduler tick dispatch — mock DB, `sendSetpointCommand`, `deviceStateStore`; 6 scenarios
- Conflict detection — mock DB joins; 5 boundary cases
- Temperature condition evaluation — mock DB + state store; 5 scenarios

### Integration Tests:

None in this change — tRPC layer is tested manually via Drizzle Studio + dev server.

### Manual Testing Steps:

1. Open Setup → Automations tab — confirm it is no longer disabled
2. Create a rule targeting a valve with no temperature threshold, set 1 minute from now
3. Wait for the next minute tick — check server logs and `automationExecutionLogs` table in Drizzle Studio
4. Create a rule with a temperature threshold above the current room temperature — confirm `skipped` log row
5. Create a conflicting rule (same room, same day, same minute) — confirm inline error
6. Toggle a rule off — confirm it does not fire on the next matching tick
7. Delete a rule — confirm it disappears from the list and `automationExecutionLogs` rows are deleted

## Performance Considerations

Scheduler tick reads all enabled rules once per minute. For a small fleet (< 100 rules), this is negligible. The `automation_rule_device_idx` index supports the conflict-detection query. No caching is needed.

## Migration Notes

Two new tables; no existing data is migrated. The migration is purely additive — no existing table is altered.

## References

- Related roadmap entry: `context/foundation/roadmap.md` — section `### S-11: Automation rules`
- Polling loop pattern: `src/server/workers/tuya-poller.ts`
- Scheduler entry point: `src/instrumentation.ts`
- Setpoint send path: `src/server/api/routers/device.ts:25-106`
- Schema pattern: `src/server/db/schema.ts`
- Test pattern: `src/server/workers/tuya-poller.test.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema

#### Automated

- [x] 1.1 Migration applies cleanly: `npm run db:generate && npm run db:migrate` — 932a7c2
- [x] 1.2 Type checking passes: `npm run typecheck` — 932a7c2

#### Manual

- [x] 1.3 Both new tables visible in Drizzle Studio with expected columns — 932a7c2
- [x] 1.4 Test row insert/read via Drizzle Studio succeeds — 932a7c2

### Phase 2: Shared Valve-Control Helper

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — e244f8a
- [x] 2.2 Linting passes: `npm run check` — e244f8a
- [x] 2.3 Existing setpoint-related tests pass: `npm run test` — e244f8a

#### Manual

- [x] 2.4 Device modal setpoint adjustment still works (success toast) — e244f8a
- [x] 2.5 Unsupported-device error still surfaces correctly — e244f8a

### Phase 3: tRPC Automation Router

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck`
- [x] 3.2 Linting passes: `npm run check`
- [x] 3.3 All existing tests pass: `npm run test`

#### Manual

- [x] 3.4 `automation.list` returns rules from DB
- [x] 3.5 Conflicting rule creation returns `RULE_CONFLICT`
- [x] 3.6 Non-valve device target returns `NOT_A_VALVE`

### Phase 4: Automation Scheduler Worker

#### Automated

- [ ] 4.1 Type checking passes: `npm run typecheck`
- [ ] 4.2 Linting passes: `npm run check`
- [ ] 4.3 All existing tests pass: `npm run test`

#### Manual

- [ ] 4.4 `[automation-scheduler] tick` log appears at the top of each minute
- [ ] 4.5 Test rule fires and produces `success` or `failed` execution log row
- [ ] 4.6 Temperature-guarded rule produces `skipped` row when condition not met

### Phase 5: Frontend UI

#### Automated

- [ ] 5.1 Type checking passes: `npm run typecheck`
- [ ] 5.2 Linting passes: `npm run check`

#### Manual

- [ ] 5.3 Automations tab accessible (not disabled)
- [ ] 5.4 Empty state message displayed with no rules
- [ ] 5.5 Rule creation populates list
- [ ] 5.6 Conflict error message shown on duplicate time/room
- [ ] 5.7 Toggle and delete work correctly
- [ ] 5.8 Optional temperature threshold field works (empty = always fire)

### Phase 6: Unit Tests

#### Automated

- [ ] 6.1 All new tests pass: `npm run test`
- [ ] 6.2 Type checking passes: `npm run typecheck`
- [ ] 6.3 Linting passes: `npm run check`
- [ ] 6.4 CI script passes: `npm run ci`

#### Manual

- [ ] 6.5 All new test names visible in passing list, no skipped tests
