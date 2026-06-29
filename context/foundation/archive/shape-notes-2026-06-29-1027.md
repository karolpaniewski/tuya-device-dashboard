---
project: Tuya Device Dashboard — Editable Automation Flow
context_type: brownfield
created: 2026-06-26
updated: 2026-06-26

## Quality cross-check

All elements present — no gaps:
- Access Control: present (no changes; current model preserved)
- Business Logic: present (infrastructure-only; no domain rule change)
- Project artifacts: present
- Timeline-cost ack: present (3 weeks, within budget)
- Non-Goals: present (device-level targeting explicitly excluded)
- Preserved behavior: present (Setup editor, data model, schema-change-free must-haves)
product_type: web-app
target_scale:
  users: small
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 3
  timeline_budget:
    delivery_weeks: 3
    hard_deadline: null
    after_hours_only: true
  gray_areas_resolved:
    - topic: granularity
      decision: room-level — modes target rooms (not individual devices); reuses automationModeTargets.roomId; no schema change
    - topic: interaction model
      decision: drag to connect — user drags an edge from a mode node to a room node to create a connection; clicks an edge to remove it
    - topic: coexistence with Setup editor
      decision: both surfaces coexist — flow chart handles quick attach/detach; Setup editor handles schedule (days/time) and mode name
  frs_drafted: 0
  quality_check_status: accepted
---

> Seed idea (verbatim): "Automation flow should be editable. You could attach and unattach devices to make your own chart"

## Current System

The Tuya Device Dashboard is a LAN-only web dashboard for small facility teams
(2–5 people, single flat role). It already has: a read-only automation flow
visualization (flow chart showing Mode → Room → Device connections, added
recently), a Setup / Automations screen where automation modes are created and
edited (name, schedule days/time, and which rooms the mode targets), and a
`automationModeTargets` table linking each mode to a room by roomId.

**Tech stack:** Next.js 15 + React 19, tRPC v11, Drizzle ORM + libsql (SQLite),
Tailwind CSS, NextAuth — persistent polling worker alongside the Next.js server.

**Users:** Facility manager / office administrator — single flat role, 2–5 person org.

**Pain / gap:** The automation flow visualization shows the mode → room → device
connections clearly, but all editing must happen in the Setup screen. To add or
remove a room from a mode you must leave the visualization, find the mode in
the Setup list, open its edit form, change the room targets, and save. The
visualization gives context without control — the editing surface is elsewhere.

**Must preserve:**
- The existing Setup → Automations mode editor (schedule days/time, name
  editing remain there — flow chart is additive, not a replacement).
- The existing read-only automation flow visualization behavior.
- The existing `automationModeTargets` data model (no schema changes).

## Vision & Problem Statement

**Change:** Make the automation flow chart interactive — users can drag an edge
from a mode node to a room node to attach that room to the mode, and click an
existing edge to detach it. Persistence is immediate (writes to
`automationModeTargets`). The Setup editor coexists and remains the surface
for schedule and name editing.

**Insight:** The flow chart already renders the mode → room → device graph. The
node and edge data structures are already in place. The gap is interaction:
the chart is a viewer, not an editor. Switching from read-only to editable
requires adding drag-handle interaction to the existing nodes and wiring the
create/delete edge actions to existing tRPC mutations — the data layer and the
visualization are already there.

## User & Persona

**Role:** Facility manager / office administrator — unchanged. Same persona, same
single flat role. No new persona introduced by this change.

## Success Criteria

### Primary
1. User drags an edge from a mode node to a room node in the flow chart — the
   connection appears immediately and the room is added to the mode
   (`automationModeTargets` row created).
2. User clicks an existing mode→room edge — the edge is removed immediately and
   the room is detached from the mode (row deleted).
3. Changes made in the flow chart are reflected in the Setup → Automations
   editor without a page reload (shared data layer).

### Secondary
- Node positions in the flow chart are draggable and the layout persists (user
  can physically arrange their own chart view).

### Guardrails
- The Setup → Automations mode editor (name, schedule days/time, room list)
  must not regress — it remains the surface for full mode configuration.

**Timeline:** 3 weeks of after-hours work, confirmed deliverable at this scope.

## Functional Requirements

- FR-001: User can drag from a mode node to a room node in the automation flow
  chart to attach that room to the mode. Priority: must-have. Change: new.
  > Socrates: Counter-argument: drag-to-connect has no obvious affordance —
  > users may never discover it. Resolution: kept; implementation must add a
  > visible drag handle or tooltip on mode nodes so the gesture is discoverable.
- FR-002: User can click a mode→room edge in the flow chart to detach that room
  from the mode. Priority: must-have. Change: new.
  > Socrates: Counter-argument: immediate deletion without undo means one
  > misclick silently removes a mode target. Resolution: kept; recovery is
  > re-dragging the edge (low cost). However, implementation should evaluate
  > a brief undo toast or a confirm affordance on the selected edge — flagged
  > as an open question for downstream planning.
- FR-003: User can drag nodes to reposition them in the flow chart, with
  positions persisted across sessions. Priority: nice-to-have. Change: new.
  > Socrates: Counter-argument: persisting positions requires new storage
  > (a DB column or table for node x/y per user/site) — this is a schema
  > change hidden behind the "nice-to-have" label. Resolution: kept but
  > reclassified as a separate implementation phase; it must not block
  > the must-have FRs. Implementation should treat position persistence as
  > an additive phase with its own migration, not a zero-cost addition.

## Business Logic

No domain logic change. This is a new editing surface for the existing
mode-targeting rule — the rule ("a mode targets a set of rooms; triggering
the mode fires the valves in those rooms") already exists and is unchanged.
This change only adds a drag/click interaction model to create and delete
`automationModeTargets` rows that were previously managed exclusively via
the Setup editor.

## Non-Functional Requirements

- Attaching or detaching a room in the flow chart is perceived as instant —
  no visible loading state between the user's drag/click and the chart
  reflecting the change. Confirmation of the DB write is a background concern.

## Constraints & Preserved Behavior

- **No schema change for must-have FRs:** FR-001 and FR-002 reuse
  `automationModeTargets` as-is — no migration needed for the core feature.
- **FR-003 (node positions) is an additive phase:** it requires a new DB
  column or table; it must be implemented as a separate scope after the
  must-have FRs ship, not bundled with them.
- **The existing Setup → Automations editor must not regress:** name, schedule,
  and room list editing there continue to work unchanged. The flow chart
  writes to the same data, so changes in either surface are reflected in both.
- **No backward-compatibility risk:** no external API consumer touches this
  surface.

## User Stories

### US-01: Facility admin rewires a mode's room targets without leaving the flow chart

- **Given** the automation flow chart is open and at least one mode and one
  room node are visible
- **When** the admin drags an edge from a mode node and drops it on a room node
- **Then** the connection appears immediately in the chart and the room is
  added to the mode's targets — reflected in the Setup editor without reload

### US-02: Facility admin removes a room from a mode by clicking its edge

- **Given** a mode→room edge exists in the flow chart
- **When** the admin clicks the edge
- **Then** the edge is removed immediately and the room is no longer a target
  of that mode

## Non-Goals

- Avoid: device-level mode targeting — modes target rooms (not individual
  valves or sensors); no new device-scoped target table introduced.
  The room-level `automationModeTargets` model is preserved as the
  single targeting unit.
- Avoid: redesigning the Setup → Automations mode editor — it stays as-is;
  the flow chart is an additive editing surface, not a replacement.

## Access Control

No changes planned — current model preserved: NextAuth email + password login,
single flat role, all routes gated behind the auth session. The editable flow
chart is available to any authenticated user — same gate as the existing
read-only visualization.
