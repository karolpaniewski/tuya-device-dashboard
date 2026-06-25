# Automation Flow — Live Data Implementation Plan

## Overview

Turn the standalone `/automation-flow` demo (hardcoded Door Sensor/Lamp/TV mock)
into a real feature: a room selector that respects the app's active-site
context, a node-and-edge diagram showing the selected room's actual devices
and the real automation modes targeting it (Mode → Room → Device, three
tiers), and clicks that open the existing `DeviceModal`/`RoomModal` or
navigate to `/setup` — exactly as a user would expect from the rest of this
dashboard.

## Current State Analysis

`src/app/_components/automation-flow/tuya-automation-flow.tsx` holds
hardcoded `initialNodes`/`initialEdges` mock arrays and feeds them straight
into `useNodesState`/`useEdgesState` — no tRPC query, no props in.
`device-node.tsx`'s `DeviceNodeData` uses demo-only vocabulary
(`DeviceKind = "doorSensor"|"lamp"|"smartPlug"`, `DeviceRole =
"trigger"|"action"`) that doesn't map onto the real domain. `onNodeClick`
only does `console.info`. `page.tsx` is a server component with a static
"Living Room" header and zero data fetching.

The real domain has no device-to-device trigger relationship anywhere —
`automationModeTargets` links a mode to a **room** with an on/off intent,
never to individual devices. `mode-control.ts`'s `applyModeToRooms` confirms
a fired mode only ever commands **valve** devices in the room; sensors and
plugs are never touched. `device.overview`'s room list only includes rooms
that have at least one device (built from a `devices LEFT JOIN
deviceRoomAssignments LEFT JOIN rooms`, grouped only when a device row
exists). There is no graph-layout library in this project (no
dagre/elkjs/d3), and the demo's three fixed node positions don't generalize
to a variable device count.

### Key Discoveries:

- `src/lib/mode-targeting.ts` (`getModesForRoom`, `formatModeSchedule`) —
  already does exactly "which modes target this room, with that room's
  `targetOn` and formatted schedule" — reused as-is, zero changes.
- `src/server/lib/mode-control.ts:18-85` — confirms modes only ever command
  valve devices; informs the Mode→Room-only automation-edge decision below.
- `src/app/_components/device-card.tsx:18-34` — `TYPE_ICON`/`TYPE_ACCENT`
  per-device-type icon and color convention (Thermometer/Gauge/Plug,
  cyan/amber/emerald), reused for the new device node's icon treatment.
- `src/app/_components/device-overview.tsx` (this same change line,
  `automation-visibility`) — `selectedDevice`/`selectedRoomId` state plus
  conditional `DeviceModal`/`RoomModal` render is the exact pattern this
  page's node-click wiring mirrors.
- `src/app/_components/filter-bar.tsx:141-166` — the compact `Select`-based
  room dropdown is the pattern for this page's room selector (not the full
  `RoomSidebar` nav, which is built for a persistent multi-section dashboard).
- `context/foundation/lessons.md` — Base UI `Select` needs an explicit
  `items` prop whenever its initial value can be non-empty on first render;
  applies directly since the room selector defaults to a non-empty value
  (the auto-selected first room).

## Desired End State

Opening `/automation-flow` shows the active site's rooms in a selector,
defaulting to the first room (alphabetical) with no extra click required.
The diagram shows that room's real devices (name, type icon, online/offline
state) and the real modes targeting it (name, ON/OFF, schedule), laid out as
mode nodes on the left, the room node in the center, device nodes on the
right. Clicking a device node opens the existing `DeviceModal`; clicking the
room node opens the existing `RoomModal`; clicking a mode node navigates to
`/setup`. Switching rooms or sites updates the diagram with fresh data every
30 seconds, without resetting any node the user has manually dragged.

**Verification**: pick a room with 0, 1, and 2+ modes targeting it and
confirm the diagram matches the Automations tab for any device in that room;
switch the active site and confirm the room selector and diagram both
update; drag a node, wait for a live-data refresh, confirm it stays put;
click each of the three node types and confirm the right modal/navigation
happens; run `npm run typecheck`, `npm run check`, `npm run test`, and
`npm run build`.

## What We're NOT Doing

- No editing of mode membership, device assignment, or mode schedules from
  this page — `DeviceModal`'s reused room-reassignment control is the one
  exception (it comes along "for free" by reusing the modal as-is; this
  page does not add any new editing surface of its own).
- No new tRPC procedure or schema change — `device.overview`, `mode.list`,
  and `room.list` already return everything needed.
- No graph-layout library — a small computed column layout replaces it.
- No changes to the existing Room modal's grouped-list design from
  `automation-visibility`, the dashboard grid, or any other page. This
  remains a separate, additive page.
- No multi-room view — exactly one room is diagrammed at a time, per the
  room selector.

## Implementation Approach

A new pure function, `computeAutomationFlowLayout`, replaces the demo's
hardcoded positions with deterministic column placement for any mode/device
count. Three node components — `ModeNode`, `RoomNode`, and a rebuilt
`DeviceNode` — render real data shapes instead of mock ones, sharing the
existing card chrome (white/90 glass, `rounded-xl`, `shadow-sm`/`shadow-md`
hover) for visual consistency. `tuya-automation-flow.tsx` becomes
self-contained: it reads `useSiteContext`, fetches `device.overview`/
`mode.list`/`room.list` itself, holds the room-selection and modal-open
state, and computes nodes/edges from live data via `useMemo`, merging into
existing `useNodesState` state so in-progress drags survive the 30s poll.

## Critical Implementation Details

**State sequencing — preserving drag position across refetches.** The
diagram's nodes must be derived from live, polling query data, but the page
also lets the user freely drag nodes. If the `nodes` state were naively
replaced with a freshly recomputed array on every refetch, any in-progress
drag would silently snap back to the computed layout position the next time
the 30s poll lands. The fix: keep `nodes` in `useNodesState`, and when new
query data produces a new computed node list, merge it — for each computed
node, reuse the **existing** node's `position` if a node with that `id` is
already present in state (only `data` changes on a refetch), and apply the
freshly computed `position` only for `id`s that are new to the current state
(first paint for the room, or a device that just appeared). Switching
`viewedRoomId` is the one case that fully replaces state with freshly
computed positions, since a previous room's layout has no spatial meaning
for a different room's nodes.

**UX spec — automation edges vs. containment edges.** Per the locked
decision that Mode→Room is the only edge implying automation (devices a mode
doesn't actually command, like sensors/plugs, must not look automated):
Mode→Room edges are `animated: true`, carry an arrow marker, and a label
(mode name, ON/OFF, schedule) — visually identical treatment to the existing
demo's edges. Room→Device edges are plain containment: `animated: false`,
no label, a lighter/thinner stroke, no arrow marker. The two edge kinds must
look visibly different so a glance at the diagram never implies a mode
controls a device it doesn't.

## Phase 1: Layout utility + new node types

### Overview

Build and unit-test the column-layout function, and rebuild the three node
components around real data shapes. Nothing is wired to a query or rendered
in the running page yet — this phase is automated-verification only.

### Changes Required:

#### 1. Column layout utility

**File**: `src/lib/automation-flow-layout.ts` (new)

**Intent**: Provide a single, tested source of truth for "where does each
node go" given a variable mode/device count, replacing the demo's hardcoded
positions.

**Contract**: Export `computeAutomationFlowLayout(modeCount: number,
deviceCount: number): { room: { x: number; y: number }; modes: { x: number;
y: number }[]; devices: { x: number; y: number }[] }`. Constants: `MODE_X =
0`, `ROOM_X = 340`, `DEVICE_X = 680`, `VERTICAL_GAP = 100`, room fixed at
`y = 0`. For a column of `n` items, the first item's `y` is
`-((n - 1) * VERTICAL_GAP) / 2` and item `i`'s `y` is `firstY + i *
VERTICAL_GAP` — i.e. each column is independently centered on the room's
fixed `y = 0`, regardless of the other column's length. `n = 0` produces an
empty array for that column with no division-by-zero risk (the loop simply
doesn't run).

#### 2. Unit tests for the layout utility

**File**: `src/lib/automation-flow-layout.test.ts` (new)

**Intent**: Lock in the centering math before three node types depend on it.

**Contract**: Cover — zero modes and zero devices (degenerate, both columns
empty); one mode and one device (trivial centering); an even-length column
(e.g. 4 devices) and an odd-length column (e.g. 3 modes) both centering
symmetrically around `y = 0`; mismatched column lengths (e.g. 3 modes, 1
device) confirming each column centers independently and the room's
position never changes with column length.

#### 3. Mode node component

**File**: `src/app/_components/automation-flow/mode-node.tsx` (new)

**Intent**: Render a targeting mode's name, on/off state, and schedule as a
node, reusing `formatModeSchedule` and the same card visual language as the
existing device node.

**Contract**: Export `ModeFlowNode = Node<{ mode: ModeTargetingRoom },
"mode">` (importing `ModeTargetingRoom` from `~/lib/mode-targeting`) and
`ModeNode(props: NodeProps<ModeFlowNode>)`. Renders mode name, an ON/OFF
`Badge` (reusing the variant convention from `device-modal.tsx`'s
Automations tab), and `formatModeSchedule(mode)`. One `Handle` (`source`,
`Position.Right`) — mode nodes only ever point into the room.

#### 4. Room node component

**File**: `src/app/_components/automation-flow/room-node.tsx` (new)

**Intent**: Render the selected room as the diagram's central node.

**Contract**: Export `RoomFlowNode = Node<{ roomName: string; deviceCount:
number }, "room">` and `RoomNode(props: NodeProps<RoomFlowNode>)`. Renders
the room name and device count, visually distinguished from device/mode
nodes (e.g. a darker/emphasized card) to read as the diagram's anchor. Two
`Handle`s: `target` on `Position.Left` (from modes), `source` on
`Position.Right` (to devices).

#### 5. Device node component (rewrite)

**File**: `src/app/_components/automation-flow/device-node.tsx` (rewrite)

**Intent**: Replace the demo's `doorSensor`/`lamp`/`smartPlug` vocabulary
with the real `DeviceItem` shape, at a minimal display density (full detail
lives in the modal opened on click).

**Contract**: Remove `DeviceKind`, `DeviceRole`, and the old
`DeviceNodeData`. Export `DeviceFlowNode = Node<{ device: DeviceItem },
"device">` (`DeviceItem = RouterOutputs["device"]["overview"]["rooms"]
[number]["devices"][number]`) and `DeviceNode(props:
NodeProps<DeviceFlowNode>)`. Renders the device-type icon and accent color
(reusing `device-card.tsx`'s `TYPE_ICON`/`TYPE_ACCENT` convention, adapted to
the white card's light theme), device name, and an online/offline status dot
(reusing `device-card.tsx`'s green/red dot colors and glow). No
temperature, setpoint, or plug-toggle controls — those stay in the modal.
One `Handle` (`target`, `Position.Left`).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run check` (Biome) passes
- `npm run test` passes, including the new `automation-flow-layout.test.ts` cases
- `npm run build` succeeds

---

## Phase 2: Real data wiring + room selector

### Overview

Replace the demo's mock arrays with real `device.overview`/`mode.list`
data, add the room selector and site-context integration, and make the
diagram live-polling without disturbing dragged node positions. Node clicks
stay at today's `console.info` placeholder — Phase 3 upgrades them.

### Changes Required:

#### 1. Self-contained data + room-selection state

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx` (rewrite)

**Intent**: Make this component the entire client-side feature — own its
data fetching, room selection, and layout computation — rather than taking
mock arrays.

**Contract**: Read `activeSiteId` from `useSiteContext()`. Fetch
`api.device.overview.useQuery({ siteId: activeSiteId }, { refetchInterval:
30_000, refetchIntervalInBackground: false })`, `api.mode.list.useQuery({
siteId: activeSiteId })`, and `api.room.list.useQuery({ siteId:
activeSiteId })` (the last one only to satisfy `DeviceModal`'s `rooms` prop
in Phase 3). Sort `overviewQuery.data?.rooms ?? []` by `roomName`
(`localeCompare`) for both the selector's option order and "first room"
selection. Hold `viewedRoomId: string | null` state; a `useEffect` sets it
to the first sorted room's `roomId` whenever the current value is `null` or
no longer present in the sorted list (covers first load and site switches).
Compute `modesForRoom = getModesForRoom(viewedRoomId, modeListQuery.data ??
[])` and `nodeCounts = { modeCount: modesForRoom.length, deviceCount:
viewedRoom?.devices.length ?? 0 }`, feed both into
`computeAutomationFlowLayout`. Build the full `nodes`/`edges` arrays via
`useMemo`, then merge into `useNodesState`'s state per the drag-preservation
rule in Critical Implementation Details (full reset only when
`viewedRoomId` itself changes). Mode→Room edges: `animated: true`, labeled,
arrow marker. Room→Device edges: `animated: false`, no label, lighter
stroke, no arrow marker. Render a loading skeleton while
`overviewQuery.isLoading`, an `ErrorMessage` on `overviewQuery.error`, and an
empty-state message if the site has zero rooms with devices.

#### 2. Room selector control

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx` (same file)

**Intent**: Let the user pick which room the diagram shows, following this
app's existing compact-dropdown convention rather than the full sidebar nav.

**Contract**: A `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` block
(matching `filter-bar.tsx:141-166`'s pattern) above the diagram canvas, with
an explicit `items` prop (per the `lessons.md` `Select` gotcha — the value
is non-empty by default). Option label is `room.roomName` when
`activeSiteId !== "all"`, or `"${room.roomName} — ${room.siteName}"` when
viewing all sites (disambiguates same-named rooms across sites).
`onValueChange` sets `viewedRoomId` directly (no "all" sentinel needed here
— always exactly one room is viewed).

#### 3. Page-level prefetch

**File**: `src/app/automation-flow/page.tsx` (rewrite)

**Intent**: Match the SSR-prefetch convention every other data-driven page
in this app already uses, instead of a cold client-side fetch on mount.

**Contract**: Follow `src/app/map/page.tsx`'s exact pattern — read the
`tuya-active-site` cookie for the initial `siteId`, `void
api.device.overview.prefetch({ siteId })`, `void api.mode.list.prefetch({
siteId })`, `void api.room.list.prefetch({ siteId })`, wrap
`<TuyaAutomationFlow />` in `<HydrateClient>`. Replace the static "Living
Room" header text with a generic title (the room name is now dynamic and
shown by the selector itself).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run check` (Biome) passes
- `npm run test` passes
- `npm run build` succeeds

#### Manual Verification:

- Opening `/automation-flow` shows a room selector populated with the
  active site's rooms, defaulting to the first room (alphabetical) with no
  click required
- Switching rooms in the selector updates the diagram to that room's real
  devices and modes
- Switching the active site (nav switcher) updates the selector's options
  and re-selects a valid default room
- Device nodes show the correct icon, name, and online/offline dot matching
  that device's real state
- Mode nodes show the correct name, ON/OFF badge, and schedule text,
  matching the Automations tab for a device in the same room
- A room with zero modes targeting it shows just the Room and Device nodes,
  no errors
- Dragging a node, then waiting through one 30-second live-data refresh,
  confirms the dragged node does not snap back to its computed position
- Mode→Room edges are visually animated/labeled; Room→Device edges are
  visually plain — the two are clearly distinguishable

---

## Phase 3: Node-click integration

### Overview

Replace the `console.info`-only click handler with real interactions:
device nodes open `DeviceModal`, the room node opens `RoomModal`, mode nodes
navigate to `/setup`.

### Changes Required:

#### 1. Wire node clicks to modals and navigation

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx` (same file)

**Intent**: Reuse the exact modal components and state pattern
`device-overview.tsx` already established, rather than building new detail
UI for this page.

**Contract**: Hold `selectedDevice: DeviceItem | null` and
`isRoomModalOpen: boolean` state (the viewed room is already known via
`viewedRoomId`, so the room modal needs no separate "which room" state).
`onNodeClick(_event, node)`: if `node.type === "device"`, `setSelectedDevice(
node.data.device)`; if `node.type === "room"`, `setIsRoomModalOpen(true)`;
if `node.type === "mode"`, navigate to `/setup` via `useRouter().push`
(`next/navigation`). Conditionally render `<DeviceModal device=
{selectedDevice} modesForRoom={getModesForRoom(selectedDevice.roomId ?? "",
modeListQuery.data ?? [])} rooms={roomsListQuery.data ?? []} utils={utils}
onClose={() => setSelectedDevice(null)} />` when `selectedDevice` is set,
and `<RoomModal roomId={viewedRoom.roomId} roomName={viewedRoom.roomName}
devices={viewedRoom.devices} modesForRoom={modesForRoom} onClose={() =>
setIsRoomModalOpen(false)} />` when `isRoomModalOpen` and `viewedRoom` are
both truthy.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run check` (Biome) passes
- `npm run test` passes
- `npm run build` succeeds

#### Manual Verification:

- Clicking a device node opens `DeviceModal` with that device's correct data
- Clicking the room node opens `RoomModal` with that room's correct devices
  and modes, matching what the device nodes show
- Clicking a mode node navigates to `/setup`
- Closing any modal returns to the diagram in its previous (not reset) drag
  layout
- Dragging nodes and the existing pan/zoom controls still work after a
  modal has been opened and closed

---

## Testing Strategy

### Unit Tests:

- `computeAutomationFlowLayout` — zero/zero, one/one, even-length column,
  odd-length column, mismatched column lengths, room position invariant
  under column-length changes.

### Integration Tests:

- None planned — no new tRPC procedure or schema change exists to test;
  `device.overview`, `mode.list`, and `room.list` are unchanged and already
  covered by their respective router tests.

### Manual Testing Steps:

1. Pick a room with 0, 1, and 2+ modes targeting it; confirm the diagram's
   mode nodes match the Automations tab for any device in that room.
2. Switch rooms via the selector; confirm devices/modes update correctly.
3. Switch the active site; confirm the selector's options and the default
   room both update.
4. Drag a node, wait through a 30-second refresh, confirm it stays put.
5. Click each of the three node types; confirm the correct modal/navigation.
6. Close a modal; confirm the diagram's drag layout was preserved.

## Performance Considerations

`device.overview` polls every 30s, matching the rest of the dashboard — no
new polling pattern introduced. The drag-preserving merge in
`tuya-automation-flow.tsx` (Phase 2) avoids a full node-array replacement on
every refetch, so React Flow only re-renders nodes whose `data` actually
changed.

## Migration Notes

Not applicable — no schema or data changes.

## References

- Research: `context/changes/automation-flow-live-data/research.md`
- Prior change this reuses data/utilities from:
  `context/changes/automation-visibility/plan.md`
- Mode-room targeting utility (reused as-is): `src/lib/mode-targeting.ts`
- Mode execution semantics (valve-only commands): `src/server/lib/mode-control.ts:18-85`
- Device-type icon/color convention: `src/app/_components/device-card.tsx:18-34`
- Room-selector pattern to follow: `src/app/_components/filter-bar.tsx:141-166`
- Modal reuse pattern to mirror: `src/app/_components/device-overview.tsx`
- SSR-prefetch pattern to follow: `src/app/map/page.tsx`
- Current demo being replaced: `src/app/_components/automation-flow/tuya-automation-flow.tsx`, `src/app/_components/automation-flow/device-node.tsx`, `src/app/automation-flow/page.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Layout utility + new node types

#### Automated

- [x] 1.1 `npm run typecheck` passes — 70e9395
- [x] 1.2 `npm run check` (Biome) passes — 70e9395
- [x] 1.3 `npm run test` passes, including the new `automation-flow-layout.test.ts` cases — 70e9395
- [x] 1.4 `npm run build` succeeds — 70e9395

### Phase 2: Real data wiring + room selector

#### Automated

- [x] 2.1 `npm run typecheck` passes
- [x] 2.2 `npm run check` (Biome) passes
- [x] 2.3 `npm run test` passes
- [x] 2.4 `npm run build` succeeds

#### Manual

- [x] 2.5 Room selector populated with the active site's rooms, defaults to first room (alphabetical) with no click required
- [x] 2.6 Switching rooms in the selector updates the diagram to that room's real devices and modes
- [x] 2.7 Switching the active site updates the selector's options and re-selects a valid default room
- [x] 2.8 Device nodes show correct icon, name, and online/offline dot
- [x] 2.9 Mode nodes show correct name, ON/OFF badge, and schedule text matching the Automations tab
- [x] 2.10 A room with zero modes targeting it shows just Room + Device nodes, no errors
- [x] 2.11 Dragging a node survives a 30-second live-data refresh without snapping back
- [x] 2.12 Mode→Room edges look visually animated/labeled; Room→Device edges look visually plain

### Phase 3: Node-click integration

#### Automated

- [ ] 3.1 `npm run typecheck` passes
- [ ] 3.2 `npm run check` (Biome) passes
- [ ] 3.3 `npm run test` passes
- [ ] 3.4 `npm run build` succeeds

#### Manual

- [ ] 3.5 Clicking a device node opens `DeviceModal` with that device's correct data
- [ ] 3.6 Clicking the room node opens `RoomModal` with that room's correct devices and modes
- [ ] 3.7 Clicking a mode node navigates to `/setup`
- [ ] 3.8 Closing any modal returns to the diagram in its previous (not reset) drag layout
- [ ] 3.9 Dragging and pan/zoom still work after a modal has been opened and closed
