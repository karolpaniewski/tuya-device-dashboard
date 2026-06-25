# Retention Purge Job — Observability + Tests Implementation Plan

## Overview

The temperature-history table already has a working 30-day retention purge
(`src/server/workers/tuya-poller.ts`), shipped in the same commit as the
temperature-history feature itself. It has two real gaps: no dedicated log
line reporting a purge run's outcome, and no test coverage proving its
boundary behavior. This plan closes both, with zero change to the purge's
actual delete logic or retention window.

## Current State Analysis

`pollOnce()` (`src/server/workers/tuya-poller.ts:20-118`) runs every ~30s.
A module-level `pollCounter` increments each call; when it's a multiple of
`PURGE_EVERY_N_POLLS` (60, ≈30 min), the function deletes
`deviceTemperatureReadings` rows where `recordedAt` is strictly less than
`now - RETENTION_MS` (30 days), via `lt(deviceTemperatureReadings.recordedAt, cutoff)`
(lines 103-112). Errors are caught and logged; nothing else in the tick is
affected either way. The generic `getLogger().info({ gatewayCount }, "tuya-poller.poll-complete")`
line (lines 114-117) fires every tick regardless of whether a purge ran —
there is no way to tell from logs whether a given tick's purge cleared 0
rows, 50,000 rows, or didn't run at all.

`tuya-poller.test.ts` has zero tests touching `pollCounter`, the purge
branch, or `db.delete`. The purge logic is currently inline inside
`pollOnce()`, gated by module-level mutable state (`pollCounter`) — testing
it today would require calling `pollOnce()` 60 times per test to trigger the
gate, which is slow and couples every test to the exact value of
`PURGE_EVERY_N_POLLS`.

### Key Discoveries:

- `lt()` is a strict less-than comparison (`drizzle-orm`'s `lt`) — a reading
  recorded exactly at the cutoff timestamp is **kept**, not deleted. This is
  existing, correct, unchanged behavior; this plan's tests assert it
  explicitly rather than leaving it implicit.
- The relevant indexes already exist: `reading_time_idx` (on `recordedAt`
  alone) and a composite `tuyaDeviceId`+`recordedAt` index
  (`src/server/db/schema.ts:204-205`) — no schema/migration work needed.
- The project's established structured-logging convention for periodic
  worker ticks is `getLogger().info({ <fields> }, "<worker>.<event>")`,
  e.g. `automation-scheduler.ts:55-58`'s
  `getLogger().info({ modesEvaluated, firedCount }, "automation-scheduler.mode-tick-complete")`.
  The new purge log line follows this exact shape.
- `tuya-poller.test.ts` mocks `db` at the module level (`vi.mock("~/server/db", ...)`)
  and stubs `db.select`/`db.insert` per-test via `vi.mocked(db).insert = ...`-style
  reassignment (lines 4, 52-55). The new tests for the extracted purge
  function follow the same per-test mocking style for `db.delete`.

## Desired End State

The purge logic lives in its own exported, directly-testable function.
Every purge run — whether it deletes rows or not — produces a log line
naming the outcome. Unit tests prove: a reading older than the retention
window is deleted, a reading within the window survives, and a reading
exactly at the boundary survives (matching `lt()`'s existing strict
semantics). `pollOnce()`'s external behavior, the retention window (30
days), the gating cadence (`PURGE_EVERY_N_POLLS`), and the
temperature-history read path are all unchanged.

**Verification:** run the new unit tests; confirm `npm run test`,
`npm run typecheck`, `npm run check`, and `npm run build` all pass; manually
trigger a purge against the dev DB and confirm the new log line appears with
a correct row count.

## What We're NOT Doing

- No change to the retention window (stays 30 days) — decided during
  planning; shrinking it now would delete currently-harmless accumulated
  data for marginal storage savings, and the History tab's UI never shows
  past 7 days regardless of how much is retained underneath.
- No change to the purge's trigger mechanism — it stays gated on the
  existing poll cycle (`PURGE_EVERY_N_POLLS`), not moved to a dedicated
  scheduler or cron-style trigger.
- No configurable retention window (env var or Settings UI) — 30 days
  remains a fixed constant.
- No archiving/export of purged rows before deletion — the existing hard
  delete behavior is unchanged.
- No batching/throttling of the delete query — the existing single-statement
  `db.delete(...).where(lt(...))` is unchanged.
- No new schema, migration, or index — the relevant indexes already exist.

## Implementation Approach

Extract the purge block from `pollOnce()` into a small exported function,
`purgeOldReadings()`, called from the same gated branch with no change to
when or how it fires. The extraction's only purpose is testability: a
directly-callable function can be unit-tested with a controlled cutoff and
mocked `db.delete`, instead of requiring 60 calls to `pollOnce()` to trigger
the existing gate. The new log line lives at `purgeOldReadings()`'s call
site (or inside it), reporting the delete result.

## Phase 1: Extract, log, and test the retention purge

### Overview

Pull the existing purge block into its own function, add a dedicated
outcome log line, and add unit tests proving the boundary behavior — no
behavior change to the purge itself.

### Changes Required:

#### 1. Extract `purgeOldReadings()`

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: Make the purge directly unit-testable without requiring 60
calls to `pollOnce()`, and give the new log line a clean call site.

**Contract**: Add an exported `async function purgeOldReadings(): Promise<void>`
containing exactly the existing logic from lines 104-111 (compute `cutoff`
from `RETENTION_MS`, `db.delete(deviceTemperatureReadings).where(lt(...))`,
catch-and-log on error) — moved verbatim, not rewritten. `pollOnce()`'s
gated branch (`if (pollCounter % PURGE_EVERY_N_POLLS === 0)`) calls
`await purgeOldReadings()` instead of inlining the logic. `RETENTION_MS`
and `PURGE_EVERY_N_POLLS` stay as module-level constants, unchanged.

#### 2. Add the purge outcome log line

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: Make a purge run's outcome (rows deleted, or zero) visible in
logs without inspecting the database, on every run — including no-op runs
— matching this project's existing periodic-job logging convention.

**Contract**: this project's Drizzle client is `drizzle-orm/libsql`
(`src/server/db/index.ts`); awaiting `db.delete(...).where(...)` resolves to
a libsql `ResultSet` whose `.rowsAffected: number` field is the deleted-row
count (verified in `@libsql/core`'s type definitions — no existing call
site in this codebase reads it today, so there's no established pattern to
diverge from). After the delete succeeds, call
`getLogger().info({ rowsDeleted: result.rowsAffected }, "tuya-poller.purge-complete")`,
matching `automation-scheduler.mode-tick-complete`'s
`getLogger().info({ <fields> }, "<event>")` shape. On the existing
catch-and-log error path, no success line fires (matching the existing
poll-complete pattern, where an error path also skips the corresponding
success log).

#### 3. Unit tests for the purge boundary behavior

**File**: `src/server/workers/tuya-poller.test.ts`

**Intent**: Prove the purge deletes what it should and nothing else, and
that its outcome is logged — closing the actual gap this change exists
for.

**Contract**: New `describe("purgeOldReadings", ...)` block, following this
file's existing per-test `db` mocking style (e.g. reassigning
`vi.mocked(db).delete`). Cover: (a) a reading older than 30 days is
included in the delete's `where` condition / is deleted; (b) a reading
within 30 days is not; (c) a reading at exactly the 30-day boundary timestamp
is kept, not deleted (asserting the existing strict `lt()` semantics
explicitly); (d) `getLogger().info` is called with the purge-complete event
and a row count on success; (e) a thrown error from `db.delete` is caught
and does not propagate (matching this file's existing DB-error test style,
e.g. `pollOnce › DB error`).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run check` (Biome) passes
- `npm run test` passes, including the new `purgeOldReadings` tests
- `npm run build` succeeds

#### Manual Verification:

- Running the dev server against the stub/dev DB and waiting for (or
  forcing) a purge cycle produces a `tuya-poller.purge-complete` log line
  with a correct row count
- The History tab's existing 1h/24h/7d ranges are unaffected — spot-check
  a device's chart before and after a manual purge trigger

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before considering the change done — there
is only one phase.

## Testing Strategy

### Unit Tests:

- `purgeOldReadings` — boundary cases (older-than-window deleted, within-
  window kept, exactly-at-boundary kept), success logging, error handling.

### Integration Tests:

- None planned — this is a backend-only logging/test addition with no new
  API surface; the existing `device.temperatureHistory` query and its tests
  are unaffected.

### Manual Testing Steps:

1. Run the dev server (`TUYA_STUB=true` or against real hardware) and let
   the poller run for ~30 minutes, or manually invoke `purgeOldReadings()`
   via a script/console for a faster check.
2. Confirm a `tuya-poller.purge-complete` log line appears with a
   `rowsDeleted` field.
3. Open a device's History tab; confirm the 1h/24h/7d ranges show the same
   data as before the purge ran (assuming no readings were actually old
   enough to be purged in a fresh dev DB, this should show no change at
   all — the check is that nothing breaks, not that data visibly changes).

## Performance Considerations

None beyond what already exists — the delete query, its indexes, and the
gating cadence are all unchanged. The new log line is a single structured
log call per purge cycle (≈ every 30 minutes), negligible overhead.

## Migration Notes

Not applicable — no schema or data changes.

## References

- PRD: `context/foundation/prd-v8.md` (v8) — retention-purge-job change
  (corrected mid-planning; see its Problem Statement & Motivation for the
  false-premise correction)
- Roadmap: `context/foundation/roadmap.md` S-09 risk note (corrected
  2026-06-25)
- Existing purge logic being extracted: `src/server/workers/tuya-poller.ts:103-112`
- Existing periodic-job logging convention to match:
  `src/server/workers/automation-scheduler.ts:55-58`
- Existing test mocking conventions to follow: `src/server/workers/tuya-poller.test.ts`
- Existing indexes (no migration needed): `src/server/db/schema.ts:204-205`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract, log, and test the retention purge

#### Automated

- [x] 1.1 `npm run typecheck` passes — 0301ad5
- [x] 1.2 `npm run check` (Biome) passes — 0301ad5
- [x] 1.3 `npm run test` passes, including the new `purgeOldReadings` tests — 0301ad5
- [x] 1.4 `npm run build` succeeds — 0301ad5

#### Manual

- [x] 1.5 Dev server purge cycle produces a `tuya-poller.purge-complete` log line with a correct row count — 0301ad5
- [x] 1.6 History tab's 1h/24h/7d ranges unaffected before/after a manual purge trigger — 0301ad5
