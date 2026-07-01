# Frame Brief: Event log retention purge

> Framing step before /10x-plan. Captures what is actually at issue,
> separated from what was initially assumed.

## Reported Observation

`event_log` table grows indefinitely — no purge job exists. Explicitly
deferred as non-goal in event-log v1. `device_temperature_readings` has
an analogous purge (`purgeOldReadings` in `tuya-poller.ts`) that ships
with the project.

## Initial Framing (preserved)

- **User's stated cause**: missing retention mechanism at DB layer
- **User's proposed direction**: add purge job analogous to
  `PURGE_EVERY_N_POLLS` / `purgeOldReadings()` in `tuya-poller.ts`
- **Pre-dispatch narrowing**: 30-day retention window, purge lives in
  `tuya-poller.ts` alongside existing purge (same poll-counter gate)

## Dimension Map

1. **Purge location** — where does cleanup run and what triggers it?
2. **Retention window** — what's the right horizon for events vs readings?
3. **Schema efficiency** — is there an index to make range-deletes cheap?
4. **Error handling** — must purge failure never block poll or event writes
5. **Logging** — structured logger line on completion

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Piggyback on existing poll-counter gate in `tuya-poller.ts` | `PURGE_EVERY_N_POLLS = 60`, `pollCounter % PURGE_EVERY_N_POLLS === 0` at `tuya-poller.ts:134` — exact hook point available | STRONG |
| event_log.createdAt has an index for efficient range-delete | `event_log_created_at_idx` on `t.createdAt` — `schema.ts:437` | STRONG |
| All needed imports already present | `lt`, `db`, `eventLog`, `getLogger` — all imported at `tuya-poller.ts:1–13` | STRONG |
| Separate worker / cron trigger needed | No — existing gate fires every ~30 min, adequate frequency for 30-day retention | NONE |

## Narrowing Signals

- 30-day retention window (matches temperature-history convention)
- Purge in `tuya-poller.ts` alongside `purgeOldReadings()` — same gate,
  separate function `purgeOldEvents()` for single-responsibility clarity
- Error handling: try/catch, log error, never throw (same as existing purge)

## Cross-System Convention

`purgeOldReadings()` at `tuya-poller.ts:21–34` is the established pattern:
compute cutoff as `new Date(Date.now() - RETENTION_MS)`, delete with
`lt(column, cutoff)`, log `rowsAffected`, swallow errors. This is exactly
the pattern to replicate for event_log.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: add `purgeOldEvents()` in
> `tuya-poller.ts` using the same 30-day retention window and poll-counter
> gate as `purgeOldReadings()`, deleting `eventLog` rows where `createdAt <
> cutoff`.

The initial framing was correct. No reframe needed — the proposed approach
maps exactly onto the existing pattern. Zero new infrastructure required;
all imports are already present.

## Confidence

**HIGH** — strong evidence on all dimensions, exact analogous implementation
exists and is proven in production, index confirmed.

## What Changes for /10x-plan

One function added to `tuya-poller.ts`, called from the existing
poll-counter gate block. The plan is a single-phase change: write the
function, call it, verify with a unit test (analogous to existing purge
tests if any exist).

## References

- Existing purge: `src/server/workers/tuya-poller.ts:21–34`
- Poll-counter gate: `src/server/workers/tuya-poller.ts:134–135`
- event_log schema + index: `src/server/db/schema.ts:430–437`
- Non-goal origin: `context/archive/2026-06-30-event-log/plan.md` §Non-Goals
