---
project: "Tuya Device Dashboard — Editable Automation Flow"
version: 1
status: draft
created: 2026-06-26
context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

The Tuya Device Dashboard is a LAN-only web dashboard for small facility teams
(2–5 people, single flat role) that replaces one-by-one Tuya mobile-app device
management. It provides: a dashboard grid (KPI summary, per-room panels,
drag-and-drop widget reordering), a device list grouped by room, a floor-plan
map view, a drag-to-rotate thermostat dial, a persistent polling worker that
keeps device state current, and a Settings / Automations area for managing
modes with room-level scheduling.

**Tech stack:** Next.js 15 + React 19, tRPC v11, Drizzle ORM + libsql (SQLite),
Tailwind CSS, NextAuth — persistent polling worker alongside the Next.js server.

**User base:** Facility manager / office administrator — single flat role, 2–5
person org.

**Core functionality:** Manage and monitor Tuya smart devices (valves, sensors)
grouped by room and site; define automation modes (name, schedule by day/time,
list of target rooms) that trigger valve states on a schedule; view a flow-chart
visualization of how modes connect to rooms and devices.

## Problem Statement & Motivation

The automation flow visualization shows the mode → room → device graph clearly,
but editing that graph requires leaving the visualization entirely. To add or
remove a room from a mode, a user must navigate to Settings → Automations, find
the mode, open its edit form, change the room targets, and save — then navigate
back to the visualization to see the result.

**Why now:** The flow-chart visualization was just added as a read-only viewer.
The node and edge data structures are in place; the gap is interaction alone.
Extending the existing viewer to support editing is the natural next step while
the graph infrastructure is fresh.

**Current workaround cost:** Context-switch away from the visualization, hunt
for the mode in the Settings list, edit it, then navigate back. Every attach or
detach requires this full round-trip.

## User & Persona

**Primary:** Facility manager / office administrator — unchanged from the rest
of the system. Single flat role, 2–5 person org, uses the dashboard to monitor
and manage smart building devices and schedule automation modes. No new persona
is introduced by this change.

## Success Criteria

### Primary
1. A user can drag an edge from a mode node to a room node in the automation
   flow chart — the connection appears immediately and the room is added to the
   mode's targets.
2. A user can click a mode→room edge in the flow chart — the edge is removed
   immediately and the room is detached from the mode.
3. Changes made in the flow chart are reflected in the Settings → Automations
   editor without a page reload.

### Secondary
- Node positions in the flow chart are draggable and the layout persists across
  sessions (the user can arrange their own chart view).

### Guardrails
- The Settings → Automations mode editor (name, schedule days/time, room list)
  must not regress — it remains the surface for full mode configuration.
- The must-have editing capability requires no schema change — it reuses the
  existing mode-targeting data structure as-is.

## User Stories

### US-01: Facility admin rewires a mode's room targets without leaving the flow chart

- **Given** the automation flow chart is open and at least one mode and one
  room node are visible
- **When** the admin drags an edge from a mode node and drops it on a room node
- **Then** the connection appears immediately in the chart and the room is added
  to the mode's targets — reflected in the Settings editor without a page reload

### US-02: Facility admin removes a room from a mode by clicking its edge

- **Given** a mode→room edge exists in the flow chart
- **When** the admin clicks the edge
- **Then** the edge is removed immediately and the room is no longer a target of
  that mode

## Scope of Change

- [new] User can drag an edge from a mode node to a room node to attach that
  room to the mode. A visible drag handle on the mode node makes the gesture
  discoverable.
  > Socratic: Counter-argument: drag-to-connect has no obvious affordance —
  > users may never discover it. Resolution: kept; implementation must add a
  > visible drag handle or tooltip on mode nodes so the gesture is discoverable.
- [new] User can click a mode→room edge to detach that room from the mode.
  The detach takes effect immediately; recovery is re-dragging the edge.
  > Socratic: Counter-argument: immediate deletion without undo means one
  > misclick silently removes a mode target. Resolution: kept; recovery is
  > re-dragging the edge (low cost). However, implementation should evaluate
  > a brief undo affordance on the selected edge — flagged as Open Question 1.
- [new, nice-to-have] User can drag nodes to reposition them in the flow chart,
  with positions persisted across sessions. Requires new storage infrastructure
  and must be implemented as a separate phase after the must-have items ship.
  > Socratic: Counter-argument: persisting positions requires new storage
  > (a DB column or table for node x/y per user/site) — this is a schema
  > change hidden behind the "nice-to-have" label. Resolution: kept but
  > reclassified as a separate implementation phase with its own schema change,
  > not a zero-cost addition.
- [preserved] The Settings → Automations mode editor (name, schedule, room list)
  continues to work unchanged.
- [preserved] The existing read-only flow-chart visualization behavior is
  maintained as the fallback state.

## Constraints & Compatibility

- **No schema change for must-have capabilities:** the core attach/detach
  feature reuses the existing mode-targeting data structure as-is — no schema
  change is required for the must-have items.
- **Node position persistence is an additive phase:** it requires new storage
  infrastructure and must be scoped as a separate implementation phase after the
  must-have capabilities ship. It must not block or be bundled with the
  must-have items.
- **Settings editor compatibility:** the flow chart and the Settings mode editor
  write to the same underlying data; changes in either surface must be
  immediately reflected in the other without a page reload.
- **No external API consumers:** no external system touches this surface; no
  backward-compatibility risk beyond the internal UI sync requirement above.

## Business Logic Changes

No domain logic change. This change adds a new editing surface for the existing
mode-targeting rule — the rule ("a mode targets a set of rooms; triggering the
mode fires the valves in those rooms") already exists and is unchanged. This
change only adds drag/click interactions that create and delete mode-room
associations previously managed exclusively via the Settings editor.

## Access Control Changes

No access control changes — current model preserved: email + password login,
single flat role, all routes gated behind the existing auth session. The
editable flow chart is available to any authenticated user under the same gate
as the existing read-only visualization.

## Non-Goals

- Avoid: device-level mode targeting — modes target rooms (not individual
  valves or sensors); the existing room-level mode-targeting data structure is
  preserved as the single targeting unit.
- Avoid: redesigning the Settings → Automations mode editor — it stays as-is;
  the flow chart is an additive editing surface, not a replacement.

## Open Questions

1. **Accidental detach risk (UX decision):** clicking a mode→room edge detaches
   the room immediately with no undo path beyond re-dragging. Should a
   confirmation step or brief undo notification be added before implementation?
   — Owner: user. Block: yes for the UX decision; no for the FR itself.
