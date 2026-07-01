# Event Log Retention — Implementation Plan

## Overview

Add `purgeOldEvents()` to `tuya-poller.ts` so old `event_log` rows are
deleted every ~30 min via the existing poll-counter gate. The function is an
exact structural copy of `purgeOldReadings()` — same constant, same gate,
same error-handling pattern.

## Current State Analysis

`tuya-poller.ts` already purges `device_temperature_readings` every 60 polls
(~30 min) via `purgeOldReadings()` (lines 21–34) and a poll-counter gate
(lines 133–136). `event_log` was added in the event-log change and hooks into
the poller for connectivity events — but no retention job was added (explicit
non-goal of that change).

**Key Discoveries:**

- `RETENTION_MS = 30 * 24 * 60 * 60 * 1000` at `tuya-poller.ts:16` — shared
  by both purges (both 30-day windows)
- `eventLog` already imported at `tuya-poller.ts:6` — zero import changes
- `lt` already imported at `tuya-poller.ts:1` — zero import changes
- `event_log_created_at_idx` on `eventLog.createdAt` at `schema.ts:437` —
  range deletes are index-backed
- Test suite `describe("purgeOldReadings")` at `tuya-poller.test.ts:244–317`
  has 3 tests — exact template to follow for `purgeOldEvents()`

## Desired End State

`purgeOldEvents()` exists in `tuya-poller.ts`, deletes `event_log` rows where
`createdAt < cutoff` (cutoff = now − 30 days), and is called from the
existing gate block after `purgeOldReadings()`. Three parallel unit tests
cover: cutoff semantics, success logging, and DB-error swallowing.

Verification: `npm run test -- tuya-poller` passes with the new describe
block included.

## What We're NOT Doing

- No separate retention constant — `RETENTION_MS` is shared (both windows are 30 days)
- No configurable retention window via env var (out of scope)
- No UI for retention settings
- No migration — event_log.createdAt column and index already exist
- No change to purge frequency — reuses PURGE_EVERY_N_POLLS as-is

## Implementation Approach

Structural copy of `purgeOldReadings()` pattern with `eventLog.createdAt`
substituted for `deviceTemperatureReadings.recordedAt`. Call added to the
existing gate block. Tests follow the existing describe block structure
one-for-one.

---

## Phase 1: Add purgeOldEvents() and tests

### Overview

Add the purge function, wire it into the gate, add 3 unit tests mirroring
the `purgeOldReadings` suite.

### Changes Required

#### 1. Add `purgeOldEvents()` to tuya-poller.ts

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: Add a new exported async function `purgeOldEvents()` that
deletes `event_log` rows older than 30 days, using the same try/catch and
structured-logger pattern as `purgeOldReadings()`.

**Contract**: Place immediately after `purgeOldReadings()` (after line 34).
Uses `eventLog.createdAt` (not `recordedAt`). Log tag:
`"tuya-poller.event-purge-complete"`. Error log: `"Error purging old events"`.
Signature: `export async function purgeOldEvents(): Promise<void>`.

#### 2. Wire into poll-counter gate

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: Call `purgeOldEvents()` from the existing gate block so both
purges run on the same cadence (~30 min).

**Contract**: The gate block at line 134 becomes:
```ts
if (pollCounter % PURGE_EVERY_N_POLLS === 0) {
    await purgeOldReadings();
    await purgeOldEvents();
}
```

#### 3. Add `describe("purgeOldEvents")` test suite

**File**: `src/server/workers/tuya-poller.test.ts`

**Intent**: Three tests mirroring `describe("purgeOldReadings")` — cutoff
semantics, success logging, and DB-error swallowing — to prove the new
function behaves identically to the existing one.

**Contract**: Import `purgeOldEvents` alongside `purgeOldReadings` at line 29.
Import `eventLog` from `~/server/db/schema` alongside `deviceTemperatureReadings`.
Three `it()` blocks:
1. `"deletes with a strict less-than cutoff exactly 30 days before now"` —
   asserts `mockWhere` called with `lt(eventLog.createdAt, cutoff)`.
2. `"logs the purge outcome with the deleted row count on success"` —
   asserts `mockLogger.info` with `"tuya-poller.event-purge-complete"`.
3. `"catches a thrown error from db.delete and does not propagate"` —
   asserts `resolves.toBeUndefined()` and `mockLogger.error` called once.

The `stubDelete` helper and fake-timer setup are shared with
`purgeOldReadings` tests — place the new describe block immediately after.

### Success Criteria

#### Automated Verification

- `npm run test -- --reporter=verbose tuya-poller` — all tests pass including
  the new `describe("purgeOldEvents")` block
- `npm run typecheck` — no type errors
- `npx biome check src/server/workers/tuya-poller.ts src/server/workers/tuya-poller.test.ts`
  — no lint errors

#### Manual Verification

- Confirm `purgeOldEvents` is exported and importable (TypeScript LSP, no
  red underlines in the test file import)
- Read `tuya-poller.ts` lines around the gate block and confirm both calls
  are sequential and unconditional within the gate

---

## Testing Strategy

### Unit Tests

Covered in Phase 1 change #3. Three tests in `describe("purgeOldEvents")`:

- Cutoff semantics — strict `lt` (not `lte`), exactly 30 days
- Row-count logging on success
- DB error swallowed, never propagated

### Manual Testing Steps

1. Run `npm run test -- --reporter=verbose tuya-poller` and confirm the new
   describe block shows 3 green tests
2. Scan `tuya-poller.ts` around the gate block: confirm `purgeOldReadings()`
   and `purgeOldEvents()` appear in sequence

## References

- Frame brief: `context/changes/event-log-retention/frame.md`
- Existing purge pattern: `src/server/workers/tuya-poller.ts:21–34`
- Poll-counter gate: `src/server/workers/tuya-poller.ts:134–136`
- Existing purge tests: `src/server/workers/tuya-poller.test.ts:244–317`
- event_log schema + index: `src/server/db/schema.ts:430–437`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Add purgeOldEvents() and tests

#### Automated

- [x] 1.1 npm run test -- --reporter=verbose tuya-poller (all tests pass incl. new describe block) — 4e9e4c9
- [x] 1.2 npm run typecheck (no type errors) — 4e9e4c9
- [x] 1.3 npx biome check tuya-poller.ts and tuya-poller.test.ts (no lint errors) — 4e9e4c9

#### Manual

- [x] 1.4 purgeOldEvents exported and importable (no red underlines in test import) — 4e9e4c9
- [x] 1.5 gate block contains sequential calls to purgeOldReadings() and purgeOldEvents() — 4e9e4c9
