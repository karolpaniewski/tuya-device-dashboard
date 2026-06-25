# Retention Purge Job — Plan Brief

> Full plan: `context/changes/retention-purge-job/plan.md`

## What & Why

A retention purge for temperature-history readings already exists and already works (30-day window, shipped 2026-06-11). What's missing is observability and test coverage: no log line reports a purge run's outcome, and nothing tests its boundary behavior. This plan closes that gap — no behavior change to the purge itself.

## Starting Point

`tuya-poller.ts`'s `pollOnce()` deletes `deviceTemperatureReadings` rows older than 30 days every ~60 poll cycles (~30 min), inline, with no dedicated success log and no unit tests. A prior pass at this change (shaping + PRD) assumed no purge existed at all — that was wrong, found via a case-sensitive grep that missed `PURGE_EVERY_N_POLLS`/"purging". The roadmap and PRD have been corrected; this plan reflects the real, much smaller gap.

## Desired End State

The purge logic lives in its own exported, directly-testable function (`purgeOldReadings()`). Every purge run logs its outcome (rows deleted, or zero) via the project's existing structured-logging convention. Unit tests prove a reading older than 30 days is deleted, one within the window survives, and one exactly at the boundary survives (matching the existing strict `lt()` comparison). Retention stays at 30 days; nothing about the delete logic, gating cadence, or read path changes.

## Key Decisions Made

| Decision                          | Choice                                  | Why (1 sentence)                                                                 | Source |
| ---------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| Retention window                   | Keep 30 days                            | Already shipped/stable for 2 weeks; shrinking to 7 would only delete currently-harmless data for marginal storage savings | Plan |
| Test approach                      | Extract `purgeOldReadings()`            | Direct unit testing without invoking `pollOnce()` 60× to trigger the existing gate | Plan |
| Trigger mechanism                  | Unchanged (existing poll-cycle gate)    | Already works; moving it is unrelated risk this change doesn't need              | Plan |
| Log line shape                     | `{ rowsDeleted }`, info level, every run | Matches `automation-scheduler.mode-tick-complete`'s existing convention exactly  | Plan |

## Scope

**In scope:**
- Extracting the existing purge block into its own function
- Adding a dedicated outcome log line
- Unit tests for the boundary behavior (older/within/exactly-at-cutoff) and the new logging

**Out of scope:**
- Changing the retention window, trigger mechanism, or delete query's behavior
- Archiving/exporting purged rows
- Configurable retention (env var or Settings UI)
- Any schema/migration change (indexes already exist)

## Architecture / Approach

Pull lines 103-112 of `tuya-poller.ts` verbatim into `purgeOldReadings()`, called from the same gated branch in `pollOnce()`. Add the outcome log at the call site using the libsql `ResultSet.rowsAffected` field from the delete's resolved value. Add a `describe("purgeOldReadings", ...)` block to the existing test file, following its established per-test `db` mocking style.

## Phases at a Glance

| Phase                              | What it delivers                                          | Key risk                                                  |
| ----------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Extract, log, and test the purge | Testable purge function, outcome log line, boundary tests | Low — moving existing, correct logic; behavior unchanged   |

**Prerequisites:** none — single phase, no dependencies on other in-flight changes.
**Estimated effort:** a day or two of after-hours work at most.

## Open Risks & Assumptions

- Assumes `db.delete(...).where(...)`'s resolved value exposes `.rowsAffected` exactly as documented in `@libsql/core`'s type definitions (verified during planning, not yet exercised against a live delete in this codebase).
- None of this changes existing behavior, so regression risk is limited to the extraction itself introducing a typo/logic slip — covered by the new tests plus the existing `npm run check`/`typecheck`/`build` gate.

## Success Criteria (Summary)

- Every purge run produces a `tuya-poller.purge-complete` log line with an accurate row count, including no-op runs
- Unit tests prove the 30-day boundary is handled correctly (older deleted, within kept, exactly-at-boundary kept)
- Zero change to the History tab, the temperature-history query, or the purge's existing schedule/window
