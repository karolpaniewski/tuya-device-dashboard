---
project: "Tuya Device Dashboard"
version: 9
status: draft
created: 2026-06-25
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

The Tuya Device Dashboard is a LAN-only web dashboard that replaces
one-by-one Tuya mobile-app device management for a small facility team.

**Key architecture:** a Next.js application with a persistent polling
worker process running alongside the server (not serverless), continuously
reading device state over the LAN.

**Tech stack:** Next.js 15 + React 19, tRPC v11, Drizzle ORM + libsql
(SQLite), Tailwind CSS, NextAuth.

**Current user base:** facility manager / office administrator role,
2–5 person organization, single flat role.

**Core functionality today:** a dashboard grid (KPI summary row, per-room
temperature panels, drag-and-drop widget/room reordering), a device
list/table grouped by room, a floor-plan map view (drag devices onto a
floor-plan image to position them), a drag-to-rotate thermostat dial for
setpoint control, and a Settings area covering Rooms/Devices/Automations/
Sites CRUD plus display/threshold preferences.

## Problem Statement & Motivation

Despite several past visual-polish passes, the app still reads as a
generic "stub site" rather than premium. The deeper gap is on the
per-device surface (the device card and its detail/history view): it is
still primarily list-click-driven, while drag/gesture-based direct
manipulation already exists and works well elsewhere in the app
(floor-plan placement, the thermostat dial, widget reordering) — it was
never extended to the device view itself.

Specifically, today there is no way to see — from a device or a room —
which automation mode currently targets it without leaving and navigating
to a separate screen. This change is needed now because past polish
passes (visual/UX polish, dark-mode support, a design-system pass)
improved colors, icons, and spacing but never questioned the underlying
list-click interaction model for devices; extending the drag-and-drop
pattern already proven elsewhere to the device view is the natural next
step.

## User & Persona

**Role:** Facility manager / office administrator — same persona as the
rest of the app. No new persona; no change to who uses the product or
how they access it. This change affects how the existing persona
interacts with the device and room views specifically.

## Success Criteria

### Primary
1. User opens a device card and sees, read-only, which automation
   mode(s) currently target this device's room (modes target rooms as a
   whole, not individual devices), plus current temperature/state, with
   a link/shortcut into the existing mode editor to actually change
   anything.
2. User opens a Room card and sees an expanded view listing every device
   in that room together with the same per-device info — mode targeting
   and current temperature.

### Secondary
A flow-chart-style visualization of the devices inside a room (how they
relate — e.g. sensors/valves and the mode(s) acting on them) — nice to
have, not required for the slice to prove itself.

### Guardrails
- The dashboard grid layout and overall site look must not regress —
  confirmed fine as-is, out of scope for this change.
- The Setup/Settings screens must not regress — confirmed fine as-is,
  out of scope for this change.
- The existing drag-to-rotate setpoint dial must keep working unchanged.
- The existing drag-reorder-within-room (device card reordering) must
  keep working unchanged.

## User Stories

### US-01: Facility admin checks a device's automation without leaving the device card

- **Given** a device belongs to a room that one or more modes target
- **When** the admin opens that device's card
- **Then** they see which mode(s) target the room and the device's
  current temperature/state, with a link to the mode editor if they want
  to change anything — without navigating away to a separate screen first
  (today, this requires leaving the device view entirely)

## Scope of Change

- [new] User can view, on a device's card, which automation mode(s)
  target this device's room (read-only), plus a link into the existing
  mode editor to make changes.
  > Socrates: Counter-argument considered: read-only plus a link-out
  > could feel like a half-feature if the user has to leave the card
  > anyway. Resolution: kept as-is — a deliberate choice to avoid a
  > device card silently mutating room-wide mode state (modes target
  > rooms, not single devices), not an oversight.
- [new] User can open a Room card to see every device in that room
  together with its mode-targeting status and current temperature.
  > Socrates: Counter-argument considered: an expanded room view is
  > still list-shaped, which doesn't obviously move away from the
  > list-click pattern that motivated this change. Resolution: kept —
  > the original pain was hopping to a separate screen to see this
  > info; an in-context expansion (even if list-shaped) still removes
  > that navigation, which is the actual win being targeted.
- [new] (nice-to-have) User can view a flow-chart-style visualization of
  a room's devices and the mode(s) acting on them.
  > Socrates: Counter-argument considered: a real diagram feature
  > (layout, edges, interactivity) could balloon past the delivery
  > budget. Resolution: kept, scope-bounded — a simple static
  > grouping/list render of devices plus the modes acting on them, not
  > an interactive diagram editor.
- [preserved] The dashboard grid layout and overall site look.
- [preserved] The Setup/Settings screens.
- [preserved] The existing drag-to-rotate setpoint dial.
- [preserved] The existing drag-reorder-within-room device card ordering.

## Constraints & Compatibility

- **Data migration:** none needed — this change reuses existing
  room/device/automation-mode relationship data; it adds new read paths
  and UI surfacing existing relationships, not a new data contract.
- **Backward compatibility:** no existing external API consumer touches
  this surface, so no compatibility risk.
- **Existing integrations:** none affected.
- **Preserved behavior (explicit):** the dashboard grid layout, the
  overall site look, and the Setup/Settings screens must not regress;
  the existing drag-to-rotate setpoint dial and the existing
  drag-reorder-within-room ordering must not regress.

## Business Logic Changes

**No domain logic change.** This is an infrastructure/UI change — it
only surfaces existing mode-targeting relationships (which mode(s)
target a device's room) in new places: the device card and the room
card. No new decision is computed for the user that doesn't already
exist in the underlying room/mode relationship.

## Access Control Changes

No access control changes — current model preserved: email + password
login, single flat role, all routes gated behind an authenticated
session. This change touches only the per-device and per-room
interaction surface; auth and roles are untouched.

## Non-Goals

- No change to product type (web app) or user base/scale (small,
  2–5 person org).
- Avoid: editing mode membership from the device card — no inline
  room-wide mutation surface at the device level; changes still go
  through the existing mode editor.
- Avoid: redesigning the dashboard grid or Setup/Settings screens — both
  confirmed fine as-is; explicit lock so this work doesn't creep into
  them.

## Open Questions

No open questions — all required PRD elements were captured and
confirmed during shaping (quality cross-check: accepted, no gaps).
