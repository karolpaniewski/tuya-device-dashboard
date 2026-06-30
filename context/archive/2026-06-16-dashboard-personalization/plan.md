# Dashboard Personalization (Drag-and-Drop Widgets + Room Order) Implementation Plan

## Overview

Let the dashboard be rearranged: the 6 summary regions (4 KPI stat cards, the
"By Room" donut, the `RoomTemperaturePanel`) become independently
reorderable/hideable widgets, and room groups in the device list become
drag-to-reorder. Both are persisted in one new DB-backed layout row, separate
from the existing per-device `sortOrder` mechanism.

## Current State Analysis

`src/app/_components/device-overview.tsx` is a single 637-line component.
Its "KPI Row" (lines 342-451) is a fused block: 4 stat cards rendered from a
literal array `.map()`, plus a 5th inline donut-chart card — none are
independently addressable. `RoomTemperaturePanel` (454-456) is already its
own component, just not reorderable/hideable. Room groups render via
`groupBySite` (65-74) when `activeSiteId === "all"`, or a flat
`filteredRooms.map(RoomGroup)` for a single site (557-604) — room order today
is whatever order `room.list`'s `.orderBy(rooms.createdAt)` returns
(`src/server/api/routers/room.ts:~25-26`), with no stored position.

The existing device-level drag-and-drop (`DndContext` at 551-622,
`SortableDeviceCard`, `useDroppable` in `room-group.tsx:77`) is the only DnD
precedent in the app: one `PointerSensor` (8px activation), `closestCorners`
collision detection, optimistic local state synced from server data, disabled
via `dndEnabled = activeFilterCount === 0` (line 321) whenever a filter
narrows the visible set.

There is no per-user identity to scope a preference by (see
`context/changes/dashboard-personalization/frame.md` — single shared admin
login, no adapter, no registration flow) and no existing "settings" table.
The closest existing precedents for "let the user customize their view" are
both client-side and account-agnostic: theme via `next-themes` →
`localStorage` (`src/app/layout.tsx:41-46`) and the active-site selector via a
plain `document.cookie` write (`src/components/site-context.tsx:24-47`).

## Desired End State

A logged-in user can drag any of the 6 summary widgets into a new order, hide
any of them (and bring a hidden one back), and drag room groups into a custom
order — both within "All sites" view (per-site sections) and a single-site
view. The arrangement survives reloads, browser restarts, and different
devices/browsers under the one shared login, because it's stored in a DB row
rather than client storage. Verify by: rearranging widgets/rooms, reloading
the page, and confirming the same arrangement reappears; opening the app in a
second browser and confirming the same arrangement appears there too.

### Key Discoveries:

- `src/server/db/schema.ts:223-224` — `automationRules.daysOfWeek` already
  stores a JSON array as a plain `text` column (`"[1,2,3,4,5]"`), parsed by
  hand at the router boundary. This is the established JSON-in-SQLite-text
  convention to mirror — no Drizzle `mode: "json"` column type is used
  anywhere in this schema.
- `src/server/db/seed.ts:28-37` — `onConflictDoUpdate({ target: users.email,
... })` is the established upsert pattern for a single, known-identity row.
  The new layout row uses the same shape with a fixed `id: "default"` instead
  of an email.
- `src/app/_components/device-overview.tsx:65-74` — `groupBySite` already
  partitions a flat room array by `siteName` at render time. A single global
  room-order list, applied *before* this partitioning, naturally produces a
  correctly-ordered result within each partition without needing per-site
  storage.

## What We're NOT Doing

- No `userId` column or per-account scoping anywhere (see frame brief —
  there is exactly one shared login; this would be dead weight).
- No drag-and-drop for the "Unassigned" device group — it isn't backed by a
  real `rooms` row and stays pinned last, exactly as today.
- No per-site independent room order — one global order list, applied within
  whichever grouping is currently rendered (per user's explicit choice).
- No "Customize mode" toggle — drag handles and hide controls are always
  visible (per user's explicit choice), not gated behind an edit mode.
- No filter-based guard on room dragging — unlike the existing device DnD,
  room reordering stays enabled regardless of `activeFilterCount` (per user's
  explicit choice).
- No change to the existing device-level DnD, its `sortOrder` column, or its
  `dndEnabled` guard — this plan adds two new, independent DnD layers
  alongside it, not a replacement.

## Implementation Approach

One new singleton table (`dashboard_layout`, a single row keyed by a fixed
`id: "default"`) holds three JSON-text columns: `widgetOrder`,
`hiddenWidgets`, `roomOrder`. A new `dashboardLayout` tRPC router exposes
`get` (returns the row, or an all-defaults shape if the table is still empty)
and `save` (upserts the full row). A shared pure function,
`applySavedOrder(items, order, getId)`, sorts any list by a saved id-order
array, appending unrecognized items at the end in their existing relative
order — this covers both "a widget that doesn't exist yet" and "a room
created after the layout was last saved."

Two new, independent `DndContext` trees are added to `device-overview.tsx`
(widgets and rooms), separate from the existing device-card `DndContext`.
They don't interact with each other or with the existing one — dnd-kit
supports multiple sibling `DndContext`s with their own sensors/state.

## Phase 1: Persistence layer

### Overview

Add the `dashboard_layout` table, the `dashboardLayout` tRPC router, and the
shared `applySavedOrder` ordering utility. No UI changes yet.

### Changes Required:

#### 1. Schema

**File**: `src/server/db/schema.ts`

**Intent**: Add the singleton layout table, mirroring the existing JSON-in-text
convention (`automationRules.daysOfWeek`) rather than introducing a new
Drizzle column mode.

**Contract**: New `dashboardLayout` table: `id` (text PK, no `$defaultFn` —
the router always writes the literal string `"default"`), `widgetOrder`
(text, JSON array of widget id strings), `hiddenWidgets` (text, JSON array,
default `"[]"`), `roomOrder` (text, JSON array, default `"[]"`), `updatedAt`
(`$onUpdate`). No foreign keys — this table has no relationship to any other
entity.

#### 2. Migration

**File**: drizzle-generated migration (via `npm run db:generate` / the
project's existing Drizzle workflow)

**Intent**: Apply the new table to the SQLite database.

**Contract**: Standard `CREATE TABLE` migration, no data backfill needed
(table starts empty; `get` handles the empty case).

#### 3. Shared ordering utility

**File**: `src/lib/layout-order.ts` (new)

**Intent**: One pure function used by both the widget and room reorder UIs to
apply a saved id-order to a live list, tolerating ids that don't exist in the
saved order (new items) and ids in the saved order that no longer exist
(deleted items — silently dropped).

**Contract**: `applySavedOrder<T>(items: T[], order: string[], getId: (item: T) => string): T[]`
— items whose id appears in `order` come first, sorted by their index in
`order`; items not in `order` are appended afterward in their original
relative order.

#### 4. tRPC router

**File**: `src/server/api/routers/dashboard-layout.ts` (new), registered in
`src/server/api/root.ts`

**Intent**: Read and persist the singleton layout row.

**Contract**: `dashboardLayout.get` — `protectedProcedure` query, no input;
returns `{ widgetOrder: string[], hiddenWidgets: string[], roomOrder: string[] }`,
parsed from the stored row, or an all-defaults shape (full widget id list in
default order, no hidden widgets, empty room order) when no row exists yet.
`dashboardLayout.save` — `protectedProcedure` mutation, input
`{ widgetOrder: z.array(z.string()), hiddenWidgets: z.array(z.string()),
roomOrder: z.array(z.string()) }`; upserts the row at `id: "default"` via
`onConflictDoUpdate`, mirroring `seed.ts:28-37`'s upsert shape.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- New router unit tests pass: `npm run test -- dashboard-layout`
- `applySavedOrder` unit tests pass (new/deleted/empty-order cases)

#### Manual Verification:

- After migration, the app still boots and the dashboard renders unchanged (no row exists yet, defaults apply silently)

---

## Phase 2: Widget reorder + hide/restore

### Overview

Split the fused KPI-row + donut block into 6 independently addressable
widgets, add drag-and-drop reordering and hide/restore, wired to the
persistence layer from Phase 1.

### Changes Required:

#### 1. Extract a presentational stat-card component

**File**: `src/app/_components/kpi-card.tsx` (new)

**Intent**: Pull the inline stat-card markup (icon/label/sub/value) out of
the literal-array `.map()` in `device-overview.tsx:357-400` into a reusable
component, so each of the 4 stats becomes independently referenceable by a
stable widget id.

**Contract**: `KpiCard({ icon, label, sub, value }: { ... })` — same visual
output as today's inline card.

#### 2. Drag wrapper for widgets

**File**: `src/app/_components/sortable-widget.tsx` (new)

**Intent**: Mirror `sortable-device-card.tsx`'s `useSortable` wrapper, but for
arbitrary widget children, plus a small always-visible hide ("×") control in
the corner that calls back to the parent rather than mutating any local state
itself.

**Contract**: `SortableWidget({ id, onHide, children }: { id: string; onHide:
() => void; children: ReactNode })`.

> Addendum (post-Phase-2 review): the implementation also accepts an optional
> `className` prop, passed through to the wrapper `div`. Needed so the
> room-temp-panel widget can apply `col-span-full` — without it, that widget
> gets squeezed into a single grid cell like a KPI card instead of spanning
> the row. Narrow, deliberate extension of the contract above.

#### 3. Widget registry + reordering in the overview

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Replace the fused "KPI Row" block (342-451) with: a
`WIDGET_DEFINITIONS` list of the 6 `{ id, label, render }` entries (4
`KpiCard`s, the existing donut JSX, `RoomTemperaturePanel`); fetch
`api.dashboardLayout.get`; compute the effective visible/ordered widget list
via `applySavedOrder` minus anything in `hiddenWidgets`; render each through
`SortableWidget` inside a new, independent `DndContext`/`SortableContext`
(`rectSortingStrategy`, matching the existing device-grid choice in
`room-group.tsx:92`); on drag end, optimistically reorder local state and
call `dashboardLayout.save`; on a widget's hide click, remove it from the
visible set, add its id to `hiddenWidgets`, and persist the same way.

**Contract**: Add a small always-visible affordance near the widget row (a
"+N hidden" pill, or similar) listing currently-hidden widget labels by name,
each clickable to restore it (removes from `hiddenWidgets`, re-inserts into
`widgetOrder` at the end, persists). This is required for hidden widgets to
ever become visible again, since there is no separate edit mode (per the
"always visible controls" decision) — the restore affordance must exist
outside of any mode toggle.

#### 4. Optional reset

**File**: `src/app/_components/device-overview.tsx`

**Intent**: A small "Reset layout" action near the widget row that clears
both `widgetOrder` (back to default) and `hiddenWidgets` (back to `[]`) via
`dashboardLayout.save` — once hide/reorder exists, users need an escape hatch
back to the default arrangement.

**Contract**: A single button; no confirmation dialog needed (low-stakes,
reversible by just rearranging again).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Existing device-overview-adjacent tests still pass: `npm run test`

#### Manual Verification:

- Drag a KPI card to a new position; reload the page; confirm the new order persists
- Hide a widget; confirm it disappears and the "hidden" affordance lists it; click to restore it; confirm it reappears in its prior position
- Click "Reset layout"; confirm all 6 widgets reappear in original order
- Confirm the existing device-card drag-and-drop (within/between rooms) still works unaffected

---

## Phase 3: Room reorder

### Overview

Add drag-and-drop reordering of room groups, using one global saved order
applied within whichever grouping (per-site sections, or a flat single-site
list) is currently rendered. Independent of the existing device DnD and its
filter guard.

### Changes Required:

#### 1. Drag wrapper for room groups

**File**: `src/app/_components/sortable-room-group.tsx` (new)

**Intent**: Mirror `sortable-device-card.tsx`'s `useSortable` wrapper around
a `RoomGroup` (and its enclosing heading when inside a `SiteSection`), so the
whole room block — not an inner device — is the drag source.

**Contract**: `SortableRoomGroup({ roomId, children }: { roomId: string;
children: ReactNode })`.

#### 2. Room-order DnD in the overview

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Add a second, independent `DndContext` (own sensors, own
`activeId` state) wrapping the room-rendering block (557-614). Before
grouping/rendering, apply `applySavedOrder(filteredRooms, layout.roomOrder,
r => r.roomId)` to get the globally-ordered room list; pass that into
`groupBySite` (when `activeSiteId === "all"`) or render it directly (single
site) exactly as today, just pre-sorted. Wrap each rendered `RoomGroup` (and
its `SiteSection` siblings, where applicable) in `SortableContext` +
`SortableRoomGroup`, scoped per visible section (each `SiteSection`'s rooms
form their own `SortableContext`; the single-site view is one
`SortableContext` over all rendered rooms).

**Contract**: On drag end within a section, compute the new order for just
that section's room ids (`arrayMove` on the visible sub-list, mirroring
`device-overview.tsx:171-174`'s existing reorder math), then splice that
updated sub-sequence back into the *full* saved `roomOrder` array — replacing
only the positions previously held by that section's room ids, leaving every
other room's relative position untouched — and persist via
`dashboardLayout.save`. This splice-back step is the one non-obvious part:
naively replacing the whole `roomOrder` with just the visible section's order
would silently drop every room not currently visible (e.g. rooms belonging
to other sites, or rooms hidden by an active room/type/status filter).

**Contract**: No `dndEnabled`-style filter guard — this `DndContext` stays
enabled regardless of `activeFilterCount` (per user's explicit choice); it
does not read or depend on that variable at all.

> Addendum (implementation-time, user-approved "Adapt and continue"): "a
> second, independent `DndContext`" above is not achievable with dnd-kit —
> `useSortable`/`useDroppable` resolve to the *nearest ancestor* `DndContext`,
> and the room-level hooks must wrap `RoomGroup`, which contains the
> device-level hooks (a single shared `DndContext` spanning all rooms, needed
> for cross-room device moves). Two nested, independent `DndContext`s cannot
> both be "nearest ancestor" for two different descendant hook sets in that
> arrangement. Implemented instead as the standard dnd-kit nested-sortables
> pattern: **one shared `DndContext`** (the existing device-level one, reused
> unchanged — same `sensors`/`closestCorners`), multiple nested
> `SortableContext`s (rooms within sites, devices within rooms — fully
> supported), and a single `onDragEnd` that dispatches on whether the dragged
> id belongs to `orderedRooms` (room reorder) or not (existing device-move
> logic). The functional intent — splice-back persistence, no filter guard on
> room dragging, no interference between room and device drags — is
> unchanged; only the literal "two independent `DndContext`s" mechanism
> differs. One follow-up fix during verification: the room-reorder branch
> must resolve `over` back to its containing room id when it lands on a
> device card nested inside that room (`closestCorners` considers every
> sortable in the shared context, not just rooms) — done via the same
> `findContainer` helper already used for device moves.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- `applySavedOrder` + splice-back logic covered by unit tests (room not in
  any visible section is preserved untouched after a same-section reorder)

#### Manual Verification:

- In "All sites" view, drag a room within one site's section to a new position; reload; confirm it persists and other sites' room order is untouched
- Switch to a single-site view; confirm that site's rooms reflect the same saved order
- Apply a type/status filter; confirm room dragging still works (no guard) while device-card dragging within a room is disabled, exactly as today
- Confirm dragging a room produces no interference with dragging a device card (the two `DndContext`s operate independently)

---

## Testing Strategy

### Unit Tests:

- `applySavedOrder`: known order, unknown items appended, empty order,
  duplicate-safety (not expected to occur, but shouldn't crash)
- `dashboardLayout` router: `get` returns defaults on empty table, `save`
  upserts and a subsequent `get` reflects it, input validation rejects
  malformed payloads

### Integration Tests:

- None beyond the router tests above — no end-to-end test harness exists in
  this repo (manual verification covers the UI layer, consistent with how
  prior DnD/UI slices in this codebase were verified)

### Manual Testing Steps:

1. Reorder widgets, reload, confirm persistence
2. Hide and restore a widget
3. Reset layout back to defaults
4. Reorder rooms within a site section in "All sites" view, reload, confirm
5. Confirm single-site view reflects the same room order
6. Confirm room dragging is unaffected by active filters; device dragging
   remains correctly disabled under filters as before
7. Open a second browser (or incognito window) logged in with the same
   shared credentials, confirm the same layout appears

## Migration Notes

The new table starts empty; `dashboardLayout.get` returns an all-defaults
shape until the first `save`. No backfill of existing data is needed —
nothing in the current schema represents a "previous" layout to migrate from.

## References

- Frame brief: `context/changes/dashboard-personalization/frame.md`
- Existing DnD precedent: `src/app/_components/device-overview.tsx:106-245`,
  `src/app/_components/sortable-device-card.tsx`,
  `src/app/_components/room-group.tsx:77-111`
- JSON-in-text precedent: `src/server/db/schema.ts:223-224`
- Singleton upsert precedent: `src/server/db/seed.ts:28-37`
- Client-side preference precedents: `src/app/layout.tsx:41-46`,
  `src/components/site-context.tsx:24-47`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Persistence layer

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 0bc9ffc
- [x] 1.2 Linting passes: `npm run lint` — 0bc9ffc
- [x] 1.3 New router unit tests pass: `npm run test -- dashboard-layout` — 0bc9ffc
- [x] 1.4 `applySavedOrder` unit tests pass (new/deleted/empty-order cases) — 0bc9ffc

#### Manual

- [x] 1.5 After migration, the app still boots and the dashboard renders unchanged (no row exists yet, defaults apply silently) — 0bc9ffc

### Phase 2: Widget reorder + hide/restore

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 5a7e6f2
- [x] 2.2 Linting passes: `npm run lint` — 5a7e6f2
- [x] 2.3 Existing device-overview-adjacent tests still pass: `npm run test` — 5a7e6f2

#### Manual

- [x] 2.4 Drag a KPI card to a new position; reload the page; confirm the new order persists — 5a7e6f2
- [x] 2.5 Hide a widget; confirm it disappears and the "hidden" affordance lists it; click to restore it; confirm it reappears in its prior position — 5a7e6f2
- [x] 2.6 Click "Reset layout"; confirm all 6 widgets reappear in original order — 5a7e6f2
- [x] 2.7 Confirm the existing device-card drag-and-drop (within/between rooms) still works unaffected — 5a7e6f2

### Phase 3: Room reorder

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck` — c9ae5c4
- [x] 3.2 Linting passes: `npm run lint` — c9ae5c4
- [x] 3.3 `applySavedOrder` + splice-back logic covered by unit tests (room not in any visible section is preserved untouched after a same-section reorder) — c9ae5c4

#### Manual

- [x] 3.4 In "All sites" view, drag a room within one site's section to a new position; reload; confirm it persists and other sites' room order is untouched — c9ae5c4
- [x] 3.5 Switch to a single-site view; confirm that site's rooms reflect the same saved order — c9ae5c4
- [x] 3.6 Apply a type/status filter; confirm room dragging still works (no guard) while device-card dragging within a room is disabled, exactly as today — c9ae5c4
- [x] 3.7 Confirm dragging a room produces no interference with dragging a device card (the two `DndContext`s operate independently) — c9ae5c4
