# Temperature History (S-09) — Plan Brief

> Full plan: `context/changes/temperature-history/plan.md`

## What & Why

Users can currently see only the live temperature for each device — there is no
way to know if a room has been cold all morning or if a valve just dropped to the
floor. S-09 adds a persistent time-series of temperature + setpoint readings and
surfaces them as a per-device line chart accessible from the dashboard.

## Starting Point

The polling worker writes every reading to an in-memory Map (`deviceStateStore`)
that is lost on restart. The SQLite database has no history table. No charting
library is installed.

## Desired End State

Every device poll result is appended to a `deviceTemperatureReadings` SQLite
table (retained for 30 days). A tRPC endpoint serves time-bucketed data for a
chosen range (1 h / 24 h / 7 d). Clicking a history icon on any valve or sensor
card opens a modal with a Recharts line chart showing both temperature and
setpoint over the selected range.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Storage | SQLite (same DB) | Already in use; 50 devices is well within SQLite comfort zone | Plan |
| Granularity | Every poll with non-null value | Simple write path; clear offline gaps visible on chart | Plan |
| Retention | 30 days | Month-long trend visible; ~4 M rows max (~200 MB) | Planning session |
| Purge trigger | Every 60 polls (~30 min), in-process | No extra infra; acceptable latency on bounding DB size | Planning session |
| Chart placement | Modal from device card | Keeps dashboard layout unchanged; chart in device context | Planning session |
| Time ranges | 1 h / 24 h / 7 d | Covers operational needs without 30-day query cost | Planning session |
| Chart data | temperatureC + setpointC | Both lines needed to diagnose heating behaviour | Planning session |
| Chart library | Recharts | React-native, TypeScript, React 19 compatible; ~100 KB gzip | Planning session |
| Downsampling | Server-side integer-division bucketing in SQL | Caps response at ≤ 300 pts; no client-side complexity | Plan |
| Dev data | Wait for real data | No seed script overhead; real device data available | Planning session |

## Scope

**In scope:**
- `deviceTemperatureReadings` table + Drizzle migration
- Poller writes + 30-day purge
- `device.temperatureHistory` tRPC procedure (bucketed)
- `TemperatureHistoryModal` component with Recharts
- History icon trigger on valve + sensor device cards
- Unit tests for poller write and tRPC endpoint

**Out of scope:**
- Room-level aggregated history
- CSV/JSON export
- Real-time chart updates (WebSocket)
- 30-day UI range (retention limit, not exposed in UI)
- Seed script for dev data

## Architecture / Approach

```
pollOnce()
  ├── update deviceStateStore (unchanged)
  ├── batch INSERT into deviceTemperatureReadings
  └── every 60 polls: DELETE records older than 30 days

device.temperatureHistory(tuyaDeviceId, range)
  └── SQL: WHERE tuyaDeviceId=? AND recordedAt >= fromTs
        GROUP BY (recordedAt / bucketSize) * bucketSize [for 24h, 7d]
        ORDER BY bucket ASC

DeviceCard
  └── <History icon> → historyOpen state
        └── <TemperatureHistoryModal>
              └── api.device.temperatureHistory.useQuery(...)
                    └── <Recharts LineChart> (2 lines: temp + setpoint)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Schema + Write Path | DB table, migration, poller writes, purge | Biome meta formatting step easy to forget |
| 2. tRPC Endpoint | Bucketed history query + unit tests | SQL bucketing expression in Drizzle needs care |
| 3. Frontend Modal + Chart | Recharts modal, history icon on cards | Recharts + React 19 compatibility (check peer deps) |

**Prerequisites:** Phase 1 data must exist in DB before Phase 3 can be manually verified.
**Estimated effort:** ~2–3 coding sessions across 3 phases.

## Open Risks & Assumptions

- Recharts peer dependency supports React 19 — verify on `npm install`.
- `date-fns` is assumed to be a transitive dependency via `next-auth`; if not,
  add it explicitly for X-axis tick formatting.
- `@base-ui/react` Dialog API must be checked against its ^1.5.0 docs — the
  `open`/`onOpenChange` pattern should be standard.

## Success Criteria (Summary)

- Rows accumulate in `deviceTemperatureReadings` within 60 s of server start.
- History modal opens from a valve card and renders two labelled lines over the
  selected time range with correct timestamps.
- Switching range tabs re-fetches and re-renders without errors or layout
  regressions.
