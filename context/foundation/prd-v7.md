---
project: Tuya Device Dashboard
version: 7
status: draft
created: 2026-06-24
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

**System purpose:** A dashboard for monitoring and controlling Tuya-connected
heating devices (sensors/valves); the app's primary purpose is temperature
management.

**Key architecture:**
# TODO: key architecture (monolith / microservices / serverless / etc.) — see Open Questions

**Tech stack:** Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Tuya LAN
polling/control. No SVG/canvas rendering library currently in the stack.

**Current user base:** Facility manager / office administrator, 2–5 person
org, flat single-role access model (email + password login, no roles).

**Core functionality:** Devices are shown grouped by room as cards in a
vertical list/grid, each card showing temperature, online status, setpoint,
a comfort-threshold badge, and an alert-sent indicator. There is no
spatial/visual representation of the physical space today — rooms are named
sections in a list, with no indication of how rooms relate to each other
physically.

## Problem Statement & Motivation

Admins looking at the room list/table can't see how rooms relate to each
other physically — if a room is cold, the table alone doesn't convey that
it's, say, a corner room on a north wall that always cools down. Users
(especially new team members during onboarding) rarely remember which valve
maps to which physical location from its name alone, and with 10–15+ rooms,
scanning a list for warning badges becomes tedious; a spatial view would let
an admin spot the problem area across an entire floor at a glance. Today's
workaround is the existing list/table view — functional, but it requires the
admin to mentally translate device names and row positions into physical
locations.

This change is being made now primarily as a technical-depth showcase
(working with absolute positioning, canvas/SVG-style manipulation, and
drag-and-drop interaction) rather than as a response to an existing,
deeply-felt user complaint. The underlying spatial-context and
naming-recall pains above are real, but proving this kind of UI/rendering
capability is the explicit primary driver for building it now — recorded as
such, not dressed up as discovered user pain.

## User & Persona

**Role:** Facility manager / office administrator — same persona as the
rest of the app, 2–5 person org. No new persona is introduced by this
change.

**Device:** Primarily desktop/wide-viewport. The floor plan itself is
explicitly not optimized for the 375px mobile case; the existing list view
continues to serve mobile.

**Pain moment:** Looking at a multi-room list and needing to mentally
translate device names or row positions into "where in the office is
this" — especially when onboarding a new team member who doesn't yet know
which valve name maps to which physical room, or when scanning many rooms
for which one needs attention.

## Success Criteria

### Primary
The smallest end-to-end slice, proving the whole stack works together:
1. Admin uploads a static floor-plan image (PNG/JPG) via Settings.
2. Admin opens a new "Map View"; the floor plan renders, with a list/drawer
   of devices not yet placed on the map.
3. Admin drags a device icon from that list onto its physical location on
   the floor plan; the position is saved.
4. The placed device renders on the map and visually changes color/glow
   based on live temperature/threshold status (reusing the existing device
   status data — no new data-collection path).
5. Admin clicks the device on the map → opens the existing device
   management modal → adjusts setpoint → closes modal. Same control path
   the list view already uses.

No custom room-drawing tool (no wall-dragging, no grid-snapping) in this
MVP — the floor plan is a static uploaded image; device positions are
simple point-placements on that image, with no understanding of room
geometry.

### Secondary
None for this MVP. A shared layout animation (clicking a device node morphs
into the device modal) was considered and dropped: the implementation
complexity wasn't judged worth it for a nice-to-have. The primary flow is
the whole scope.

### Guardrails
- The core control loop (turning heat on/off, adjusting setpoints) must
  remain fully usable via the existing list/table view even if the
  floor-plan rendering fails (unsupported file, rendering error) — a UI
  failure in the map view must never block critical device control.
- Mobile/375px usability is unaffected — the existing list/table view
  continues to serve mobile; the floor plan is not required to work on
  narrow viewports.
- Accessibility is unaffected — the existing semantic-HTML list/table view
  remains the accessible path; the floor plan is a visual-only addition,
  not a replacement.
- Bulk operations (multi-room actions, sorting by a property) remain
  available via the existing list/table view — the floor plan suits
  single-device, point-in-time interaction, not bulk actions.

## User Stories

### US-01: Admin places a device on the floor plan and controls it spatially

- **Given** an admin has uploaded a floor-plan image for their site and has
  at least one unplaced device
- **When** they drag a device icon onto the floor plan, and later see it
  change color as its temperature crosses a threshold
- **Then** they can click the device node to open the existing setpoint
  control modal and adjust it, exactly as they would from the list view —
  a capability that does not exist today, where devices can only be
  controlled from the list/table view

#### Acceptance Criteria
- A device's map position persists across page reloads
- A floor-plan rendering failure does not prevent setpoint changes via the
  existing list view
- The map view is never required to control a device — the list view
  remains a complete, independent control path
- A placed device can be re-positioned or returned to the unplaced roster
  after initial placement

## Scope of Change

### Navigation
- [new] FR-013: A new "Map View" entry appears in the main left sidebar,
  positioned between the existing "Dashboard" and "Settings" entries,
  navigating to its own page. Priority: must-have.
  > Socrates: Counter-argument considered: this could live as a tab/toggle
  > within the existing Dashboard page instead of a dedicated top-level
  > nav entry, requiring less commitment for a first version. Resolution:
  > kept as written — a dedicated nav entry was the explicit request.

### Floor plan setup
- [new] FR-001: Admin can upload a static floor-plan image (PNG/JPG) for a
  site via Settings; the upload is checked against basic file-type/size
  validation (not a full sanitization/antivirus pipeline). Priority:
  must-have.
  > Socrates: Counter-argument considered: accepting arbitrary image
  > uploads needs real validation/security work, disproportionate to a
  > portfolio feature's entry point. Resolution: kept as must-have, but
  > scoped down to basic file-type/size checks only.

### Device placement
- [new] FR-002: Admin can see a list of devices not yet placed on the map
  (an "unplaced" roster) — this may reuse the existing device list/data,
  filtered to devices with no map position, rather than a new data source.
  Priority: must-have.
  > Socrates: Counter-argument considered: this might just be the existing
  > device list, filtered — not genuinely new UI. Resolution: kept as its
  > own item (the roster-as-distinct-UI-element is new), but it notes it
  > may reuse existing device data rather than implying a new fetch path.
- [new] FR-003: Admin can drag a device icon from the unplaced list and
  drop it onto the floor-plan image; the drop position is persisted as the
  device's map location. If a device is later reassigned to a different
  room/site elsewhere in the app, its map position may become stale —
  accepted as a known MVP limitation, not auto-cleaned. Priority:
  must-have.
  > Socrates: Counter-argument considered: a device's map position could
  > become orphaned/misleading if the device is moved to a different room
  > or site elsewhere in the app. Resolution: accepted as a known MVP
  > limitation rather than building auto-clean logic now.
- [new] FR-004: Admin can re-drag an already-placed device to a new
  position on the map; the updated position is persisted. Priority:
  must-have.
  > Socrates: Counter-argument considered: a true minimal tracer-bullet
  > slice could be placement-only (remove + re-place instead of a
  > dedicated reposition gesture). Resolution: kept as must-have anyway —
  > re-drag is cheap once drag-drop placement exists, and the user had
  > already decided repositioning matters before this round.
- [new] FR-005: Admin can remove a placed device from the map, returning
  it to the unplaced roster. The exact interaction (a dedicated remove
  action, or dragging the device off the floor-plan image) is left to
  downstream design. Priority: must-have.
  > Socrates: Counter-argument considered: dragging a device off the image
  > could itself imply removal, making a separate dedicated "remove"
  > affordance unnecessary. Resolution: kept the capability as must-have;
  > left the exact gesture/affordance open rather than over-specifying a
  > UI mechanism in the PRD.

### Live status & control
- [new] FR-006: A placed device renders on the map at its saved position
  and visually changes color/glow using the exact same OK/Too Cold/Too Hot
  semantics as the existing threshold badge — same thresholds, same
  states, just rendered as a colored map node instead of a badge. Reuses
  the existing device status data; no new data-collection path. Priority:
  must-have.
  > Socrates: Counter-argument considered: the map's color rule was
  > undefined relative to the existing badge — it could have used a
  > different visual rule (e.g. a raw-temperature gradient) and shipped
  > inconsistent status between the map and the existing badge.
  > Resolution: map status explicitly mirrors the existing badge's
  > semantics.
- [new] FR-007: Clicking a placed device on the map opens the existing
  device management modal; setpoint changes there behave exactly as in
  the list view. The map respects the existing site switcher — only
  devices belonging to the currently active site are shown, consistent
  with how the list view already scopes by site. Priority: must-have
  (new entry point into an unchanged modal).
  > Socrates: Counter-argument considered: should the map show all placed
  > devices regardless of the active site filter, since it's a distinct
  > view? Resolution: no — scope to the active site, matching the rest of
  > the app's existing convention.

### Preserved behavior
- [preserved] FR-008: The existing list/table view continues to work
  fully, independent of the floor plan — device control remains available
  there regardless of map state. Priority: must-have.
  > Socrates: Counter-argument considered: this might be trivially true
  > and not worth stating, since nothing in this change touches list-view
  > code. Resolution: kept explicit anyway — this project's convention is
  > to state preserved behavior as defensive guardrails even when
  > "obviously" true, so it's testable in planning rather than assumed.
- [preserved] FR-009: A floor-plan rendering failure (unsupported file,
  rendering error) does not block device control via the list view, and
  shows a visible error state on the Map View itself (pointing the admin
  to the list view) rather than failing silently or showing a
  blank/broken screen. Priority: must-have.
  > Socrates: Counter-argument considered: silently falling back to "the
  > list view still works" might leave the admin confused about why the
  > map looks broken. Resolution: kept the no-blocking guarantee, and
  > added an explicit visible error state requirement.
- [preserved] FR-010: Mobile/375px dashboard usability is unaffected — the
  list view continues to serve mobile without requiring the floor plan to
  work there. Priority: must-have.
  > Socrates: Counter-argument considered: hiding the floor plan entirely
  > on mobile might be too restrictive — a read-only, non-interactive view
  > could still be useful. Resolution: kept as written — list view only on
  > mobile for this MVP, even read-only map support is deferred, to keep
  > scope inside the delivery budget.
- [preserved] FR-011: Bulk operations (multi-room actions, sorting) remain
  available via the existing list/table view. Priority: must-have.
  > Socrates: Counter-argument considered: this might be redundant with
  > FR-008 (list view continues to work, full stop). Resolution: kept as
  > its own explicit item anyway — bulk operations were called out as a
  > distinct must-preserve concern during shaping, separate from "the list
  > view still works" in general.

## Constraints & Compatibility

- **No data migration:** this is purely additive. It adds optional new
  data (a floor-plan reference per site, a placement position per device)
  without altering or reshaping any existing data. A device with no map
  position simply appears in the unplaced roster.
- **No backward-compatibility concerns:** there are no existing external
  integrations, exports, or consumers relying on device/site/room data
  today, so nothing downstream is put at risk by this change.
- Must respect the existing site-scoping convention: the Map View only
  shows devices belonging to the currently active site (FR-007).
- Must not introduce a new device data-collection path — live status on
  the map reuses the existing device status data that already powers the
  list view.
- The existing list/table view, valve control path, mobile experience, and
  accessibility posture must all continue working exactly as today,
  independent of the floor plan's state.

## Business Logic Changes

**No domain logic change.** This is a visualization-layer change: it
renders the existing OK / Too Cold / Too Hot threshold decision spatially,
as a colored map node instead of a badge — it does not decide anything new
for the user. The input (a room/device's current badge state) and the
output (the same three-state classification) are unchanged; only the
presentation surface is new.

## Access Control Changes

No access control changes — current model preserved: email + password
login, single flat role, full access for the one effective user type. The
floor plan (uploading the plan, placing devices) is visible and editable
by the same single role that already has full dashboard access. No new
accounts or roles are introduced by this change.

## Non-Goals

- No change to product type (web app) or user base (small office/admin,
  2–5 person org); this feature doesn't alter either.
- No hard deadline; after-hours-only work, no special delivery-window
  constraints beyond the existing quality gate.
- Avoid: custom room-drawing/wall-snapping tool — the floor plan is a
  static uploaded image; no drawing rooms, no wall-dragging, no
  grid-snapping.
- Avoid: room-boundary parsing of the floor plan — devices are point
  positions on an image; no understanding of actual room shapes/
  boundaries in this MVP.
- Avoid: pan/zoom/gesture controls and full mobile map support — the map
  is desktop/wide-viewport only for this MVP; the existing list view
  continues to serve mobile.
- Avoid: real-time multi-user collaboration — no live cursor tracking or
  broadcasting edits between simultaneous admins.
- Avoid: spatial automation rules — no rules that reason about a device's
  physical proximity to other devices.
- Avoid: thermal heatmap overlay — single-device color status only, no
  merged radial-gradient heatmap visualization.

## Open Questions

1. **What is the current system's key architecture style** (monolith,
   serverless, etc.)? — Not specified in shaping input. Owner: user.
   Block: no (informational; doesn't block FR delivery).
