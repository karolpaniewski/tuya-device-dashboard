# Automation Flow — Live Data — Plan Brief

> Full plan: `context/changes/automation-flow-live-data/plan.md`
> Research: `context/changes/automation-flow-live-data/research.md`

## What & Why

The `/automation-flow` page currently shows a standalone demo with three
hardcoded mock devices and fictional device-to-device trigger edges (Door
Sensor → Lamp, TV → Lamp). This plan turns it into a real feature: a room
selector, the selected room's actual devices, and the real automation modes
targeting it — so the diagram reflects this dashboard's live data instead of
a fixed mock.

## Starting Point

`tuya-automation-flow.tsx` feeds hardcoded `initialNodes`/`initialEdges`
arrays straight into React Flow — no tRPC query, no props. `device-node.tsx`
uses demo-only vocabulary (`doorSensor`/`lamp`/`smartPlug`,
`trigger`/`action`) that doesn't map onto the real domain. The real schema
has no device-to-device automation at all — a mode targets a room with an
on/off intent, and when it fires it only ever commands valve devices in that
room (confirmed in `mode-control.ts`).

## Desired End State

Opening `/automation-flow` shows a room selector (defaulting to the first
room), the room's real devices with live icon/name/online-state, and the
real modes targeting it with name/ON-OFF/schedule — laid out Mode → Room →
Device. Clicking a device opens the existing `DeviceModal`, clicking the
room opens the existing `RoomModal`, clicking a mode goes to `/setup`. Data
polls every 30s without resetting any node the user has dragged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Graph shape | Mode → Room → Device, three-tier | Matches the real data model (modes target rooms, not devices) — no device-to-device causality exists to represent | Research |
| Node click behavior | Open existing `DeviceModal`/`RoomModal`; mode nodes link to `/setup` | Reuses what `automation-visibility` already built; zero new detail UI | Research |
| Site scope | Follow `useSiteContext`, like every other dashboard view | Consistency with the rest of the app | Research |
| Room-selector data source | `device.overview.rooms` | Already-fetched, zero extra query; an empty room has nothing to diagram anyway | Plan |
| Edge semantics | Mode→Room is the only animated/labeled edge; Room→Device is plain containment | Honest to the data model — a mode never actually commands sensors/plugs | Plan |
| Room-node click | Opens existing `RoomModal` | Obvious reuse, zero new code | Plan |
| Layout strategy | Small computed column-layout function, no new dependency | This app's room sizes don't need a real graph-layout engine | Plan |
| Device-node density | Minimal — icon, name, online dot only | Full detail is one click away in the modal; keeps the diagram readable | Plan |
| Live updates | Yes, same 30s `refetchInterval` as the rest of the dashboard | Consistency; device state here is never staler than anywhere else | Plan |
| Default room | Auto-select first room (alphabetical) | Page is never empty; mirrors the dashboard's default-to-useful pattern | Plan |

## Scope

**In scope:**
- A tested pure layout function (`src/lib/automation-flow-layout.ts`)
- Three real-data node components: `ModeNode`, `RoomNode`, rebuilt `DeviceNode`
- Room selector + site-context integration on the automation-flow page
- Live polling with drag-position preservation across refetches
- Reusing `DeviceModal`/`RoomModal` for node-click detail

**Out of scope:**
- Any new editing surface (mode membership, schedules, device assignment) beyond what `DeviceModal` already includes
- New tRPC procedure or schema change
- A real graph-layout library
- Changes to the Room modal's grouped-list design, the dashboard grid, or any other existing page
- Viewing more than one room at a time

## Architecture / Approach

`tuya-automation-flow.tsx` becomes self-contained: it reads the active site,
fetches `device.overview`/`mode.list`/`room.list` itself, holds room-
selection and modal-open state, and computes nodes/edges via `useMemo` from
`getModesForRoom` + the new layout function — merging into `useNodesState`
so in-progress drags survive the 30s poll. Mode→Room edges are visually
animated/labeled; Room→Device edges are plain containment, keeping the
"what does automation actually touch" distinction honest at a glance.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Layout utility + new node types | Tested column-layout function + `ModeNode`/`RoomNode`/rebuilt `DeviceNode`, unwired | Low — pure functions + presentational components, automated-only phase |
| 2. Real data wiring + room selector | Full live diagram: room selector, real devices/modes, 30s polling, drag-safe refetch | Medium — the drag-position-preserving merge is the one genuinely tricky piece |
| 3. Node-click integration | Device/room nodes open existing modals; mode nodes link to `/setup` | Low — pure reuse of already-built modal components |

**Prerequisites:** none — single-slice change, no dependency on other in-flight work (beyond `automation-visibility`'s already-merged `mode-targeting.ts`/`DeviceModal`/`RoomModal`, which this change reuses as-is).
**Estimated effort:** 3 phases, no backend work — comparable in size to `automation-visibility`.

## Open Risks & Assumptions

- Assumes typical room device counts stay small enough (a handful) that the
  computed column layout reads cleanly without a real graph-layout engine —
  confirmed reasonable given this app's existing room sizes, but not load-
  tested against an unusually large room.
- The drag-position-preserving merge (Phase 2) is the one piece of genuinely
  new state-management logic in this plan; everything else is established
  pattern reuse.

## Success Criteria (Summary)

- The diagram for any selected room exactly matches that room's real
  devices and the modes targeting it, as already shown in the Automations
  tab / Room modal
- Switching rooms or sites always lands on a valid, populated diagram
- Dragging a node survives a live-data refresh without snapping back
- Every node type's click opens the correct existing modal or navigates
  correctly — no new detail UI was built
