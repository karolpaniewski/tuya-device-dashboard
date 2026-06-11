# Temperature History (S-09) Implementation Plan

## Overview

Persist every Tuya poll result (temperatureC + setpointC) to SQLite, serve it
via a tRPC query with server-side time-bucketing, and display it as a Recharts
line chart inside a modal triggered from each device card. Retention: 30 days,
purged automatically every 30 minutes by the polling worker.

## Current State Analysis

- `src/server/workers/tuya-poller.ts` updates an in-memory `deviceStateStore`
  Map every 30 s — nothing is written to the DB.
- `src/server/db/schema.ts` has no history table; only reference/config tables exist.
- `src/server/lib/device-state-store.ts` stores the latest reading per
  `tuyaDeviceId`; all data is lost on server restart.
- No charting library is installed; `@base-ui/react` (Dialog), `lucide-react`
  (icons), and `sonner` (toasts) are already present.
- 21 real devices today, max ~50 per PRD → up to ~86k rows/day at 30 s cadence.

## Desired End State

- Every poll that returns a non-null temperature or setpoint for a device is
  appended to `deviceTemperatureReadings` in SQLite.
- A tRPC procedure `device.temperatureHistory` returns time-bucketed readings
  for a device over 1 h, 24 h, or 7 d (max ~300 points per request).
- Clicking a "history" icon button on a device card opens a modal with a
  Recharts line chart showing both temperature and setpoint over the selected
  range.
- A purge job deletes records older than 30 days, running co-located with the
  poller every 60 poll cycles (~30 min).

### Key Discoveries

- `tuyaDeviceId` (not `devices.id`) is the natural key available in the poller
  at write time — denormalize it into the readings table to avoid a lookup on
  every poll cycle (`src/server/workers/tuya-poller.ts:35`).
- Drizzle's migration toolchain: `npm run db:generate` → SQL file, then
  `npm run db:migrate` applies it; Biome must format the generated meta files
  after each generate (`drizzle/meta/`).
- `@base-ui/react` ^1.5.0 ships a Dialog primitive — use it for the modal to
  avoid adding another component library.
- For 7-day range at 30 s cadence, raw data would be ~20k points per device.
  SQLite integer division enables O(1) bucketing:
  `(recordedAt / bucketSize) * bucketSize` — group by this expression and take
  AVG to reduce to ≤ 168 points (hourly) or ≤ 288 points (5-min) per request.

## What We're NOT Doing

- No room-level aggregated history chart (single-device view only).
- No CSV/JSON export of historical data.
- No real-time streaming / WebSocket push of new readings to the chart.
- No 30-day range in the UI (retention is 30 d, but UI only exposes 1 h / 24 h / 7 d).
- No seed script for dev history — wait for real data to accumulate.
- No change to the existing `deviceStateStore` in-memory logic.

## Implementation Approach

Three sequential phases that can each be verified independently:

1. **Write path** — schema + migration + poller writes. Validates that data is
   appearing in the DB on every poll cycle.
2. **Read path** — tRPC endpoint with bucketing. Validates correct SQL via unit
   test + manual query.
3. **UI** — Recharts modal wired to the endpoint. Validates chart renders with
   real data from Phase 1.

## Critical Implementation Details

**Bucketing strategy** — The query aggregates by integer-division bucket to cap
response size. Bucket sizes by range: 1 h → raw (no grouping, ≤ 120 pts), 24 h
→ 300 s buckets (~288 pts), 7 d → 3600 s buckets (~168 pts). In Drizzle use
`sql\`(${table.recordedAt} / ${size}) * ${size}\`` as the GROUP BY expression
and `AVG()` for both columns. The 1 h case skips grouping entirely.

**Purge cadence** — The poller increments an in-module counter on each call to
`pollOnce`. When `counter % 60 === 0` (every ~30 min), it runs a single DELETE
for rows older than 30 days: `recordedAt < unixepoch() - 2592000`. This requires
no new infrastructure.

**Biome meta files** — After `npm run db:generate`, run
`npx biome format --write drizzle/meta/_journal.json drizzle/meta/<snapshot>.json`
before committing to keep CI green.

---

## Phase 1: Schema, Migration, and Write Path

### Overview

Add `deviceTemperatureReadings` table to the Drizzle schema, generate and apply
the migration, then extend `pollOnce` to write one row per device per poll (when
data is available) and purge stale rows every 30 minutes.

### Changes Required

#### 1. New DB table

**File**: `src/server/db/schema.ts`

**Intent**: Define a `deviceTemperatureReadings` table to persist each poll
result. Uses `tuyaDeviceId` (text, not FK) as the lookup key to avoid a join on
every write.

**Contract**: Table columns:
- `id` — UUID primary key (`$defaultFn(() => crypto.randomUUID())`)
- `tuyaDeviceId` — `text({ length: 255 }).notNull()`
- `temperatureC` — `real` (nullable)
- `setpointC` — `real` (nullable)
- `recordedAt` — `integer({ mode: "timestamp" }).notNull()` defaulting to
  `sql\`(unixepoch())\``

Two indexes: `(tuyaDeviceId, recordedAt)` for time-range queries, `(recordedAt)`
for the purge DELETE. Follow the existing `createTable` + index pattern from
`deviceRoomAssignments`.

#### 2. Migration

**Files**: `drizzle/` (auto-generated) + `drizzle/meta/` (Biome-format after generate)

**Intent**: Apply the new table to the SQLite database without touching existing
tables.

**Contract**: Run `npm run db:generate`, then
`npx biome format --write drizzle/meta/_journal.json drizzle/meta/<new-snapshot>.json`,
then `npm run db:migrate`.

#### 3. Write readings in the poller

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: After the `deviceStateStore` update loop, batch-insert one row per
reading that has a non-null `temperatureC` or `setpointC`. Add a module-level
counter and run the purge DELETE every 60 polls.

**Contract**:
- Import `deviceTemperatureReadings` from `~/server/db/schema`.
- Build an array of insert values from `readings` (only entries where
  `r.temperatureC !== null || r.setpointC !== null`).
- Call `db.insert(deviceTemperatureReadings).values(batch)` — single
  batched insert per gateway, not one query per reading.
- Purge: `db.delete(deviceTemperatureReadings).where(lt(deviceTemperatureReadings.recordedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))` — only when `pollCounter % 60 === 0`.

### Success Criteria

#### Automated Verification

- Typecheck passes: `npm run typecheck`
- Migration applies cleanly: `npm run db:generate && npm run db:migrate`
- Biome clean: `npm run check`
- Tests pass (poller tests must still pass): `npm test`

#### Manual Verification

- After running `npm run dev` for 60+ seconds, open Drizzle Studio
  (`npm run db:studio`) and confirm rows appear in `.bootstrap-scaffold_device_temperature_reading`.
- Row count grows ~21 rows every 30 s while devices are reporting.
- After 30 min or simulated purge call, rows older than 30 days are gone.

**Pause here** and confirm manual verification before proceeding to Phase 2.

---

## Phase 2: tRPC Read Endpoint

### Overview

Add `device.temperatureHistory` to the device router. Returns time-bucketed
readings for a single device over 1 h, 24 h, or 7 d.

### Changes Required

#### 1. New tRPC procedure

**File**: `src/server/api/routers/device.ts`

**Intent**: Expose a `protectedProcedure` that accepts a `tuyaDeviceId` and a
`range` enum, computes the start timestamp, runs the appropriate SQL query
(raw for 1 h, bucketed for 24 h and 7 d), and returns an array of
`{ recordedAt: Date, temperatureC: number | null, setpointC: number | null }`.

**Contract**: Input schema `z.object({ tuyaDeviceId: z.string(), range: z.enum(["1h", "24h", "7d"]) })`.

Bucket sizes: `"1h"` → no grouping (raw), `"24h"` → 300 s, `"7d"` → 3600 s.

For bucketed ranges use Drizzle `sql` template:
```ts
const bucket = sql<number>`(${deviceTemperatureReadings.recordedAt} / ${bucketSize}) * ${bucketSize}`;
```
Group by `bucket`, select `AVG(temperatureC)` and `AVG(setpointC)`, order by
`bucket ASC`. Map results to `{ recordedAt: new Date(row.bucket * 1000), ... }`.

For `"1h"`: plain select with `WHERE recordedAt >= fromTs ORDER BY recordedAt ASC` — no grouping.

#### 2. Unit test

**File**: `src/server/api/routers/device.test.ts` (extend existing file)

**Intent**: Verify the bucketing logic and empty-result handling without a real
DB. Mock `db` with the same `vi.mock("~/server/db")` pattern used by the
existing device tests.

**Contract**: Two test cases — `returns bucketed data for "7d" range` and
`returns empty array when no readings exist`.

### Success Criteria

#### Automated Verification

- Typecheck passes: `npm run typecheck`
- All tests pass including new endpoint tests: `npm test`
- Biome clean: `npm run check`

#### Manual Verification

- With Phase 1 data accumulating, call the endpoint from Drizzle Studio SQL or
  via a browser `fetch` to `trpc/device.temperatureHistory` and confirm the
  returned array is non-empty and timestamps are within the expected range.

**Pause here** and confirm manual verification before proceeding to Phase 3.

---

## Phase 3: Frontend — Modal and Chart

### Overview

Install Recharts, build a `TemperatureHistoryModal` component backed by the
Phase 2 endpoint, and add a trigger button to `DeviceCard`.

### Changes Required

#### 1. Install Recharts

**File**: `package.json` (via npm install)

**Intent**: Add `recharts` as a production dependency.

**Contract**: `npm install recharts`. Verify bundle impact is acceptable (~100 KB
gzip). Recharts is React 19 compatible via its peerDependencies.

#### 2. TemperatureHistoryModal component

**File**: `src/app/_components/temperature-history-modal.tsx` (new file)

**Intent**: A `"use client"` modal that wraps a Recharts `LineChart` showing
`temperatureC` (blue) and `setpointC` (orange) over the selected range. Provides
1 h / 24 h / 7 d range tabs. Shows a loading skeleton while fetching and an
empty-state message when no readings exist.

**Contract**:
- Props: `{ tuyaDeviceId: string; deviceName: string; open: boolean; onClose: () => void }`
- Uses `@base-ui/react` Dialog for the overlay.
- Calls `api.device.temperatureHistory.useQuery({ tuyaDeviceId, range })` —
  re-fetches when `range` changes. `enabled: open` so the query only fires when
  the modal is visible.
- Recharts: `<ResponsiveContainer width="100%" height={300}>` containing a
  `<LineChart>` with `<XAxis dataKey="recordedAt" tickFormatter={...}>`,
  `<YAxis unit="°C">`, `<Tooltip>`, `<Legend>`, and two `<Line>` elements.
- X-axis tick formatter: for 1 h use `HH:mm`, for 24 h use `HH:mm`, for 7 d
  use `dd MMM` — use `date-fns/format` (already a transitive dependency via
  `next-auth`).
- Loading state: a `<div className="h-[300px] animate-pulse bg-muted rounded"/>` skeleton.
- Empty state: centered text "Brak danych historycznych dla tego zakresu."

#### 3. History trigger on DeviceCard

**File**: `src/app/_components/device-card.tsx`

**Intent**: Add a small "history" icon button that sets local `open` state and
renders `<TemperatureHistoryModal>`. Show only for devices where the device type
is `"valve"` or `"sensor"`.

**Contract**:
- Import `History` from `lucide-react` and `TemperatureHistoryModal`.
- Add `const [historyOpen, setHistoryOpen] = useState(false)` inside the card
  component.
- Render `<button onClick={() => setHistoryOpen(true)} aria-label="Historia temperatury">
  <History className="h-4 w-4"/>
  </button>` in the card header area, next to existing controls.
- Conditionally render `<TemperatureHistoryModal ... open={historyOpen} onClose={() => setHistoryOpen(false)} />`
  below the card JSX (outside the card box, so it can portal to body).
- Gate on `device.deviceType !== "plug"`.

### Success Criteria

#### Automated Verification

- Typecheck passes: `npm run typecheck`
- All tests pass: `npm test`
- Biome clean: `npm run check`
- Build succeeds: `npm run build`

#### Manual Verification

- Open dashboard; device cards with `valve` or `sensor` type show a history icon.
- Click the icon — modal opens, shows loading skeleton briefly, then chart.
- Chart displays two lines (temperature blue, setpoint orange) with correct
  timestamps on X-axis.
- Switching range tabs (1 h / 24 h / 7 d) re-fetches and re-renders chart.
- If no data yet, empty-state message appears instead of chart.
- Closing the modal (Escape or × button) works cleanly.
- No layout regressions on existing device cards.

---

## Testing Strategy

### Unit Tests

- `tuya-poller.test.ts`: extend happy-path test to verify that after a successful
  poll, `db.insert` is called with the expected readings batch. Mock `db.insert`
  via the existing `vi.mock("~/server/db")`.
- `device.test.ts`: two new cases for `temperatureHistory` — bucketed data
  returned correctly, empty array when mock returns no rows.

### Manual Testing Steps

1. Start dev server with real gateway (`TUYA_STUB=false`).
2. Wait 2+ minutes; open Drizzle Studio — confirm rows in
   `.bootstrap-scaffold_device_temperature_reading`.
3. Open a valve card → click history icon → modal opens with chart.
4. Switch between 1 h / 24 h / 7 d — chart updates.
5. Confirm no console errors, no TypeScript errors in browser.

## Performance Considerations

- 30 s × 21 devices = ~60k writes/day → well within SQLite's comfort zone.
- Index `(tuyaDeviceId, recordedAt)` ensures time-range queries on a single device
  are index-seeks even after 30 days of data (~1.8M rows for 21 devices).
- Response payload per request: ≤ 300 data points × 3 fields ≈ < 10 KB JSON.
- Recharts renders up to 300 SVG points per line without perceptible lag.

## Migration Notes

No existing data migration needed — table is new, starts empty, and fills
naturally from the first poll after the migration is applied.

## References

- Roadmap entry: `context/foundation/roadmap.md` (S-09)
- Polling worker: `src/server/workers/tuya-poller.ts`
- Device state store: `src/server/lib/device-state-store.ts`
- DB schema pattern: `src/server/db/schema.ts`
- Existing device router: `src/server/api/routers/device.ts`
- Existing device card: `src/app/_components/device-card.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Schema, Migration, and Write Path

#### Automated

- [x] 1.1 Typecheck passes: `npm run typecheck` — e10ad72
- [x] 1.2 Migration applies cleanly: `npm run db:generate && npm run db:migrate` — e10ad72
- [x] 1.3 Biome clean: `npm run check` — e10ad72
- [x] 1.4 Poller tests pass: `npm test` — e10ad72

#### Manual

- [x] 1.5 Rows appear in `.bootstrap-scaffold_device_temperature_reading` after 60 s — e10ad72
- [x] 1.6 Row count grows ~21 rows every 30 s while devices report — e10ad72
- [x] 1.7 Purge deletes rows older than 30 days when triggered — e10ad72

### Phase 2: tRPC Read Endpoint

#### Automated

- [x] 2.1 Typecheck passes: `npm run typecheck`
- [x] 2.2 All tests pass including new endpoint tests: `npm test`
- [x] 2.3 Biome clean: `npm run check`

#### Manual

- [x] 2.4 `temperatureHistory` query returns non-empty array with correct timestamps
- [x] 2.5 Bucketing reduces 7 d range to ≤ 168 hourly points

### Phase 3: Frontend — Modal and Chart

#### Automated

- [ ] 3.1 Typecheck passes: `npm run typecheck`
- [ ] 3.2 All tests pass: `npm test`
- [ ] 3.3 Biome clean: `npm run check`
- [ ] 3.4 Build succeeds: `npm run build`

#### Manual

- [ ] 3.5 History icon visible on valve and sensor cards
- [ ] 3.6 Modal opens with loading skeleton then chart
- [ ] 3.7 Two lines render (temperature + setpoint) with correct axes
- [ ] 3.8 Range tabs 1 h / 24 h / 7 d re-fetch and re-render correctly
- [ ] 3.9 Empty-state message shown when no data
- [ ] 3.10 No layout regressions on existing device cards
