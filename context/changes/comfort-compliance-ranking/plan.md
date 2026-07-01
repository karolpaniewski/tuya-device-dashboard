# Comfort Compliance Ranking Implementation Plan

## Overview

Add a new read-only dashboard panel that ranks all rooms worst-to-best by
% of time spent outside their comfort threshold over a trailing 7-day
window, with an average-degrees-off-threshold severity stat and a
partial-data-coverage indicator. Builds entirely on existing data
(per-room thresholds from room-health-thresholds/S-05, temperature
readings from temperature-history/S-09) — no schema changes, no new
routes, no auth changes.

## Current State Analysis

- Room comfort status today is **instantaneous only**: `scoreRoom()`
  (`src/server/lib/scoring.ts:15-54`) compares a room's *current* combined
  sensor reading against its thresholds and returns a live `OK`/`Too
  Cold`/`Too Hot` badge. There is no historical rollup.
- Multi-sensor rooms use a **minimum-reading-wins** rule today
  (`src/server/api/routers/device.ts:481-487`, duplicated in
  `src/server/lib/alert-control.ts:30-35`) — the coldest sensor represents
  the room. The new ranking must apply the same rule historically for
  consistency with the live badge.
- Temperature history (`temperatureHistory` procedure,
  `src/server/api/routers/device.ts:299-355`) is **per-device only** and
  already has a proven 7-day bucketing pattern: SQLite integer-division
  bucketing (`(recordedAt / 3600) * 3600`) with `AVG()` per bucket,
  filtered by `gte(recordedAt, fromTs)` against the indexed
  `(tuyaDeviceId, recordedAt)` column pair. Room-level historical
  aggregation across multiple sensors does not exist yet — this is new
  query logic, not a copy-paste.
- The dashboard's drag/hide personalization system
  (`src/lib/dashboard-widgets.ts` + `widgetDefinitions` array in
  `src/app/_components/device-overview.tsx:554-772`) requires registering
  a widget id in **both** places to be actually draggable/hideable. A
  prior change left two ids (`kpi-by-room`, `room-temp-panel`) in
  `DEFAULT_WIDGET_ORDER` with no matching `widgetDefinitions` entry — this
  plan avoids repeating that gap by doing both steps together.
- "Clicking a ranked room to see its detail" is **not a route** — it's a
  `Sheet` slide-over (`RoomQuickOverviewPanel`) opened via the
  `setSelectedRoomId` state setter already declared in `DeviceOverview`
  (`device-overview.tsx:1160-1178`). The PRD's phrase "navigates to its
  existing detail/history view" maps to this existing mechanism, not a
  new page.

### Key Discoveries:

- `scoreRoom()` (`src/server/lib/scoring.ts:15-39`) is pure and reusable:
  `temp < minTempC → "Too Cold"`, `temp > maxTempC → "Too Hot"`, else
  `"OK"`; returns `badge: null` when temperature or thresholds are
  missing. The new aggregation reuses this exact badge classification
  per hourly bucket (ignoring the `anomaly`/`suggestion` fields, which are
  live-valve-specific and irrelevant here).
- `overview` procedure (`device.ts:357-361`) takes `{ siteId: z.string() }`
  (`"all"` supported) — the new procedure follows the same site-scoping
  contract for consistency with the rest of the dashboard.
- Pure logic in this codebase is unit-tested in a colocated `.test.ts`
  file (see `src/server/lib/scoring.test.ts`) rather than inside the tRPC
  procedure — the new aggregation math follows the same split.
- `cc-kpi-grid` (`device-overview.tsx:867`) is a `grid-cols-2 sm:grid-cols-3
  lg:grid-cols-6` grid sized for small square KPI tiles. A wide ranked-list
  panel needs a `className: "col-span-full"` override on its
  `WidgetDef` entry (the `SortableWidget`/`WidgetDef` shape already
  supports a `className` field) so it renders as a full-width row within
  the same sortable grid instead of being squeezed into a 1/6-width tile.

## Desired End State

A facility manager loads the main dashboard and sees a new panel ranking
all rooms worst-to-best by % time out of comfort threshold over the last
7 days, with an average-degrees-off-threshold stat per room. The panel is
part of the existing drag-to-reorder/hide widget system. Clicking a room
opens the same `RoomQuickOverviewPanel` sheet used elsewhere. Rooms with
no sensors, or no readings in the window, show "no data". Rooms with
readings on fewer than 7 of the trailing 7 days show a coverage note
(e.g. "based on 4 of 7 days").

Verification: load the dashboard against seed/demo data covering a
fully-compliant room, a chronically-violating room, a no-sensor room, and
a room with a data gap — confirm the ranking, severity stat, and coverage
note all render correctly, and that dragging/hiding the panel and
clicking through to a room's detail sheet both work.

## What We're NOT Doing

- No custom/configurable time windows — fixed trailing 7 days only (PRD
  Non-Goal).
- No export or scheduled-report capability (PRD Non-Goal).
- No predictive/forecasting logic — purely backward-looking (PRD
  Non-Goal).
- No per-device breakdown inside the ranking panel — room-level only
  (PRD Non-Goal).
- No changes to `scoreRoom()`, the existing `temperatureHistory`
  procedure, per-room threshold configuration, or any existing dashboard
  panel's behavior (PRD Guardrails).
- No new page/route — reuses the existing `RoomQuickOverviewPanel` sheet
  mechanism.
- Not fixing the pre-existing orphaned `kpi-by-room`/`room-temp-panel`
  widget-id gap discovered during research — out of scope for this
  change.

## Implementation Approach

Two phases: a backend phase that adds pure, unit-tested aggregation logic
plus a new site-scoped tRPC procedure reusing the existing bucketing SQL
pattern; then a frontend phase that adds the panel component and wires it
into the existing widget-personalization system and the existing
room-detail sheet.

## Critical Implementation Details

**Bucket combination across sensors**: for each expected hourly bucket
over the trailing 7 days (168 buckets), compute each sensor's average
temperature within that hour (reusing the existing bucketing SQL,
generalized to an `inArray` of the room's sensor `tuyaDeviceId`s), then
take the minimum across sensors *that have data in that specific hour*.
A sensor with no reading in a given hour simply doesn't contribute to
that hour's minimum — it does not force the whole bucket to null. A
bucket is only null when *no* sensor in the room reported during that
hour.

**Day-coverage boundary**: group hourly buckets into calendar days using
UTC day boundaries (single-timezone LAN deployment — avoids DST
complexity). A day counts as covered if at least one of its 24 hourly
buckets is non-null.

## Phase 1: Backend — aggregation logic and ranking procedure

### Overview

Add pure, unit-tested compliance-aggregation logic and a new site-scoped
tRPC procedure that queries all rooms' sensor readings for the trailing
7 days, combines them per the minimum-of-bucket-averages rule, and
returns a sorted ranking.

### Changes Required:

#### 1. Pure aggregation function

**File**: `src/server/lib/comfort-compliance.ts`

**Intent**: Given a dense, chronologically-ordered array of hourly
room-temperature buckets (already combined across sensors) and a room's
thresholds, classify each bucket in/out of threshold via `scoreRoom`'s
badge rule, and compute the room's % time out of threshold, average
degrees-off-threshold (over out-of-threshold buckets only), and
day-coverage count.

**Contract**:
```
computeRoomCompliance(
  buckets: { bucketStartMs: number; temperatureC: number | null }[], // 168 entries, one per trailing hour, chronological
  thresholds: { minTempC: number | null; maxTempC: number | null },
): {
  pctOutOfThreshold: number | null;       // null if thresholds unset or zero non-null buckets
  avgDegreesOffThreshold: number | null;  // null if no out-of-threshold buckets
  daysWithData: number;                   // 0-7, UTC calendar days with >=1 non-null bucket
}
```
Reuses `scoreRoom(temperatureC, null, thresholds)` per non-null bucket
for badge classification (`badge !== "OK"` → out-of-threshold); null
buckets are excluded from the percentage's denominator entirely (matches
`scoreRoom`'s own null-safety) but still count toward day-coverage
grouping as "no data for that hour."

#### 2. Unit tests

**File**: `src/server/lib/comfort-compliance.test.ts`

**Intent**: Cover the classification and aggregation math directly,
following the existing `scoring.test.ts` convention (plain `describe`/`it`,
no mocking needed since the function is pure).

**Contract**: Cases to cover — all-OK room (0% out), all-cold room (100%
out, correct avg degrees-off), mixed buckets (correct % and avg-off
computed only over violating buckets), null-threshold room (both stats
null), zero-data room (all buckets null → both stats null,
`daysWithData: 0`), partial-coverage room (data present on 4 of 7 days →
`daysWithData: 4`, percentage computed only over the buckets that exist).

#### 3. Ranking tRPC procedure

**File**: `src/server/api/routers/device.ts`

**Intent**: New `comfortComplianceRanking` procedure, site-scoped like
`overview`, that builds the dense per-room hourly bucket series from
`deviceTemperatureReadings` for each room's sensor devices, calls
`computeRoomCompliance` per room, and returns rooms sorted worst-first.

**Contract**:
```
comfortComplianceRanking: protectedProcedure
  .input(z.object({ siteId: z.string() }))
  .query(...) => Array<{
    roomId: string;
    roomName: string;
    pctOutOfThreshold: number | null;
    avgDegreesOffThreshold: number | null;
    daysWithData: number;
  }>  // sorted by pctOutOfThreshold descending, nulls last
```
Fetch rooms + sensor-type devices scoped by `siteId` (reuse the
room/device join shape from `overview`, `device.ts:360-378`) and
thresholds (reuse the `roomThresholds` + `defaultThresholds` fallback
pattern, `device.ts:451-478`). Query `deviceTemperatureReadings` once
across all rooms' sensor `tuyaDeviceId`s with `inArray(...)` +
`gte(recordedAt, fromTs)` (7-day bound) — a single grouped query, not one
per room, to keep this within the "must not degrade dashboard load time"
guardrail and to use the existing `(tuyaDeviceId, recordedAt)` index.
Bucket with the same `(recordedAt / 3600) * 3600` expression already used
in `temperatureHistory`'s 7d branch. Build the dense 168-bucket series
per room in application code (fill gaps with `null`), then delegate to
`computeRoomCompliance`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npx vitest run src/server/lib/comfort-compliance.test.ts`
- Full test suite passes: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`

#### Manual Verification:

- Query the new procedure directly (e.g. via a temporary script or
  Drizzle Studio cross-check) against seed/demo data and confirm the
  returned percentages and coverage counts match hand-calculated
  expectations for at least one multi-sensor room.

---

## Phase 2: Frontend — ranking panel and dashboard wiring

### Overview

Add the panel component, register it in the existing widget
personalization system, and wire room clicks into the existing
room-detail sheet.

### Changes Required:

#### 1. Ranking panel component

**File**: `src/app/_components/comfort-compliance-ranking-panel.tsx`

**Intent**: Self-contained panel (own `api.device.comfortComplianceRanking.useQuery`
call, following the `RoomTemperaturePanel` pattern of not piggybacking on
the `overview` query) rendering rooms sorted worst-to-best, each row
showing % out of threshold, average degrees-off-threshold, and a
partial-coverage note when `daysWithData < 7`. Rooms with
`pctOutOfThreshold: null` render a "no data" state instead of `0%` or an
error (PRD US-01 AC). Loading state uses the existing `Skeleton`
component; overall empty state (`rooms.length === 0`) follows
`CcDevicesByRoom`'s empty-state pattern.

**Contract**: Props: `{ siteId: string; onRoomSelect: (roomId: string) => void }`.
Clicking a row calls `onRoomSelect(roomId)`.

#### 2. Widget registration

**File**: `src/lib/dashboard-widgets.ts`

**Intent**: Add the new widget id to the canonical default order.

**Contract**: Append `"comfort-compliance-ranking"` to
`DEFAULT_WIDGET_ORDER`.

#### 3. Dashboard wiring

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Add a matching `widgetDefinitions` entry so the new id is
actually draggable/hideable (not orphaned like the pre-existing
`kpi-by-room`/`room-temp-panel` ids), rendering the new panel full-width
within the `cc-kpi-grid`, and wire its room-click callback to the
existing `setSelectedRoomId` setter.

**Contract**: New entry in the `widgetDefinitions` array (`device-overview.tsx:554-772`):
`{ id: "comfort-compliance-ranking", label: "Comfort Compliance Ranking", className: "col-span-full", render: <ComfortComplianceRankingPanel onRoomSelect={setSelectedRoomId} siteId={activeSiteId} /> }`.
No other changes to `setSelectedRoomId` or `RoomQuickOverviewPanel` — the
existing sheet-opening mechanism (`device-overview.tsx:1160-1178`) is
reused unmodified.

### Success Criteria:

#### Automated Verification:

- Full test suite passes: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`
- Build succeeds: `npm run build`

#### Manual Verification:

- Load the dashboard against seed/demo data with a fully-compliant room,
  a chronically-violating room, a no-sensor room, and a room with a data
  gap in the last 7 days — confirm ranking order, severity stat,
  "no data" state, and "(based on N of 7 days)" note all render
  correctly.
- Drag the new panel to reorder it and hide it; refresh the page and
  confirm the layout persists; use "Reset layout" and confirm it
  reappears in its default position.
- Click a ranked room and confirm the same `RoomQuickOverviewPanel` sheet
  opens as clicking a room elsewhere on the dashboard.
- Confirm existing per-room threshold configuration and
  temperature-history views still work unchanged (guardrail regression
  check).

---

## Testing Strategy

### Unit Tests:

- `computeRoomCompliance`: all-OK, all-cold, all-hot, mixed (with correct
  avg-degrees-off restricted to violating buckets), null-threshold,
  zero-data, and partial-coverage (4-of-7-days) cases.

### Integration Tests:

- None planned beyond the unit-level coverage above — matches this
  codebase's existing convention (no component-level tests exist for
  `device-overview.tsx` or its sibling panels); the tRPC procedure itself
  is thin glue over the tested pure function plus a query shape modeled
  directly on the already-proven `temperatureHistory`/`overview`
  patterns.

### Manual Testing Steps:

1. Seed/demo data covering: a fully-compliant room, a chronically
   cold/hot room, a room with no sensors, and a room with a sensor gap in
   the last 7 days.
2. Load the dashboard and confirm the new panel appears, sorted
   worst-first.
3. Confirm the no-sensor room shows "no data", not `0%`.
4. Confirm the gapped room shows its coverage note.
5. Drag/hide the panel, refresh, confirm persistence; use "Reset layout".
6. Click a ranked room; confirm the existing detail sheet opens.
7. Spot-check that threshold configuration and temperature-history views
   are unaffected.

## Performance Considerations

The ranking procedure issues a single grouped query across all rooms'
sensor `tuyaDeviceId`s (via `inArray`) bounded by the existing
`gte(recordedAt, fromTs)` filter, reusing the indexed
`(tuyaDeviceId, recordedAt)` column pair — not one query per room. This
mirrors the query shape already proven performant for the per-device 7-day
chart in `temperatureHistory`.

## Migration Notes

None — no schema changes, no data migrations.

## References

- PRD: `context/foundation/prd-v12.md`
- Shape notes: `context/foundation/shape-notes.md`
- Similar implementation: `src/server/api/routers/device.ts:299-355`
  (`temperatureHistory` bucketing pattern), `src/server/api/routers/device.ts:357-505`
  (`overview` site-scoping and threshold-fallback pattern),
  `src/server/lib/scoring.ts:15-54` (`scoreRoom`),
  `src/lib/dashboard-widgets.ts` (widget registry),
  `src/app/_components/device-overview.tsx:554-772,860-930,1160-1178`
  (widget definitions, grid layout, room-detail sheet wiring)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — aggregation logic and ranking procedure

#### Automated

- [x] 1.1 Unit tests pass: `npx vitest run src/server/lib/comfort-compliance.test.ts`
- [x] 1.2 Full test suite passes: `npm run test`
- [x] 1.3 Type checking passes: `npm run typecheck`
- [x] 1.4 Linting passes: `npm run check`

#### Manual

- [x] 1.5 Query the new procedure against seed/demo data and confirm returned percentages/coverage counts match hand-calculated expectations

### Phase 2: Frontend — ranking panel and dashboard wiring

#### Automated

- [ ] 2.1 Full test suite passes: `npm run test`
- [ ] 2.2 Type checking passes: `npm run typecheck`
- [ ] 2.3 Linting passes: `npm run check`
- [ ] 2.4 Build succeeds: `npm run build`

#### Manual

- [ ] 2.5 Ranking, severity stat, "no data", and coverage note all render correctly against seed/demo data
- [ ] 2.6 Drag/hide/reset-layout persistence verified
- [ ] 2.7 Clicking a ranked room opens the existing detail sheet
- [ ] 2.8 Existing threshold configuration and temperature-history views unaffected
