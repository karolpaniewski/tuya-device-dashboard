# Room Health Thresholds — Implementation Plan

## Overview

The scoring machinery is already complete: `roomThresholds` table exists, `scoreRoom()` runs on every `device.overview` call, and each room in the API response already carries `badge`, `anomaly`, and `suggestion`. This plan wires those fields into the user-visible UI and adds the two missing backend pieces: threshold CRUD procedures and hardcoded global defaults.

## Current State Analysis

- **DB schema**: `roomThresholds(id, roomId UNIQUE, minTempC, maxTempC, anomalyGapC)` exists with a CHECK constraint (`minTempC < maxTempC`). All three threshold columns are nullable. `$defaultFn(crypto.randomUUID)` generates the id on insert.
- **Scoring**: `scoreRoom()` in `src/server/lib/scoring.ts` returns `{ badge: RoomBadge | null, anomaly: boolean, suggestion: string | null }`. Returns `{ badge: null, … }` when any threshold column is null.
- **device.overview**: already fetches all `roomThresholds` rows and calls `scoreRoom` per room. Each room in the response carries `badge`, `anomaly`, `suggestion`. Multi-sensor uses `.find()` (first sensor, not minimum).
- **room router**: 5 procedures — no threshold procedures yet.
- **RoomGroup / DeviceCard**: `badge`, `anomaly`, `suggestion` are not passed as props and are not rendered. `DeviceOverview` does not forward them.
- **Global default**: currently falls back to `{ minTempC: null, maxTempC: null, anomalyGapC: null }` — scoring returns null badge for all rooms with no configured threshold.

## Desired End State

- `room.getThreshold` and `room.setThreshold` procedures registered in `appRouter`.
- Rooms without a threshold record score against hardcoded defaults (18 °C / 24 °C / 3 °C gap).
- Multi-sensor rooms use the minimum (coldest) sensor reading.
- Dashboard room headers show the badge chip (OK / Too Cold / Too Hot) and suggestion text when an anomaly is active.
- `/setup` page has an inline threshold form per room — pre-populated with current values or defaults; submitting calls `room.setThreshold`; changes are reflected in the dashboard immediately (via `device.overview` invalidation).

### Key Discoveries

- `roomThresholds.roomId` is UNIQUE → setThreshold is an `onConflictDoUpdate` upsert on that column (`src/server/db/schema.ts:117–144`)
- `scoreRoom` accepts `temperatureC: number | null` — multi-sensor fix is upstream in `device.ts`, not in `scoring.ts` (`src/server/api/routers/device.ts:163–180`)
- `filteredRooms` in `DeviceOverview` spreads the full room object via `{ ...room, devices: ... }` so `badge`, `anomaly`, `suggestion` are already present — they just aren't passed to `RoomGroup` (`src/app/_components/device-overview.tsx`)
- `getThreshold` should NOT share `room.list` — adding it as a separate lazy query avoids changing `room.list` (which has passing tests) and is a natural fit since the form only opens one room at a time
- Biome `useSortedAttributes` is ON — all JSX props must be alphabetical

## What We're NOT Doing

- User-configurable global defaults — hardcoded 18 / 24 / 3 °C is sufficient for MVP (PRD doesn't require a UI for global defaults)
- Per-device anomaly flags on DeviceCard — room-level badge is enough at this scale
- Tests — user confirmed manual verification only
- Historical threshold audit log — not in PRD

## Implementation Approach

Three sequential phases. Phase 1 is backend-only (no UI change, enables integration testing manually via tRPC). Phase 2 adds the read-only dashboard display. Phase 3 adds the write path (setup UI). Each phase has its own typecheck + lint gate.

---

## Phase 1: Threshold Procedures + Default Scoring

### Overview

Add `getThreshold` and `setThreshold` to the room router, and fix two issues in `device.overview`: the hardcoded-null fallback and the first-sensor vs minimum-sensor aggregation.

### Changes Required

#### 1. room.ts — `getThreshold` procedure

**File**: `src/server/api/routers/room.ts` (modify)

**Intent**: Expose the current threshold record for a room so the setup UI can pre-populate its form.

**Contract**: `protectedProcedure` query, input `{ roomId: z.string() }`. Selects from `roomThresholds` where `roomThresholds.roomId = input.roomId`. Returns `{ minTempC, maxTempC, anomalyGapC }` if a row exists, or `null` if not. Does NOT throw NOT_FOUND when the room exists but has no threshold — null is the expected state for a freshly created room.

#### 2. room.ts — `setThreshold` procedure

**File**: `src/server/api/routers/room.ts` (modify)

**Intent**: Upsert a threshold record for a room, validating that the room exists and that min < max.

**Contract**: `protectedProcedure` mutation. Input:
```
{
  roomId: z.string(),
  minTempC: z.number(),
  maxTempC: z.number(),
  anomalyGapC: z.number().min(0),
}
```
Steps:
1. Verify room exists: `select from rooms where id = roomId`. Throw `TRPCError({ code: "NOT_FOUND" })` if 0 rows.
2. Validate `minTempC < maxTempC`. Throw `TRPCError({ code: "BAD_REQUEST", message: "Min must be less than max" })` if violated.
3. Upsert: `db.insert(roomThresholds).values({ roomId, minTempC, maxTempC, anomalyGapC }).onConflictDoUpdate({ target: roomThresholds.roomId, set: { minTempC, maxTempC, anomalyGapC } })`.
4. Return `{ success: true as const }`.

#### 3. device.ts — hardcoded global default + minimum-sensor aggregation

**File**: `src/server/api/routers/device.ts` (modify)

**Intent**: (a) Rooms without a `roomThresholds` entry now score against 18–24 °C / 3 °C gap instead of returning null badge. (b) Multi-sensor rooms use the coldest reading.

**Contract (a)**: Add a constant before the `scoredRooms` derivation:
```ts
const DEFAULT_THRESHOLDS = { minTempC: 18, maxTempC: 24, anomalyGapC: 3 };
```
Change the thresholdMap fallback from `{ minTempC: null, maxTempC: null, anomalyGapC: null }` to `DEFAULT_THRESHOLDS`.

**Contract (b)**: Replace the existing single-sensor `.find()` with a minimum-temperature aggregation. The cleanest approach:
```ts
const roomTempC = room.devices
  .filter((d) => d.deviceType === "sensor")
  .flatMap((d) => (d.temperatureC !== null ? [d.temperatureC] : []))
  .reduce<number | null>((min, t) => (min === null || t < min ? t : min), null);
```
Then pass `roomTempC` directly to `scoreRoom` instead of `sensor?.temperatureC ?? null`. Remove the `sensor` const.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with zero errors
- `npm run check` (Biome lint) passes

#### Manual Verification

- `npm run dev` starts without runtime errors
- Dashboard room headers show the correct badge even for rooms with no `roomThresholds` record (default 18–24 °C in effect)

**Implementation Note**: After automated verification passes, pause for manual verification before proceeding to Phase 2.

---

## Phase 2: Dashboard Badge Display

### Overview

Pass `badge`, `anomaly`, and `suggestion` from `DeviceOverview` into `RoomGroup` and render them. No data-fetching changes — all three fields are already in the `device.overview` response.

### Changes Required

#### 1. room-group.tsx — badge + suggestion props

**File**: `src/app/_components/room-group.tsx` (modify)

**Intent**: Render a colored badge chip in the room header and an anomaly suggestion text below it.

**Contract**: Extend `RoomGroupProps` with three optional fields (alphabetical after `devices`, before `isUnassigned`):
- `badge?: "OK" | "Too Cold" | "Too Hot" | null`
- `suggestion?: string | null`
- `anomaly?: boolean`

Wait — alphabetical in the interface: `anomaly` (a), `badge` (b), `devices` (d), `isUnassigned` (i), `roomName` (r), `suggestion` (s).

Badge color map constant (file-level):
```ts
const BADGE_STYLE: Record<string, string> = {
  "OK": "bg-green-700 text-green-100",
  "Too Cold": "bg-blue-700 text-blue-100",
  "Too Hot": "bg-red-700 text-red-100",
};
```

In the JSX, the `<h2>` row changes from:
```tsx
<h2 className="...">{roomName} <span>({count})</span></h2>
```
to a flex row: room name + count span on the left, badge chip on the right (when `badge` is non-null). Badge chip: `<span className={`rounded px-2 py-0.5 font-medium text-xs ${BADGE_STYLE[badge]}`}>{badge}</span>`.

Below the `<h2>`, add: `{anomaly && suggestion && <p className="text-amber-400 text-sm italic">{suggestion}</p>}`.

#### 2. device-overview.tsx — forward badge/anomaly/suggestion to RoomGroup

**File**: `src/app/_components/device-overview.tsx` (modify)

**Intent**: The room objects in `filteredRooms` already carry `badge`, `anomaly`, `suggestion` via the spread operator. Pass them as props to `RoomGroup`.

**Contract**: In the `filteredRooms.map(...)` JSX block, add three props to `<RoomGroup>`:
- `anomaly={room.anomaly}`
- `badge={room.badge}`
- `suggestion={room.suggestion}`

Keep alphabetical prop order: `anomaly`, `badge`, `devices`, `key`, `roomName`, `suggestion`.

The `filteredUnassigned` RoomGroup receives no badge/anomaly/suggestion (unassigned devices don't have room scores) — omit those props; the defaults (`undefined`) suppress rendering.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with zero errors
- `npm run check` (Biome lint) passes

#### Manual Verification

- Dashboard room headers show colored badge chips: green "OK", blue "Too Cold", red "Too Hot"
- Rooms without sensors or without thresholds show no badge (null badge)
- Suggestion text appears below a room header when an anomaly is active (temperature significantly below setpoint)
- Unassigned group has no badge

**Implementation Note**: After all verification passes, proceed to Phase 3.

---

## Phase 3: Threshold Configuration UI

### Overview

New `RoomThresholdForm` component handles the per-room threshold form (lazy `getThreshold` query + `setThreshold` mutation). `RoomManager` gains a ⚙ toggle button per room that opens/closes the form inline.

### Changes Required

#### 1. RoomThresholdForm component

**File**: `src/app/_components/setup/room-threshold-form.tsx` (new)

**Intent**: Inline form to view and save a room's min/max temperature thresholds and anomaly gap.

**Contract**: `"use client"`. Props: `{ onClose: () => void; roomId: string; utils: ReturnType<typeof api.useUtils> }` (alphabetical: onClose, roomId, utils).

`api.room.getThreshold.useQuery({ roomId }, { refetchOnWindowFocus: false, staleTime: Number.POSITIVE_INFINITY })` — fetches once when the component mounts; does not re-fetch on window focus to avoid resetting user edits.

Three controlled string state values: `min`, `max`, `gap`. Initialized via `useEffect` when `data !== undefined`:
- If `data` is null (no record): initialize to `"18"`, `"24"`, `"3"`.
- If `data` is a record: initialize to `String(data.minTempC)`, `String(data.maxTempC)`, `String(data.anomalyGapC)`.

Inline validation state (`formError: string | null`): set on submit if `parseFloat(min) >= parseFloat(max)`.

`api.room.setThreshold.useMutation({ onSuccess: () => { void utils.device.overview.invalidate(); onClose(); }, onError: (e) => setFormError(e.message) })`.

On submit: parse inputs to numbers, validate `min < max`, call mutation with `{ roomId, minTempC: parsed min, maxTempC: parsed max, anomalyGapC: parsed gap }`.

Layout (a single `<form>` with `onSubmit`): three `<label>` + `<input type="number" step="0.5">` pairs (Min °C, Max °C, Anomaly gap °C), then an error row, then two buttons (Save / Cancel). Style: matches the dark-theme form in `room-manager.tsx` (`bg-gray-900`, `border-gray-600`, `text-white`, `text-sm`).

When the query `isLoading`, render a `<p className="text-gray-500 text-sm">Loading…</p>` instead of the form.

**JSX prop ordering notes**: input props alphabetical — `className`, `min`/`max`/`step`, `onChange`, `type`, `value`. The three numeric inputs share the same className; label/input pairs separated by `<label>` elements.

#### 2. RoomManager — ⚙ toggle per room

**File**: `src/app/_components/setup/room-manager.tsx` (modify)

**Intent**: Let the facility manager open the threshold form for any room with a single click.

**Contract**: Add one state: `thresholdRoomId: string | null` (default `null`). Clicking ⚙ on room X:
- If `thresholdRoomId === room.id` → set to `null` (close/toggle)
- Otherwise → set `editingId` to `null` (close any open rename), set `thresholdRoomId` to `room.id`

In the room list `<li>` for each room, add a ⚙ `<button>` alongside the existing rename (✎) and delete (✕) buttons. The ⚙ button should be visually active (e.g. `text-blue-400`) when `thresholdRoomId === room.id`.

After the room `<li>`, conditionally render `<RoomThresholdForm>` when `thresholdRoomId === room.id`:
```tsx
{thresholdRoomId === room.id && (
  <RoomThresholdForm
    onClose={() => setThresholdRoomId(null)}
    roomId={room.id}
    utils={utils}
  />
)}
```

Import: `import { RoomThresholdForm } from "./room-threshold-form"`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with zero errors
- `npm run check` (Biome lint) passes
- `npm run dev` starts without runtime errors

#### Manual Verification

- `/setup` shows a ⚙ button on each room row
- Clicking ⚙ opens the threshold form below the row; clicking again closes it
- Form pre-populates with saved values (or 18 / 24 / 3 defaults for new rooms)
- Saving a threshold closes the form; the dashboard room badge updates on next `device.overview` poll (or immediately if `invalidate` fires)
- Min ≥ Max: form shows inline error "Min must be less than max"; mutation is not called
- Anomaly gap accepts decimals (e.g. 2.5)
- Cancel closes the form without saving
- Opening rename (✎) while threshold form is open closes the threshold form
- The ⚙ button is visually highlighted (blue) when the form is open for that room

**Implementation Note**: After all verification passes, this change is complete.

---

## Testing Strategy

No automated tests — user confirmed manual verification is sufficient for this slice.

### Manual Testing Steps

1. Start dev server: `npm run dev` (with `TUYA_STUB=true`)
2. Log in, navigate to main dashboard
3. **Default scoring**: rooms with no threshold should show colored badges (18–24 °C defaults in effect)
4. Navigate to `/setup`; open threshold form for a room (⚙ button)
5. Set Min = 20, Max = 22, Gap = 2 → Save → dashboard badge should reflect the tighter range
6. Set Min = 25, Max = 20 → form should block with inline error "Min must be less than max"
7. With stub data at e.g. 19 °C: room should show "Too Cold" badge
8. Cancel: close form without saving; re-open — previous saved values shown
9. Multi-sensor rooms: badge reflects coldest sensor, not the first listed
10. Anomaly: set gap to 1, ensure setpoint is 2+ °C above current temp → "Temperature is X°C below setpoint" suggestion appears under room header

## References

- Roadmap: S-05 in `context/foundation/roadmap.md`
- PRD: FR-004, Business Logic section in `context/foundation/prd.md`
- Scoring function: `src/server/lib/scoring.ts`
- DB schema: `src/server/db/schema.ts` (roomThresholds table)
- Device router reference: `src/server/api/routers/device.ts`
- Room router reference: `src/server/api/routers/room.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Threshold Procedures + Default Scoring

#### Automated

- [x] 1.1 `npm run typecheck` passes with zero errors — 82c646f
- [x] 1.2 `npm run check` (Biome lint) passes — 82c646f

#### Manual

- [x] 1.3 `npm run dev` starts without runtime errors — 82c646f
- [x] 1.4 Dashboard room headers show badge even for rooms with no threshold record (18–24 °C defaults)

### Phase 2: Dashboard Badge Display

#### Automated

- [x] 2.1 `npm run typecheck` passes with zero errors
- [x] 2.2 `npm run check` (Biome lint) passes

#### Manual

- [x] 2.3 Room headers show colored badge chips (OK green / Too Cold blue / Too Hot red)
- [x] 2.4 Rooms without sensors or thresholds show no badge
- [x] 2.5 Suggestion text appears below room header when anomaly is active
- [x] 2.6 Unassigned group shows no badge

### Phase 3: Threshold Configuration UI

#### Automated

- [ ] 3.1 `npm run typecheck` passes with zero errors
- [ ] 3.2 `npm run check` (Biome lint) passes
- [ ] 3.3 `npm run dev` starts without runtime errors

#### Manual

- [ ] 3.4 ⚙ button appears on each room row in /setup
- [ ] 3.5 Clicking ⚙ opens threshold form; clicking again closes it (toggle)
- [ ] 3.6 Form pre-populates with saved values or defaults (18 / 24 / 3)
- [ ] 3.7 Saving closes form; dashboard badge updates
- [ ] 3.8 Min ≥ Max shows inline error; mutation not called
- [ ] 3.9 Cancel closes without saving; re-open shows last saved values
- [ ] 3.10 Opening rename closes threshold form
