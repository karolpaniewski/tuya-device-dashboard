---
date: 2026-06-25T13:28:19+0000
researcher: Claude
git_commit: 616d5dc807f284fe4327a69c403dba9990ad7c68
branch: main
repository: tuya-device-dashboard
topic: "Wire the automation-flow diagram to real rooms, devices, and modes"
tags: [research, codebase, automation-flow, mode-targeting, xyflow, room-selector]
status: complete
last_updated: 2026-06-25
last_updated_by: Claude
---

# Research: Wire the automation-flow diagram to real rooms, devices, and modes

**Date**: 2026-06-25T13:28:19+0000
**Researcher**: Claude
**Git Commit**: 616d5dc807f284fe4327a69c403dba9990ad7c68
**Branch**: main
**Repository**: tuya-device-dashboard

## Research Question

The `/automation-flow` page currently renders `TuyaAutomationFlow`, a standalone demo with hardcoded mock devices (Door Sensor, Ceiling Lamp, Smart TV Outlet) and fictional device-to-device trigger edges. The user wants this turned into a real feature: add a room selector, and show the selected room's actual devices plus the real automation modes that target them — reusing `device.overview` and `mode.list`, the same data sources `automation-visibility` already wired up.

Locked scope decisions (confirmed via AskUserQuestion before this research):
- **Graph shape**: three-tier — Mode node(s) → Room node → Device nodes, not the demo's device-to-device causal chain.
- **Node click**: open the existing detail modal (`DeviceModal` for device nodes; mode nodes link to `/setup`, matching what `automation-visibility` already built).
- **Site scope**: follow the app's existing multi-site context (`useSiteContext`), consistent with every other dashboard view.

## Summary

The current demo (3 files, ~150 lines) is pure mock data with no tRPC queries — it needs to become a data-driven view sourced from `device.overview`, `mode.list`, and (for the room picker) either `device.overview`'s own room list or `room.list`. The hard part isn't data-fetching — `src/lib/mode-targeting.ts`'s `getModesForRoom`/`formatModeSchedule` already solve "which modes target this room" and are directly reusable, no new tRPC procedure needed. The two things genuinely new to this change are:

1. **The graph-shape translation.** The data model has no device-to-device trigger relationship at all — `automationModeTargets` links a mode to a *room* with an on/off intent, not to individual devices (confirmed in `schema.ts` and `mode.ts`). Worse, `applyModeToRooms` (`mode-control.ts:18-85`) reveals that a fired mode only ever commands **valve** devices in the room — sensors and plugs in the same room receive no command at all. A literal "Mode → every device in the room" edge would overstate what the mode actually does to non-valve devices.
2. **Reusing the existing modal-open pattern.** `device-overview.tsx` already holds `selectedDevice`/`selectedRoomId` state and renders `DeviceModal`/`RoomModal` conditionally with `modesForRoom` threaded in. The new page should mirror that same state-and-render pattern rather than inventing a new one.

## Detailed Findings

### Current automation-flow demo (to be replaced/extended)

- `src/app/automation-flow/page.tsx` — server component, `CommandCenterShell` wrapper, static header text, renders `<TuyaAutomationFlow />` with zero props and zero data fetching.
- `src/app/_components/automation-flow/tuya-automation-flow.tsx` — `"use client"`; hardcoded `initialNodes`/`initialEdges` arrays (lines ~17–95); `ReactFlowProvider` wraps a `TuyaAutomationFlowCanvas` inner component that calls `useNodesState`/`useEdgesState` directly on the mock arrays (no props in, no query). `onNodeClick` (lines ~99–108) only does `console.info`.
- `src/app/_components/automation-flow/device-node.tsx` — custom xyflow node. `DeviceNodeData` (lines 10–15) has a closed union `DeviceKind = "doorSensor" | "lamp" | "smartPlug"` and `DeviceRole = "trigger" | "action"` — both purely demo-specific vocabulary that doesn't map onto the real domain (`deviceType: "sensor"|"valve"|"plug"` from `device.ts`, no trigger/action concept anywhere in the schema).
- `src/app/_components/command-center-shell.tsx` — nav rail entry for `/automation-flow` added (the `Workflow` icon, `RailLink` block) — stays as-is; only the page content changes.

**Implication for the plan**: `DeviceNodeData`, `DeviceKind`, `DeviceRole`, and the mock arrays need to be redesigned around real shapes — likely a `device` node kind (driven by `RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number]`), a `room` node kind, and a `mode` node kind, each with their own visual treatment, rather than one `DeviceNode` type for everything.

### Real data layer

- `mode.list` (`mode.ts:128-173`) returns `{ id, name, daysOfWeek: number[] | null, fireHour, fireMinute, targets: { roomId, roomName, targetOn }[] }[]` for a given `siteId` (or `"all"`). Already fetched at the page level in `device-overview.tsx:138` (`modeListQuery`) and reused with zero extra network cost.
- `device.overview` (`device.ts`, `overview` procedure) returns `{ rooms: RoomItem[], unassigned: DeviceItem[] }`. `RoomItem` = `{ roomId, roomName, siteId, siteName, devices: DeviceItem[], badge, pinnedOff, alertSent, anomaly, suggestion, ...score fields }`. `DeviceItem` = `{ id, tuyaDeviceId, name, deviceType: "sensor"|"valve"|"plug", roomId, roomName, siteId, nodeId, sortOrder, isOnline, temperatureC, setpointC, humidityPct, isOn, lastPolledAt, isStale, mapXPct, mapYPct }`.
  - **Critically**: `device.overview`'s `rooms` map is only populated from rows where a device is actually assigned (`device.ts`, the `overview` query is `devices LEFT JOIN deviceRoomAssignments LEFT JOIN rooms`, grouped only when `row.room` is truthy). **Rooms with zero devices are silently excluded.**
- `room.list` (`room.ts:18-50`) returns ALL rooms for the site — `{ id, name, siteId, deviceCount }[]` — independent of whether they have devices, including `deviceCount: 0` rooms. This is the canonical "every room" source; `device.overview` is the canonical "rooms with live device data" source. **They are not interchangeable and use different key names** (`roomId`/`roomName` vs `id`/`name`).
- `src/lib/mode-targeting.ts` (written during `automation-visibility`, this session):
  - `getModesForRoom(roomId, modes)` → filters `mode.list`'s output to modes targeting `roomId`, flattening each mode's room-specific `targetOn` onto the result. Already unit-tested (`mode-targeting.test.ts`) for 0/1/2 simultaneous modes and multi-room `targetOn` divergence.
  - `formatModeSchedule(mode)` → `"Mon Wed Fri · 06:05"` or `"Manual trigger only"`. Both are directly reusable with zero changes for mode-node labels in the new diagram.

### Mode execution semantics (`mode-control.ts:18-85`)

`applyModeToRooms(modeId, targets, triggeredBy)` is what actually runs when a mode fires (scheduled or manually triggered via `mode.trigger`):

1. Per target room: if `roomHeatState.pinnedOff` is true, skip entirely (`status: "skipped-pinned"`) — no devices touched.
2. Otherwise, query **only valve-type devices** in that room (`deviceRoomAssignments` join `devices` filtered to `deviceType: "valve"`).
3. Send `sendValveStateCommand(deviceId, targetOn)` to each valve device only.
4. Log one `automationModeActivationLogs` row per room (not per device) with `status: applied | skipped-pinned | failed`.

**Sensors and plugs in a targeted room are never commanded by a mode.** This means a literal "Mode → every device in the room" edge set would visually claim the mode controls devices it doesn't touch. The plan should decide whether to: (a) only draw Mode→Device edges to valve devices and show sensors/plugs as room-member nodes with no incoming mode edge, or (b) draw all Mode→Room edges and a separate Room→Device containment edge for every device type, making the distinction implicit (room-level vs device-level edges look different). Per the locked "Mode → Room → Devices" three-tier decision, option (b) — Room→Device as plain containment, Mode→Room as the only automation edge — is the simplest honest mapping and avoids overstating per-device causality.

### Existing room-selector UI conventions

Two existing patterns, both already used elsewhere in this app — neither built for a single-page "pick a room" control, but both directly adaptable:

- `room-sidebar.tsx` (`RoomSidebar`) — a vertical nav list: "All Rooms" button + one button per room with a status-badge color dot. Takes `{ activeRoomId: string | null, onSelect, rooms: { roomId, roomName, badge }[] }`. Used in `device-overview.tsx` as a persistent desktop sidebar alongside the whole dashboard grid — heavier than what a single focused page needs.
- `filter-bar.tsx`'s room dropdown (lines 141–166) — a compact `Select`/`SelectTrigger`/`SelectContent` dropdown built from `rooms: { roomId, roomName }[]`, with an `"all"` sentinel value mapped to `""` in the change handler. This is the better-fitting pattern for a single room-selector control on a focused page — same `Select` primitive used throughout the app (already flagged in `lessons.md`: must pass `items={...}` to `Select` for correct label resolution on a pre-populated value).
- `site-context.tsx` (`useSiteContext`) — `{ activeSiteId, sites, setActiveSite }`. `device.overview`, `mode.list`, `room.list` are all already called with `{ siteId: activeSiteId }` throughout the app (e.g. `device-overview.tsx:130-138`, `map-view.tsx`). The new page should follow this exact pattern: read `activeSiteId` from context, pass it to all three queries, and let the existing site switcher in `CommandCenterShell`'s nav drive which site's rooms appear in the new room selector.

### Modal-open wiring pattern (for the "open existing detail modal" decision)

`device-overview.tsx` (this session's `automation-visibility` work) established the pattern to mirror:

- `selectedDevice` / `selectedRoomId` local state, set via `onClick`/`onHeaderClick` handlers.
- Conditionally render `<DeviceModal device={selectedDevice} modesForRoom={getModesForRoom(...)} rooms={roomsListQuery.data ?? []} utils={utils} onClose={...} />` and `<RoomModal devices={room.devices} modesForRoom={getModesForRoom(...)} roomId={...} roomName={...} onClose={...} />` near the bottom of the component tree.
- Both modals are pure presentational `Dialog`/`DialogContent` consumers — no new tRPC calls of their own; the parent always threads in pre-fetched data.

The new automation-flow page should hold the same `selectedDevice`/`selectedRoomId` state shape and reuse `DeviceModal`/`RoomModal` as-is — `onNodeClick` for a device-type node sets `selectedDevice`; for a room-type node (if rendered) sets `selectedRoomId`; for a mode-type node, `next/link` to `/setup` (no modal exists for modes themselves — `mode-manager.tsx`'s edit form is the only mode-editing UI, reachable only via `/setup`, confirmed in `automation-visibility`'s plan).

## Code References

- `src/app/automation-flow/page.tsx` — current demo page, no data fetching
- `src/app/_components/automation-flow/tuya-automation-flow.tsx:17-95` — hardcoded mock nodes/edges to replace
- `src/app/_components/automation-flow/tuya-automation-flow.tsx:99-108` — `onNodeClick`, currently console-log only
- `src/app/_components/automation-flow/device-node.tsx:7-15` — `DeviceKind`/`DeviceRole`/`DeviceNodeData`, demo-specific vocabulary to redesign
- `src/server/api/routers/mode.ts:128-173` — `mode.list` procedure
- `src/server/api/routers/device.ts` (`overview` procedure) — room/device shapes; rooms-with-devices-only behavior
- `src/server/api/routers/room.ts:18-50` — `room.list`, canonical all-rooms source with `deviceCount`
- `src/lib/mode-targeting.ts` — `getModesForRoom`, `formatModeSchedule`, both reusable as-is
- `src/server/lib/mode-control.ts:18-85` — `applyModeToRooms`; valve-only command semantics
- `src/app/_components/room-sidebar.tsx` — sidebar room-nav pattern
- `src/app/_components/filter-bar.tsx:141-166` — compact room-`Select` dropdown pattern
- `src/components/site-context.tsx` — `useSiteContext`, multi-site wiring
- `src/app/_components/device-overview.tsx` (this session) — `selectedDevice`/`selectedRoomId` state + `DeviceModal`/`RoomModal` render pattern to mirror
- `src/app/_components/command-center-shell.tsx` — nav rail entry, already wired, no change needed

## Architecture Insights

- **No device-to-device automation exists anywhere in this codebase.** The demo's "Door opened → Lamp on" metaphor is fictional relative to the real domain; the only real automation primitive is "mode targets room with an on/off intent, optionally on a schedule," executed by commanding that room's valves only.
- **`device.overview` and `room.list` are not interchangeable room sources** — different key names (`roomId`/`roomName` vs `id`/`name`) and different inclusion rules (devices-only vs all-rooms). Any new component touching both must normalize one to the other's shape, as `device-modal.tsx` already does (`Pick<RoomItem, "id" | "name">[]` from `room.list` for its room-reassignment dropdown).
- **Established reuse-over-new-query discipline**: every dashboard surface (`device-overview.tsx`, `map-view.tsx`, now this) fetches `device.overview`/`mode.list`/`room.list` once at the page level and threads results down as props — never a new per-component query for data already on the page. The plan should follow this without introducing a new tRPC procedure; everything needed already exists.
- **`@xyflow/react` CSS must be imported per-bundle** (already true for the existing demo) — confirmed in this session that a stale Turbopack dev cache can silently drop the stylesheet after adding library code; a fresh `.next/` resolves it. Not a code change, just an operational footnote for whoever runs `npm run dev` next.

## Historical Context (from prior changes)

- `context/changes/automation-visibility/plan.md` — the prior change explicitly scoped OUT an interactive node/edge diagram ("No interactive diagram/flow-chart editor — the Secondary 'flow-chart-style' criterion is a simple static grouping/list render, not a node-and-edge diagram tool"), in favor of the grouped-list Room modal. This change does not reopen that decision — it adds a **separate, additive page** (`/automation-flow`) rather than replacing the Room modal's grouped-list design, per the user's explicit direction when the standalone demo was first built.
- `context/changes/automation-visibility/plan.md` (Phase 1 contract) — `getModesForRoom`'s exact contract (room-specific `targetOn` flattening) and `formatModeSchedule`'s exact output format are both locked there and reused verbatim here.
- `context/foundation/lessons.md` — "Base UI `Select` needs an `items` prop" applies directly if the room selector is built with the `Select` primitive (matching `filter-bar.tsx`'s pattern) and its initial value can be non-empty on first render (e.g., restoring a previously-selected room).

## Related Research

- No prior `research.md` exists for `automation-visibility` (it went straight to `plan.md` + `plan-brief.md`); this is the first formal research document for the automation-flow line of work.

## Open Questions

1. **Room-selector data source**: `device.overview.rooms` (excludes empty rooms, already carries live badges/device data) vs `room.list` (every room including empty ones, needs a separate device fetch). Recommend `device.overview.rooms` for simplicity (an empty room has nothing to diagram anyway), but this should be an explicit planning decision, not an implicit one.
2. **Sensor/plug edge treatment**: per the mode-execution findings above, should sensors/plugs in a targeted room get a visibly different edge style (or no Mode-originating edge at all) versus valves, to avoid implying the mode controls them? Recommend: Mode→Room edge only (one edge per targeting mode), Room→Device containment edges for all devices regardless of type, with valve devices optionally highlighted as "controlled" — but this is a visual-design decision for `/10x-plan`, not settled here.
3. **Room-node click behavior**: the locked decision covers device nodes (open `DeviceModal`) and implies mode nodes link to `/setup`, but a room *node* in the three-tier graph has no decided click behavior yet — opening the existing `RoomModal` would be the natural reuse, consistent with the rest of this change's "reuse, don't reinvent" findings.
4. **Multiple rooms targeted by the same mode**: a single mode can target several rooms simultaneously (confirmed in `mode-targeting.test.ts`'s multi-room test case). Since this page shows one room at a time, a mode node only ever needs to show *that room's* `targetOn` value (already what `getModesForRoom` returns) — no graph-level complexity from multi-room modes, just confirming the existing utility already handles it correctly.
