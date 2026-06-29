---
project: "Tuya Device Dashboard — Automation Flow Bulk-Connect"
version: 1
status: draft
created: 2026-06-29
context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 1
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

The Tuya Device Dashboard is a LAN-only web dashboard for small facility teams
(2–5 people, single flat admin role) that replaces one-by-one device management
in the Tuya mobile app. It provides a live device overview grouped by room,
per-room health status and comfort-threshold configuration, a floor-plan map
view, a drag-to-rotate thermostat dial, and an automation modes system (named
modes with room-level targeting and day/time scheduling).

The `/automation-flow` page renders a flow-chart visualization of mode → room →
device connections. The most recent change (editable-automation-flow) made this
chart interactive: users drag from a mode node's connection point to a room node
to create a connection (one at a time), and click any connection edge to remove
it (one at a time).

**Tech stack:** Next.js 15 + React 19, @xyflow/react v12, tRPC v11, Drizzle ORM
+ libsql (SQLite).

**User base:** facility manager / office administrator — single flat role, one
seeded account, 2–5 person org.

## Problem Statement & Motivation

When configuring a mode that applies to multiple rooms, the user must repeat the
drag-to-connect gesture once per room. For a mode covering 6–10 rooms, this
means 6–10 sequential drag gestures with no batch shortcut. The
single-connection constraint was an acceptable starting point for the first
interactive version; it becomes noticeable friction once configuring many rooms
at once is the primary use case.

**Why now:** the multi-node selection building block is already present in the
flow-chart canvas component, requiring no additional dependencies. The room-
connection data model is in place. The gap is interaction design only — extending
the existing editor to support bulk selection and batch connect/disconnect is the
natural next step while the interaction model is still fresh.

**Current workaround cost:** N drag gestures for N rooms; no batch path exists.

## User & Persona

**Primary:** facility manager / office administrator — unchanged from the rest of
the system. Single flat role, 2–5 person org. Uses the automation flow chart to
define which rooms each mode controls.

**What changes for them:** the same person, performing the same task (assigning
rooms to a mode), can now select many rooms at once and connect or disconnect
them all in one action, instead of repeating the drag gesture per room.

## Success Criteria

### Primary

The smallest end-to-end slice proving the change works:

User opens `/automation-flow`, clicks a mode node ("Night Mode" becomes
visually active), shift-clicks three room nodes that are not yet connected to
Night Mode, clicks "Connect 3" in the context toolbar — three connection edges
appear on the canvas and a confirmation reads "Connected 3 rooms". Clicking
"Connect 3" again on the same three rooms produces no change and no error
(idempotent).

### Secondary

User selects a mixed set of rooms: two already connected to the active mode,
three not connected. The context toolbar shows two independent actions —
"Connect 3" and "Disconnect 2" — simultaneously. Clicking "Disconnect 2" removes
two edges and shows "Disconnected 2 rooms". The three unconnected rooms remain
unaffected.

### Guardrails

- Existing single drag-to-connect (mode connection point → room node) continues
  to work without regression.
- Existing single click-to-detach on any edge continues to work without
  regression.
- Settings → Automations editor is unaffected — no behavior changes on that
  surface.
- Bulk operations on up to 20 rooms complete within what the user perceives as
  instant (< 500 ms p95 under typical local-deployment conditions).
- Each bulk action ends with a visible confirmation naming the count of rooms
  affected ("Connected N rooms" / "Disconnected M rooms").
- The flow visualization updates immediately after a bulk action without visible
  interruption or flicker.

## User Stories

### US-01: Bulk-connect rooms to a mode

**Given:** the user is on `/automation-flow` and the canvas shows mode nodes and
room nodes

**When:** they click a mode node ("Night Mode" becomes active), then shift-click
four room nodes (two are not yet connected to Night Mode, two already are), then
click "Connect 2" in the context toolbar

**Then:** two new connection edges appear on the canvas between Night Mode and
the previously unconnected rooms; a confirmation reads "Connected 2 rooms"; the
two already-connected rooms are unchanged

### US-02: Bulk-disconnect rooms from a mode

**Given:** the user is on `/automation-flow` with a mode node active and three
room nodes selected, all three currently connected to the active mode

**When:** they click "Disconnect 3" in the context toolbar

**Then:** three connection edges are removed from the canvas; a confirmation
reads "Disconnected 3 rooms"

## Scope of Change

| Item | Change | Description |
|---|---|---|
| Mode-node activation | new | Clicking a mode node marks it as the active target for bulk operations; it receives a distinct visual state to distinguish it from passive nodes |
| Room-node multi-select | new | Users can additively select room nodes by shift-clicking individual nodes or drawing a lasso selection across the canvas background |
| Context toolbar | new | When a mode node is active and at least one room node is selected, a toolbar appears showing "Connect N" (count of unconnected rooms in the selection) and/or "Disconnect M" (count of connected rooms in the selection); both actions may appear simultaneously for mixed selections |
| Bulk-connect | new | Connects all currently-unconnected selected rooms to the active mode in one action; rooms already connected are skipped silently |
| Bulk-disconnect | new | Disconnects all currently-connected selected rooms from the active mode in one action; rooms with no connection are skipped silently |
| Single drag-to-connect | preserved | Dragging from a mode node's connection point to a room node creates one connection — unchanged |
| Single click-to-detach | preserved | Clicking an existing connection edge removes it — unchanged |
| Settings → Automations editor | preserved | The existing editor for mode name, schedule, and room targets — no changes to this surface |

## Constraints & Compatibility

- The room-connection data model is unchanged — this change requires no data
  migrations.
- The bulk-connect and bulk-disconnect operations use the same underlying data
  operations as the existing single-connect and single-detach, composed in
  batch; the data invariants are identical.
- The Settings → Automations editor and the flow-chart canvas share the same
  underlying data; both surfaces must reflect the same state after any operation
  on either surface.
- No external API consumers or integrations exist; backward compatibility is
  scoped to this dashboard only.

## Business Logic Changes

No domain logic change. This is an interaction-layer extension. The rules
governing which rooms a mode may target, how the scheduler executes modes, and
how valve state commands are issued remain exactly as they are today.

Idempotency is a behavioral requirement: connecting a room that is already
connected to the active mode produces no change and no error. Disconnecting a
room that has no connection to the active mode produces no change and no error.
Both operations are safe to repeat.

## Access Control Changes

No access control changes. Bulk operations use the same authorization model as
the existing single-connect and single-detach operations (flat admin role, single
seeded account).

## Non-Goals

- **No changes to the Settings → Automations editor** — schedule configuration,
  mode naming, and attribute editing remain exclusively in that surface; the
  flow-chart canvas is for connection topology only.

## Open Questions

No open questions — all decisions were resolved during the shaping session.
