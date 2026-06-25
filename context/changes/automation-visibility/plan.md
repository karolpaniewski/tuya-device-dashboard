# Automation Visibility on Device & Room Cards Implementation Plan

## Overview

Surface existing automation-mode-targeting data — which mode(s) currently
target a room — on two read-only surfaces: the device modal's currently
disabled "Automations" tab, and a new Room modal that lists every device
in a room alongside the same targeting info and current temperature. Both
link out to the existing Settings → Modes editor rather than allowing any
inline edit. No schema change, no new tRPC procedure — this reuses
`device.overview` and `mode.list`, both already queried by
`device-overview.tsx`.

## Current State Analysis

`device-overview.tsx` already calls `api.mode.list.useQuery({ siteId })`
(line 136) to feed the existing `CcModesWidget`. `mode.list` (`mode.ts:128-173`)
returns every mode for a site with its `targets: { roomId, roomName,
targetOn }[]` — modes target whole rooms via `automationModeTargets`
(`schema.ts:324-346`), never individual devices. Nothing today maps
"this room" → "the mode(s) targeting it" anywhere outside `mode-manager.tsx`'s
own per-mode badge rendering.

`device-modal.tsx` already has a 3rd tab reserved for this: `<TabsTrigger
disabled value="automations">Automations</TabsTrigger>` (line 193), with
its content currently a placeholder: *"Automation rules are coming in a
future update."* (lines 307-313). There is no equivalent "Room card" of
any kind — `room-group.tsx` is a section header + device grid with no
detail view, `room-temperature-panel.tsx` is a chart-only widget, and
`room-sidebar.tsx` is a filter nav. The mode editor itself
(`mode-manager.tsx`) has no URL/deep-link support — `editingMode` is local
component state, only reachable by visiting `/setup` and clicking a
mode's "Edit" button.

### Key Discoveries:

- `device-overview.tsx:136` — `modeListQuery` is already fetched at the
  page level; both new surfaces can reuse this cached query instead of
  issuing a new network call.
- `device-modal.tsx:193,307-313` — the Automations tab exists, disabled,
  with a placeholder; this is the intended integration point for FR-001,
  not the compact `device-card.tsx` tile.
- `mode.ts:128-173` (`mode.list`) — already returns the exact shape
  needed (`targets: { roomId, roomName, targetOn }[]` per mode); no new
  procedure required.
- `sortable-room-group.tsx` — room drag-reorder listeners are attached
  only to a dedicated grip-handle button (`{...listeners}` on the
  `GripVertical` button), not the room header text. Making the room
  header clickable to open a modal has no drag-sensor conflict to work
  around (unlike the device card's setpoint dial, which needed a
  `data-no-dnd` escape hatch from `CardPointerSensor`).
- `src/lib/*.test.ts` (e.g. `sparkline-data.test.ts`, `dial-math.test.ts`,
  `scoring.test.ts`) — this codebase's established convention for
  unit-testing pure derivation functions extracted to `src/lib/`. The new
  room→modes filter belongs there, as a tested pure function, not inlined
  ad hoc in a component.
- `mode-manager.tsx:56-107` — mode editing is local component state with
  no URL param; a "link to the mode editor" lands on `/setup` generally,
  not a specific mode's form (confirmed acceptable scope per planning).

## Desired End State

Opening any device's modal shows, in its Automations tab, which mode(s)
target that device's room (name, on/off, schedule summary) or an explicit
empty state, plus a link to `/setup`. Clicking a room's header opens a new
Room modal listing every device in that room with the same per-device
temperature/state info, the same mode-targeting list, and a simple
grouped presentation distinguishing "modes acting on this room" from "the
devices in it." Nothing about the dashboard grid, Setup/Settings screens,
the setpoint dial, or drag-reorder behavior changes.

**Verification:** open a device whose room has 0/1/2+ modes targeting it
and confirm the Automations tab content in each case; click a room header
and confirm the Room modal renders every device with correct temp + mode
info; confirm the existing drag-to-rotate dial, device-card drag-reorder,
and room drag-reorder (via the grip handle) all still work; run
`npm run typecheck`, `npm run check`, `npm run test`, and `npm run build`.

## What We're NOT Doing

- No editing of mode membership from the device modal or Room modal — the
  link out to `/setup` is the only path to change anything (per PRD
  Non-Goals and the locked "read-only + link-out" decision).
- No deep-linking to a specific mode's edit form — the link target is
  `/setup` generally; the user selects the mode themselves, matching the
  existing entry point.
- No changes to the dashboard grid layout, overall site look, or
  Setup/Settings screens.
- No changes to the existing drag-to-rotate setpoint dial or the existing
  drag-reorder-within-room device ordering.
- No new schema, migration, or tRPC procedure — both `device.overview` and
  `mode.list` already return everything needed.
- No interactive diagram/flow-chart editor — the Secondary "flow-chart-style"
  criterion is a simple static grouping/list render, not a node-and-edge
  diagram tool.
- No click-to-open behavior added to the "Unassigned" devices group's
  header — it isn't a real room and has no modes to target it.

## Implementation Approach

Extract a single pure function, `getModesForRoom(roomId, modes)`, in
`src/lib/mode-targeting.ts`, returning the subset of a site's modes that
target a given room — each annotated with that room's specific
`targetOn` value (a mode's `targets` array can target multiple rooms with
different on/off states). Both new surfaces (the device modal's
Automations tab and the new Room modal) call this same function against
the already-fetched `modeListQuery.data`, threaded down as a new prop
rather than triggering any new query. The Room modal follows
`device-modal.tsx`'s existing `Dialog`/`DialogContent` pattern but without
the shared-layout `layoutId` morph, since there is no "room card" tile to
morph from — the room header text itself is the click target.

## Critical Implementation Details

**UX spec — no shared-layout morph for the Room modal.** Unlike
`DeviceModal`, which morphs from its originating `device-card`'s
`layoutId`, the new Room modal should use a plain `<Dialog>` (no
`layoutId`/`layoutOpen` props on `DialogContent`) — there is no equivalent
"room card" tile to morph from; the click target is the existing room
header text in `room-group.tsx`. Wiring a `layoutId` here without a
matching source element would silently do nothing (Framer Motion just
won't find a matching layout to morph from/to), so skip it entirely
rather than copying `DeviceModal`'s pattern wholesale.

## Phase 1: Device-side mode visibility

### Overview

Give the device modal's existing, disabled Automations tab real content:
which mode(s) target the device's room, an empty state when none do, and
a link to the mode editor.

### Changes Required:

#### 1. Room→modes derivation utility

**File**: `src/lib/mode-targeting.ts` (new)

**Intent**: Provide a single, tested source of truth for "which modes
target this room" so both new UI surfaces (this phase's Automations tab
and Phase 2's Room modal) compute the same answer the same way.

**Contract**: Export `getModesForRoom(roomId: string, modes:
RouterOutputs["mode"]["list"]): Array<{ id: string; name: string;
targetOn: boolean; daysOfWeek: number[] | null; fireHour: number | null;
fireMinute: number | null }>`. Filters `modes` to those whose `targets`
array contains an entry matching `roomId`, and flattens each match's
`targetOn` onto the returned item (a mode can target multiple rooms with
different on/off states — return the value for *this* room specifically,
not the mode's raw `targets` array).

#### 2. Unit tests for the derivation utility

**File**: `src/lib/mode-targeting.test.ts` (new)

**Intent**: Lock in the boundary behavior before it's consumed by two UI
surfaces.

**Contract**: Cover — a room targeted by zero modes (empty array); a room
targeted by exactly one mode; a room targeted by two modes simultaneously;
a mode that targets multiple rooms with different `targetOn` values per
room (assert the returned `targetOn` matches the room being queried, not
some other room's value); a mode that does NOT target the room in
question (excluded from the result).

#### 3. Thread mode data into the device modal

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Make the already-fetched `modeListQuery` data available to
`DeviceModal` without a new network call.

**Contract**: Where `<DeviceModal ... />` is rendered (around line 1140),
add a new prop — e.g. `modesForRoom={getModesForRoom(selectedDevice.roomId
?? "", modeListQuery.data ?? [])}` — computed from the existing
`modeListQuery` and the currently-selected device's `roomId`. If
`selectedDevice.roomId` is `null` (unassigned device), pass an empty array.

#### 4. Enable and populate the Automations tab

**File**: `src/app/_components/device-modal.tsx`

**Intent**: Replace the placeholder with real, read-only content, plus an
explicit empty state and a link to the mode editor — matching this
project's existing empty-state convention (e.g. `mode-manager.tsx`'s "No
modes yet" list state).

**Contract**: Remove `disabled` from the Automations `TabsTrigger` (line
193). Accept a new `modesForRoom` prop on `DeviceModalContent` (and
`DeviceModal`) matching the type returned by `getModesForRoom`. Render,
inside the existing `TabsContent value="automations"` block: if
`modesForRoom.length > 0`, a list of mode name + on/off + schedule summary
(reuse the existing day/time formatting helpers' logic already present in
`mode-manager.tsx`/`cc-modes-widget.tsx`); if empty and `device.roomId !==
null`, copy along the lines of "No modes target this room yet."; if
`device.roomId === null`, copy distinguishing the unassigned case (e.g.
"Assign this device to a room to see its automation modes."). In all
cases, include a `next/link` `<Link href="/setup">` to the mode editor.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run check` (Biome) passes
- `npm run test` passes, including the new `mode-targeting.test.ts` cases
- `npm run build` succeeds

#### Manual Verification:

- Opening a device whose room is targeted by one mode shows that mode's
  name, on/off state, and schedule summary in the Automations tab
- Opening a device whose room is targeted by two modes shows both,
  each with its own on/off state
- Opening a device whose room is targeted by zero modes shows the
  "no modes target this room" empty state
- Opening a device with no room assigned shows the unassigned-specific
  empty state
- The link in the Automations tab navigates to `/setup`
- The existing Overview and History tabs are unaffected

---

## Phase 2: Room modal

### Overview

Add the new "Room card" surface from the PRD: clicking a room's header
opens a modal listing every device in that room with its
temperature/state and the same mode-targeting info from Phase 1.

### Changes Required:

#### 1. New Room modal component

**File**: `src/app/_components/room-modal.tsx` (new)

**Intent**: Give the user a single place to see everything in a room —
devices, their state, and what automation targets them — without
navigating away, mirroring `device-modal.tsx`'s structure but without the
shared-layout morph (see Critical Implementation Details).

**Contract**: Props: `roomId: string`, `roomName: string`, `devices:
DeviceItem[]` (the same `RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number]`
shape device cards already use), `modesForRoom: ReturnType<typeof
getModesForRoom>`, `onClose: () => void`. Renders a `<Dialog defaultOpen
onOpenChange={...}>` with `<DialogContent>` (no `layoutId`): a header with
the room name, a "Modes acting on this room" section (reusing Phase 1's
empty-state and link-to-`/setup` pattern when empty), and a device list
showing each device's name, type, online/offline state, and current
temperature (read-only — no setpoint dial, no plug toggle; this is a
summary view, not a control surface).

#### 2. Wire room-header click-to-open

**File**: `src/app/_components/room-group.tsx`

**Intent**: Make the room header (name + count) the click target that
opens the Room modal, for real rooms only.

**Contract**: Add an optional `onHeaderClick?: () => void` prop to
`RoomGroupProps`. When present, wrap the room name `<h2>` (lines
~208-215) with a click handler and `cursor-pointer`/hover treatment
consistent with this file's existing interactive elements. No change for
the "Unassigned" group's instance, which simply won't receive this prop.

#### 3. Render the Room modal and thread mode data

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Hold the "currently open room" state and supply the Room
modal with the same derived mode data Phase 1 introduced.

**Contract**: Add `selectedRoomId` state (parallel to the existing
`selectedDevice` state). Pass `onHeaderClick={() => setSelectedRoomId(room.roomId)}`
to each real `<RoomGroup>` instance (both the `activeSiteId === "all"`
grouped-by-site branch and the single-site branch), but not to the
`Unassigned` instance. Conditionally render `<RoomModal>` near the
existing `<DeviceModal>` render, passing the matching room's `devices`,
`roomName`, and `getModesForRoom(room.roomId, modeListQuery.data ?? [])`.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run check` (Biome) passes
- `npm run test` passes
- `npm run build` succeeds

#### Manual Verification:

- Clicking a room's header opens the Room modal showing every device in
  that room with correct temperature/state
- The Room modal's mode section matches the Automations tab's content
  for any device in that same room
- Clicking the "Unassigned" group's header does nothing (no modal opens)
- The existing room drag-reorder (via the grip handle) still works
- The existing device drag-reorder-within-room still works
- The existing drag-to-rotate setpoint dial still works from the
  dashboard grid (unaffected by this phase)

---

## Phase 3: Flow-chart-style grouping (Secondary, scope-bounded)

### Overview

Address the PRD's nice-to-have Secondary criterion: present the room's
modes and devices as a simple grouped visualization, not an interactive
diagram.

### Changes Required:

#### 1. Grouped presentation inside the Room modal

**File**: `src/app/_components/room-modal.tsx`

**Intent**: Visually connect "what's acting on this room" to "what's in
this room" — satisfying the PRD's Socrates-bounded scope (a static
grouping/list render, not a node-and-edge diagram).

**Contract**: Restructure the Room modal's content (built in Phase 2) so
the modes section and the device list are presented as explicitly labeled,
visually grouped sections — e.g. a "Targeted by" heading above the modes
list, and a clear section break before the device list — rather than an
unlabeled stack. No new dependency, no canvas/SVG diagram, no
interactivity beyond what Phase 2 already has (clicking modes does
nothing new; the existing `/setup` link remains the only path to act).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run check` (Biome) passes
- `npm run test` passes
- `npm run build` succeeds

#### Manual Verification:

- The Room modal visually distinguishes "modes acting on this room" from
  "devices in this room" as two clearly separated, labeled sections
- A room with zero modes still renders a sensible, non-broken layout
  (empty state in the modes section, device list intact)

---

## Testing Strategy

### Unit Tests:

- `getModesForRoom` — zero modes, one mode, two simultaneous modes, a
  mode targeting multiple rooms with different `targetOn` per room,
  and a mode that doesn't target the room in question.

### Integration Tests:

- None planned — no new tRPC procedure or schema change exists to test;
  `device.overview` and `mode.list` are unchanged and already covered by
  `device.test.ts` / `mode.test.ts`.

### Manual Testing Steps:

1. Open a device in a room targeted by 0, 1, and 2+ modes; confirm the
   Automations tab content for each case, including the unassigned-device
   case.
2. Click each room's header on the dashboard; confirm the Room modal
   shows the correct devices, temperatures, and mode-targeting info, and
   that the "Unassigned" group's header is not clickable.
3. Confirm the link to `/setup` works from both the Automations tab and
   the Room modal.
4. Confirm the Room modal's grouped "Targeted by" / device-list sections
   render correctly for a room with modes and a room with none.
5. Confirm the existing drag-to-rotate setpoint dial, device-card
   drag-reorder, and room drag-reorder (grip handle) all still work
   unchanged.

## Performance Considerations

None beyond what already exists — both new surfaces read from
already-fetched, already-cached React Query data (`device.overview`,
`mode.list`); no new network round trip is introduced.

## Migration Notes

Not applicable — no schema or data changes.

## References

- PRD: `context/foundation/prd-v9.md` (v9) — automation-visibility change
- Stack assessment: `context/foundation/stack-assessment.md` (ready, no
  compensation needed for this change's scope)
- Existing disabled tab being enabled: `src/app/_components/device-modal.tsx:193,307-313`
- Existing mode query being reused: `src/server/api/routers/mode.ts:128-173`
- Existing query already fetched at the page level: `src/app/_components/device-overview.tsx:136`
- Existing pure-function test convention to follow: `src/lib/scoring.test.ts`, `src/lib/sparkline-data.test.ts`
- Existing modal pattern to follow (without the morph): `src/app/_components/device-modal.tsx`
- Existing empty-state convention to match: `src/app/_components/setup/mode-manager.tsx:197-208`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Device-side mode visibility

#### Automated

- [x] 1.1 `npm run typecheck` passes — 51d85c3
- [x] 1.2 `npm run check` (Biome) passes — 51d85c3
- [x] 1.3 `npm run test` passes, including the new `mode-targeting.test.ts` cases — 51d85c3
- [x] 1.4 `npm run build` succeeds — 51d85c3

#### Manual

- [x] 1.5 Device in a room targeted by one mode shows that mode's name, on/off, and schedule in the Automations tab — 51d85c3
- [x] 1.6 Device in a room targeted by two modes shows both, each with its own on/off state — 51d85c3
- [x] 1.7 Device in a room targeted by zero modes shows the empty state — 51d85c3
- [x] 1.8 Device with no room assigned shows the unassigned-specific empty state — 51d85c3
- [x] 1.9 Automations tab link navigates to `/setup` — 51d85c3
- [x] 1.10 Existing Overview and History tabs unaffected — 51d85c3

### Phase 2: Room modal

#### Automated

- [x] 2.1 `npm run typecheck` passes
- [x] 2.2 `npm run check` (Biome) passes
- [x] 2.3 `npm run test` passes
- [x] 2.4 `npm run build` succeeds

#### Manual

- [x] 2.5 Clicking a room's header opens the Room modal with correct devices/temperature/state
- [x] 2.6 Room modal's mode section matches the Automations tab for a device in that room
- [x] 2.7 Clicking the "Unassigned" group's header does nothing
- [x] 2.8 Existing room drag-reorder (grip handle) still works
- [x] 2.9 Existing device drag-reorder-within-room still works
- [x] 2.10 Existing drag-to-rotate setpoint dial still works on the dashboard grid

### Phase 3: Flow-chart-style grouping (Secondary, scope-bounded)

#### Automated

- [ ] 3.1 `npm run typecheck` passes
- [ ] 3.2 `npm run check` (Biome) passes
- [ ] 3.3 `npm run test` passes
- [ ] 3.4 `npm run build` succeeds

#### Manual

- [ ] 3.5 Room modal visually distinguishes "modes acting on this room" from "devices in this room"
- [ ] 3.6 A room with zero modes still renders a sensible, non-broken layout
