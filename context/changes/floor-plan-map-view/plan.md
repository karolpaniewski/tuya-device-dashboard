# Interactive 2D Floor-Plan ("Digital Twin") Map View Implementation Plan

## Overview

Add a new "Map View" page where an admin uploads a static floor-plan image
per site, drags device icons from an "unplaced" roster onto their physical
location on that image, and clicks a placed device to open the existing
device control modal. Placed devices render in the color of their room's
existing OK/Too Cold/Too Hot badge. This is a pure visualization addition —
no new domain logic, no new telemetry path, no data migration of existing
rows.

## Current State Analysis

- Devices are shown grouped by room as cards (`room-group.tsx`) with a
  per-room comfort badge computed server-side by `scoreRoom()`
  (`src/server/lib/scoring.ts:15-54`) and returned as part of
  `device.overview`'s room grouping (`src/server/api/routers/device.ts:314-`).
  The badge is **per-room**, not per-device — a placed device's map color
  must come from its assigned room's badge, not a new per-device computation.
- `device.overview` (`src/server/api/routers/device.ts:314`) already returns
  devices grouped by room (with `badge`) plus an `unassigned` list. It selects
  `{ device: devices, room: rooms }` via a join — extending the selected
  columns to include the two new map-position columns is a one-line change.
- `DeviceModal` (`src/app/_components/device-modal.tsx:32-44`) takes a full
  `DeviceItem` (the exact type already returned by `device.overview`), a
  `rooms` list, `utils`, and `onClose`. It's opened today via plain
  `useState<DeviceItem | null>` in `device-overview.tsx:120` — no URL state,
  trivially reusable from a new page.
- `@dnd-kit` (`device-overview.tsx:975-1086`) is used for **sortable lists**
  (`useSortable` + `SortableContext`) — it is not used anywhere for free
  continuous positioning, and isn't the right tool for that shape of
  interaction (see Key Discoveries).
- **No upload infrastructure exists anywhere in this app** — no route
  handler, no `public/` upload directory, no cloud storage integration.
- `src/server/db/schema.ts` has no image/file-reference column anywhere.
  Latest migration is `0012_amusing_warbird`; next is `0013`.
- `src/middleware.ts:7` gates everything except
  `login|api/auth|_next/static|_next/image|favicon.ico` behind NextAuth —
  this includes anything served from `public/`, so floor-plan images get the
  same auth gate as the rest of the app with zero extra code.
- Settings page (`src/app/_components/setup/settings-shell.tsx`) is a flat
  grid of `SettingsCard` wrappers, each given site-scoped data + `utils` as
  props — a new card follows the exact same shape as the seven existing ones.
- Sidebar nav (`src/app/_components/command-center-shell.tsx:125-136`) is two
  hardcoded `RailLink` elements (Dashboard, Setup) — adding a third is a
  three-line insertion.
- `src/app/error.tsx` is the existing app-level error boundary (S-14). Next.js
  route-segment `error.tsx` files scope an error boundary to just that
  segment — a `src/app/map/error.tsx` isolates a Map View crash from the rest
  of the app natively, which is the cleanest way to guarantee FR-009's "must
  never block critical device control" without any manual try/catch
  plumbing around the dashboard.

### Key Discoveries:

- The badge a placed device should show is the **room's** badge (already
  computed and returned by `device.overview`), not a new calculation —
  FR-006 maps directly onto existing data.
- Native HTML5 Drag and Drop (chosen over `@dnd-kit`/`react-konva` in
  questioning) needs the floor-plan `<img>`'s `getBoundingClientRect()` at
  drop time to convert a `clientX`/`clientY` drop event into a 0–100
  percentage pair — this is the one piece of genuinely new math in the
  feature and is worth a small, independently testable pure function.
- Because `public/` is already behind the auth middleware, the upload route
  handler only needs to handle the POST (write); GET/serving needs no new
  code at all.
- One floor-plan image per site (per PRD's Constraints section) means the
  upload handler can overwrite a fixed filename per site
  (`<siteId>.<ext>`) rather than tracking a history of uploads — there is no
  "old file cleanup" problem to solve.

## Desired End State

An admin can open "Map View" from the sidebar, upload a floor-plan image for
the active site via Settings, drag any device from the unplaced roster onto
the image, see it render colored by its room's current badge, click it to
open the same setpoint modal used elsewhere in the app, reposition or remove
it later, and — if the floor plan itself fails to render — still control
every device exactly as before via the existing list view, with a visible
error message pointing them there.

**Verification:** upload an image for a site in Settings → "Map View" shows
it; drag an unplaced device onto it → position persists across reload;
device node color matches its room's badge in the dashboard; clicking it
opens the working setpoint modal; removing it returns it to the roster;
corrupting/removing the uploaded file shows the Map View's error state while
the dashboard's list view and valve control remain fully functional.

## What We're NOT Doing

- No room-drawing/wall-snapping tool — the floor plan is a static image; no
  parsing of room geometry (Non-Goal).
- No pan/zoom/gesture controls, no mobile/375px support for the map itself —
  desktop-only; existing list view still serves mobile (Non-Goal, FR-010).
- No real-time multi-user collaboration (cursor tracking / live broadcast).
- No spatial automation rules, no thermal heatmap overlay.
- No Playwright E2E test for the drag gesture itself (testing decision —
  native HTML5 drag-and-drop is notoriously flaky to automate; covered by
  unit/integration tests + manual verification instead).
- No image resizing/optimization or multi-format support beyond PNG/JPG.
- No history of uploaded floor plans — only the current image per site is
  kept.

## Implementation Approach

Four phases, each independently shippable: (1) schema, (2) backend
read/write surface, (3) the Settings upload UI, (4) the Map View page
itself. This mirrors the project's established "data model → backend → API →
UI" pattern. The map position fields are added directly to the existing
`devices` and `sites` tables (not a new join table) since this is a strict
1:1 extension — one optional position per device, one optional image per
site — with no need for relational flexibility beyond that.

## Phase 1: Schema & Migration

### Overview

Add the two new optional columns the rest of the feature depends on, with no
backfill and no change to any existing row's meaning.

### Changes Required:

#### 1. Devices table — map position

**File**: `src/server/db/schema.ts`

**Intent**: Store a device's placed position on its site's floor plan as a
percentage pair, nullable so "no position" simply means "not yet placed" —
no separate boolean flag needed.

**Contract**: Add `mapXPct: d.real("map_x_pct")` and
`mapYPct: d.real("map_y_pct")` to the `devices` table definition
(`schema.ts:111-155`), both nullable (no `.notNull()`), no default. A device
with both null is "in the unplaced roster."

#### 2. Sites table — floor plan image reference

**File**: `src/server/db/schema.ts`

**Intent**: Store the on-disk path of a site's uploaded floor-plan image,
nullable so a site with no upload yet has no image reference.

**Contract**: Add `floorPlanImagePath: d.text("floor_plan_image_path", { length: 255 })`
to the `sites` table definition (`schema.ts:17-28`), nullable, no default.

#### 3. Migration

**File**: `drizzle/` (generated)

**Intent**: Generate and apply the migration for the two new columns.

**Contract**: Run the project's existing Drizzle generate command to produce
`0013_*.sql` + matching `drizzle/meta/0013_snapshot.json`, following directly
from `0012_amusing_warbird`. No data migration logic needed — both columns
are nullable additions.

### Success Criteria:

#### Automated Verification:

- [ ] Migration generates without manual edits and matches schema intent
- [ ] `npm run typecheck` passes
- [ ] Existing schema-dependent tests still pass: `npm run test`

#### Manual Verification:

- [ ] Migration applies cleanly against the dev SQLite database
- [ ] Existing devices/sites rows are unaffected (spot-check via Drizzle
      Studio or a `SELECT *`)

---

## Phase 2: Backend API

### Overview

Expose the new columns through the existing query surface, add the two
mutations that persist placement changes, and stand up the upload route
handler plus its supporting coordinate-math utility.

### Changes Required:

#### 1. Extend `device.overview`

**File**: `src/server/api/routers/device.ts`

**Intent**: Surface `mapXPct`/`mapYPct` on every device the query already
returns, so the Map View can use the same query as the rest of the app
instead of a parallel data path.

**Contract**: Add `mapXPct` and `mapYPct` to the `device: devices` select
projection at line ~318 and to the `DeviceItem` shape constructed per row
(~line 354+). No change to the query's grouping/joins/filtering logic.

#### 2. Extend `site.list`

**File**: `src/server/api/routers/site.ts`

**Intent**: Surface each site's `floorPlanImagePath` so Settings and the Map
View can read it without a new query.

**Contract**: Add `floorPlanImagePath: sites.floorPlanImagePath` to the
`list` procedure's select projection (`site.ts:9-14`).

#### 3. `device.setMapPosition` mutation

**File**: `src/server/api/routers/device.ts`

**Intent**: Persist a device's dropped or repositioned map location.

**Contract**: `protectedProcedure.input(z.object({ deviceId: z.string(), xPct: z.number().min(0).max(100), yPct: z.number().min(0).max(100) }))` →
updates the matching `devices` row's `mapXPct`/`mapYPct`. Follow the
existing error pattern in this router (throw `TRPCError({ code: "NOT_FOUND" })`
if the update affects zero rows).

#### 4. `device.clearMapPosition` mutation

**File**: `src/server/api/routers/device.ts`

**Intent**: Return a placed device to the unplaced roster (FR-005).

**Contract**: `protectedProcedure.input(z.object({ deviceId: z.string() }))` →
sets `mapXPct`/`mapYPct` to `null` on the matching row. Same not-found error
pattern as above.

#### 5. Coordinate-math utility

**File**: `src/lib/map-coordinates.ts` (new)

**Intent**: Isolate the one piece of new math (drop-event coordinates →
clamped percentage pair) as a pure function so it's unit-testable without
mounting any component or simulating a drag event.

**Contract**: `dropPositionToPercent(clientX: number, clientY: number, containerRect: DOMRect): { xPct: number; yPct: number }`,
clamping both outputs to `[0, 100]` (a drop slightly outside the image
bounds still lands at the nearest edge rather than erroring).

#### 6. Floor-plan upload route handler

**File**: `src/app/api/floor-plan/upload/route.ts` (new)

**Intent**: Accept a multipart upload for a site's floor-plan image, validate
it, write it to disk, and record its path — as a single request from the
client, since binary uploads don't go through tRPC.

**Contract**: `POST` handler reading `FormData` with `siteId` and `file`
fields. Validates the session via the existing `auth()` helper from
`~/server/auth` (mirroring the auth check `protectedProcedure` does, since
this route bypasses tRPC's middleware). Validates `file.type` is
`image/png` or `image/jpeg` and `file.size <= 5 * 1024 * 1024`, returning
`400` with a specific message otherwise. Writes the file to
`public/uploads/floor-plans/<siteId>.<ext>` (overwriting any prior upload for
that site — one floor plan per site, per Constraints), then updates that
site's `floorPlanImagePath` directly via the Drizzle `db` client. Extract the
validation check itself into a small exported function (e.g.
`validateFloorPlanUpload(file: File)`) so it's unit-testable independent of
the route handler's request/response plumbing.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] New unit tests pass: `dropPositionToPercent` clamping behavior
      (in-bounds, negative, over-100 inputs)
- [ ] New unit tests pass: `validateFloorPlanUpload` (accepts PNG/JPG ≤5MB,
      rejects wrong mime type, rejects oversized file)
- [ ] New/extended router tests pass: `device.setMapPosition`,
      `device.clearMapPosition`, extended `device.overview`/`site.list`
      auth-gate and shape assertions, following the mocking pattern in
      `device.test.ts`
- [ ] `npm run lint` passes

#### Manual Verification:

- [ ] Calling the upload route with a valid PNG via a manual `curl`/fetch
      writes the file and updates the site row
- [ ] Calling it with an oversized or wrong-type file returns a clear `400`
      and writes nothing

---

## Phase 3: Settings — Floor-Plan Upload UI

### Overview

Let the admin upload (and replace) a floor-plan image for the active site
from the existing Settings page, using the same card pattern as the other
seven Settings sections.

### Changes Required:

#### 1. `FloorPlanManager` component

**File**: `src/app/_components/setup/floor-plan-manager.tsx` (new)

**Intent**: A file picker scoped to the active site that calls the upload
route handler directly via `fetch` with `FormData` (not tRPC — binary
upload), shows the current image as a thumbnail if one exists, and lets the
admin replace it. Mirrors `RoomManager`'s shape: `activeSiteId` +
site-scoped data + `utils` as props, internal `useState` for the
in-flight/error UI state, `toast` feedback on success/failure (existing
convention — see `room-manager.tsx`).

**Contract**: On successful upload, calls
`utils.site.list.invalidate()` (and `utils.device.overview.invalidate()` is
not needed here — only `site.list`'s `floorPlanImagePath` changed) so the
new image shows immediately without a manual refresh.

#### 2. Wire into Settings shell

**File**: `src/app/_components/setup/settings-shell.tsx`

**Intent**: Add the new card alongside the existing seven, following the
identical `SettingsCard` usage already there.

**Contract**: Insert
`<SettingsCard description="Upload a floor-plan image for the active site" icon={Image} title="Floor Plan"><FloorPlanManager activeSiteId={activeSiteId} sites={sitesQuery.data ?? []} utils={utils} /></SettingsCard>`
into the grid (any position — order among cards isn't load-bearing). Import
`Image` from `lucide-react` alongside the existing icon imports
(`settings-shell.tsx:3-11`).

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes (no existing Settings tests regress)

#### Manual Verification:

- [ ] Uploading a valid PNG/JPG for the active site shows a success toast and
      the new thumbnail
- [ ] Uploading an invalid file (wrong type or >5MB) shows a clear error
      toast and does not change the stored image
- [ ] Switching the active site shows that site's own floor plan (or "none
      uploaded" state), not another site's

---

## Phase 4: Map View Page

### Overview

The page itself: navigation entry, the floor-plan canvas, the unplaced
roster, drag-and-drop placement/reposition/removal, badge-colored device
nodes, modal reuse, and failure isolation.

### Changes Required:

#### 1. Sidebar navigation entry

**File**: `src/app/_components/command-center-shell.tsx`

**Intent**: Add a third `RailLink` between the existing Dashboard and Setup
entries (per FR-013).

**Contract**: Insert a `RailLink` with `href="/map"`,
`active={pathname === "/map"}`, an appropriate `lucide-react` icon (e.g.
`Map`), and `label="Map View"`, between the two existing `RailLink` elements
at `command-center-shell.tsx:125-136`.

#### 2. Map View route + page

**File**: `src/app/map/page.tsx` (new)

**Intent**: The page shell — fetches the active site's floor-plan image path
and devices (via `device.overview` and `site.list`, both already extended in
Phase 2), renders the floor-plan image, the unplaced-roster drawer, and the
placed device nodes; owns the `selectedDevice` state that opens `DeviceModal`
exactly as `device-overview.tsx` does today.

**Contract**: Client component (`"use client"`), scoped by
`useSiteContext()`'s `activeSiteId` like every other data view in this app.
Devices with non-null `mapXPct`/`mapYPct` render as positioned nodes
(`position: absolute`, `left: ${xPct}%`, `top: ${yPct}%` within a relatively
positioned image container); devices with null position appear in the
roster. Each node's color comes from its room's `badge` (already present on
the room object `device.overview` groups it under) via the existing
`ROOM_STATUS_BADGE_CLASSES` mapping used in `room-group.tsx`.

#### 3. Drag-and-drop placement

**File**: `src/app/map/page.tsx` (or a co-located child component if the
page grows large — implementer's call)

**Intent**: Native HTML5 drag-and-drop: roster items are `draggable`; the
image container has `onDragOver` (prevent default) and `onDrop` handlers.
On drop, compute the percentage position via `dropPositionToPercent`
(Phase 2) using the image container's `getBoundingClientRect()`, then call
`device.setMapPosition`. Re-dragging an already-placed node (FR-004) uses
the same drop handler — the dragged device's id travels via
`event.dataTransfer`.

**Contract**: No code snippet needed — this follows the standard HTML5 DnD
event contract (`dragstart` sets `dataTransfer`, `drop` reads it), with
`dropPositionToPercent` as the only non-obvious piece, already specified in
Phase 2.

#### 4. Remove affordance

**File**: `src/app/map/page.tsx`

**Intent**: A small × button on each placed device node calls
`device.clearMapPosition`, returning it to the roster (FR-005) — chosen over
drag-off-canvas removal in questioning, to avoid accidental removal from an
imprecise drag.

**Contract**: Button `onClick` calls the mutation with the node's
`deviceId`, then invalidates `device.overview`.

#### 5. Click-to-open modal

**File**: `src/app/map/page.tsx`

**Intent**: Clicking a placed node opens the same `DeviceModal` used by the
list view (FR-007), with the exact same control behavior.

**Contract**: `onClick` on a node calls `setSelectedDevice(device)`; render
`<DeviceModal device={selectedDevice} rooms={rooms} utils={utils} onClose={() => setSelectedDevice(null)} />`
when non-null — identical usage to `device-overview.tsx:1091-1098`.

#### 6. Failure isolation

**File**: `src/app/map/error.tsx` (new), and an `onError` handler on the
floor-plan `<img>` in `src/app/map/page.tsx`

**Intent**: Satisfy FR-009 — a floor-plan render failure must show a visible
error state pointing to the list view, and must never affect anything
outside the `/map` route.

**Contract**: `error.tsx` follows the Next.js route-segment error boundary
convention (same shape as the existing root `src/app/error.tsx`), rendering
a message that explicitly says to use the Dashboard list view for device
control. The `<img>`'s `onError` sets a local `imageFailedToLoad` state that
swaps the floor-plan render for the same kind of message, without throwing
(a broken image shouldn't trip the error boundary — it should be handled in
place).

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` succeeds (new route compiles)

#### Manual Verification:

- [ ] A device dragged from the roster onto the floor plan persists its
      position across a page reload
- [ ] A placed device's node color matches its room's badge shown on the
      Dashboard
- [ ] Clicking a placed device opens the modal and a setpoint change there
      is reflected on the Dashboard's list view
- [ ] Re-dragging a placed device updates its position; the × button returns
      it to the roster
- [ ] Switching the active site shows only that site's devices and floor
      plan, consistent with the rest of the app
- [ ] Removing/corrupting the uploaded image file shows the Map View's error
      state, while the Dashboard's device list and valve control remain
      fully functional — confirming the FR-008/009 guardrail
- [ ] Loading `/` and `/setup` on a 375px viewport shows no Map View-related
      regression (FR-010 — the new nav entry doesn't need to render usefully
      there, but must not break the existing layout)
- [ ] Bulk operations (multi-select, sort) on the existing list/table view
      still work exactly as before (FR-011)

---

## Testing Strategy

### Unit Tests:

- `dropPositionToPercent` — in-bounds, negative-offset, and over-100-percent
  drop coordinates all clamp correctly.
- `validateFloorPlanUpload` — accepts PNG/JPG ≤5MB; rejects unsupported mime
  types; rejects oversized files; rejects missing file.

### Integration Tests:

- `device.setMapPosition` / `device.clearMapPosition` — auth gate (mirrors
  the `device.overview — auth gate` pattern in `device.test.ts`), not-found
  handling, and successful persistence against a mocked `db`.
- Extended `device.overview` / `site.list` — new fields appear in the
  returned shape without breaking existing assertions.

### Manual Testing Steps:

1. Upload a floor-plan image for a site in Settings; confirm it appears on
   `/map`.
2. Drag an unplaced device onto the image; reload the page; confirm the
   position persisted.
3. Change a room's threshold so a placed device's room badge flips to "Too
   Cold"/"Too Hot"; confirm the map node's color updates to match.
4. Click a placed device; adjust its setpoint in the modal; confirm the
   change shows on the Dashboard list view.
5. Remove a placed device via its × button; confirm it returns to the
   roster and its DB row's position columns are null.
6. Temporarily rename/delete the uploaded file on disk; reload `/map`;
   confirm the error state appears and `/` still fully controls devices.

## Performance Considerations

The floor-plan image is a single static file per site served by Next.js's
existing static file pipeline (no new serving code) — no performance work
needed beyond the existing 5MB upload cap, which keeps load time in line
with the rest of the dashboard (NFR).

## Migration Notes

Both new columns are nullable additions with no default-value backfill
required; every existing device/site row is valid immediately after the
migration (device → unplaced roster, site → no floor plan).

## References

- PRD: `context/foundation/prd.md` (v7) — `floor-plan-map-view` change
- Shape notes: `context/foundation/shape-notes.md`
- Existing badge computation: `src/server/lib/scoring.ts:15-54`
- Existing modal reuse pattern: `src/app/_components/device-modal.tsx:32-44`,
  `src/app/_components/device-overview.tsx:1091-1098`
- Existing Settings card pattern: `src/app/_components/setup/room-manager.tsx`
- Existing nav pattern: `src/app/_components/command-center-shell.tsx:125-136`
- Auth middleware scope: `src/middleware.ts:7`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & Migration

#### Automated

- [x] 1.1 Migration generates without manual edits and matches schema intent — 0866924
- [x] 1.2 `npm run typecheck` passes — 0866924
- [x] 1.3 Existing schema-dependent tests still pass: `npm run test` — 0866924

#### Manual

- [x] 1.4 Migration applies cleanly against the dev SQLite database — 0866924
- [x] 1.5 Existing devices/sites rows are unaffected — 0866924

### Phase 2: Backend API

#### Automated

- [x] 2.1 `npm run typecheck` passes — 05485d5
- [x] 2.2 `dropPositionToPercent` unit tests pass — 05485d5
- [x] 2.3 `validateFloorPlanUpload` unit tests pass — 05485d5
- [x] 2.4 New/extended router tests pass — 05485d5
- [x] 2.5 `npm run lint` passes — 05485d5

#### Manual

- [x] 2.6 Valid upload via manual fetch writes file and updates site row — 05485d5
- [x] 2.7 Invalid upload returns clear 400 and writes nothing — 05485d5

### Phase 3: Settings — Floor-Plan Upload UI

#### Automated

- [x] 3.1 `npm run typecheck` passes — e08bcd2
- [x] 3.2 `npm run lint` passes — e08bcd2
- [x] 3.3 `npm run test` passes — e08bcd2

#### Manual

- [x] 3.4 Valid upload shows success toast and new thumbnail — e08bcd2
- [x] 3.5 Invalid upload shows clear error toast, no change to stored image — e08bcd2
- [x] 3.6 Switching active site shows that site's own floor plan — e08bcd2

### Phase 4: Map View Page

#### Automated

- [x] 4.1 `npm run typecheck` passes
- [x] 4.2 `npm run lint` passes
- [x] 4.3 `npm run test` passes
- [x] 4.4 `npm run build` succeeds

#### Manual

- [x] 4.5 Dragged device position persists across reload
- [x] 4.6 Placed device node color matches its room's badge
- [x] 4.7 Click opens modal; setpoint change reflected on Dashboard
- [x] 4.8 Re-drag updates position; × button returns device to roster
- [x] 4.9 Switching active site scopes devices and floor plan correctly
- [x] 4.10 Broken image shows error state; Dashboard list/control unaffected
- [x] 4.11 375px viewport on `/` and `/setup` shows no regression
- [x] 4.12 Bulk operations on list/table view still work
