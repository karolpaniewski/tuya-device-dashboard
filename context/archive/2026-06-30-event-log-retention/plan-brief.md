# Event Log Retention — Plan Brief

> Full plan: `context/changes/event-log-retention/plan.md`
> Frame brief: `context/changes/event-log-retention/frame.md`

## What & Why

`event_log` table grows indefinitely — no purge job exists. The fix adds
`purgeOldEvents()` in `tuya-poller.ts`, wired into the same poll-counter
gate as the existing `purgeOldReadings()`. Explicit non-goal of the
event-log change, now being addressed.

## Starting Point

`purgeOldReadings()` at `tuya-poller.ts:21–34` already deletes
`device_temperature_readings` rows older than 30 days every ~30 min.
`RETENTION_MS`, `lt`, `db`, `eventLog`, and `getLogger` are all already
imported in the file — zero new infrastructure needed.

## Desired End State

`purgeOldEvents()` runs alongside `purgeOldReadings()` every ~30 min,
deleting `event_log` rows where `createdAt < (now − 30 days)`. Three unit
tests mirror the existing purge test suite. `npm run test` stays green.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Retention window | 30 days | Matches temperature-history convention | Frame |
| Purge location | tuya-poller.ts, same gate | Zero new infrastructure, single cadence | Frame |
| RETENTION_MS constant | Shared | Both windows are 30 days; splitting adds complexity with no benefit | Plan |
| Function naming | `purgeOldEvents()` | Parallel to `purgeOldReadings()`, clear intent | Plan |
| Log tag | `"tuya-poller.event-purge-complete"` | Distinguishable from readings purge in log queries | Plan |

## Scope

**In scope:** `purgeOldEvents()` function, gate wiring, 3 unit tests

**Out of scope:** configurable retention window, UI settings, migration
(index already exists), change to purge frequency

## Architecture / Approach

Structural copy of `purgeOldReadings()` with `eventLog.createdAt` substituted
for `deviceTemperatureReadings.recordedAt`. The gate block at line 134 calls
both purges in sequence. Test suite in `tuya-poller.test.ts` gains one new
`describe` block with 3 tests mirroring the existing `purgeOldReadings`
tests one-for-one.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Add purgeOldEvents() and tests | Working purge + 3 green tests | None — direct copy of proven pattern |

**Prerequisites:** None — all imports already present, index already exists
**Estimated effort:** ~1 session, single phase

## Open Risks & Assumptions

- `RETENTION_MS` shared between both purges — if windows diverge in future,
  needs splitting; low probability given domain

## Success Criteria (Summary)

- `npm run test -- tuya-poller` shows new `describe("purgeOldEvents")` block
  with 3 green tests
- Gate block in `tuya-poller.ts` calls both `purgeOldReadings()` and
  `purgeOldEvents()` sequentially
