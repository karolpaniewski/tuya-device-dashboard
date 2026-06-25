---
project: Tuya Device Dashboard
context_type: brownfield
created: 2026-06-25
updated: 2026-06-25
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: change category
      decision: significant feature — new per-device interaction model layered on existing data/control plumbing; dashboard grid and Setup untouched
    - topic: insight
      decision: drag-and-drop already proven elsewhere (floor plan, dial, widget reorder); past polish passes (UX polish, visual/dark-mode redesign, design-system pass) stayed inside the existing list/modal layout without rethinking the device-view interaction model
    - topic: primary persona scope
      decision: unchanged — same facility manager/admin persona, 2-5 person org, single flat role
    - topic: device-card automation edit depth
      decision: read-only mode-targeting view on the device card, with a link/shortcut into the existing mode editor — no new room-wide mutation surface added at the device level
    - topic: card-open gesture
      decision: normal click-to-expand is fine for this slice — premium feel comes from the info shown and visual polish, not a drag/gesture open mechanic
  frs_drafted: 3
  quality_check_status: accepted
---

> Seed idea (verbatim): "premium tuya dashboard" — open-ended, not yet defined

## Current System

The Tuya Device Dashboard is a LAN-only web dashboard replacing one-by-one
Tuya mobile-app device management for a small facility team. It already
has: a dashboard grid (KPI summary row, per-room temperature panels,
drag-and-drop widget/room reordering), a device list/table grouped by
room, a floor-plan map view (drag devices onto a floor-plan image), a
drag-to-rotate thermostat dial replacing +/- setpoint buttons, and a
Settings area covering Rooms/Devices/Automations/Sites CRUD plus
display/threshold preferences.

**Tech stack:** Next.js 15 + React 19, tRPC v11, Drizzle ORM + libsql
(SQLite), Tailwind CSS, NextAuth — a persistent polling worker process
runs alongside the Next.js server, not serverless.

**Users:** Facility manager / office administrator — single flat role,
2–5 person org.

**Pain / gap:** despite several past visual-polish passes (UX polish,
visual/dark-mode redesign, a design-system pass), the app still reads as
a generic "stub site" rather than premium. The deeper gap is the
interaction model on the per-device surface (device card + device
detail/history view): it's still primarily list-click-driven, while
drag/gesture-based direct manipulation already exists and works well
elsewhere in the app (floor-plan placement, the thermostat dial, widget
reordering) — it was never extended to the device view itself.

**Must preserve:**
- The dashboard grid layout and overall site look — confirmed fine as-is,
  out of scope for this change.
- The Setup/Settings screens — confirmed fine as-is, out of scope for
  this change.

## Vision & Problem Statement

**Change:** Redesign the per-device interaction surface — the device
card and its detail/history view — to feel premium: visual polish plus a
drag/gesture-first interaction model, replacing list-click-based actions
where direct manipulation is more natural. This is scoped narrowly to the
device view; the dashboard grid and Setup screens are explicitly
untouched.

**Insight:** Drag-and-drop interaction patterns already exist and work
well elsewhere in this app — floor-plan device placement, the
drag-to-rotate thermostat dial, and dashboard widget/room reordering all
prove the pattern. Past visual-polish passes (UX polish, visual/dark-mode
redesign, a design-system pass) improved colors, icons, and spacing but
never questioned the underlying list-click interaction model for devices
— extending the proven drag pattern to the device view is the natural
next step, not a leap.

## User & Persona

**Role:** Facility manager / office administrator — same persona as the
rest of the app. No new persona; no change to who uses the product or
how they access it.

## Access Control

No changes planned — current model preserved: NextAuth email + password
login, single flat role, all routes gated behind the auth session. This
change touches only the per-device interaction surface; auth and roles
are untouched.

## Success Criteria

### Primary
The smallest end-to-end slice, proving the whole thing works:
1. User opens a device card and sees, read-only, which automation
   mode(s) currently target this device's room (modes are room-scoped,
   not device-scoped — `automationModeTargets.roomId`), plus current
   temperature/state, with a link/shortcut into the existing mode editor
   to actually change anything.
2. User opens a Room card and sees an expanded view listing every device
   in that room together with the same per-device info — mode targeting
   and current temperature.

### Secondary
A flow-chart-style visualization of the devices inside a room (how they
relate — e.g. sensors/valves and the mode(s) acting on them) — nice to
have, not required for the slice to prove itself.

### Guardrails
- The dashboard grid layout and overall site look — confirmed fine,
  out of scope.
- The Setup/Settings screens — confirmed fine, out of scope.
- The existing drag-to-rotate setpoint dial must keep working unchanged.
- The existing drag-reorder-within-room (device card reordering) must
  keep working unchanged.

**Timeline:** within three weeks of after-hours work, confirmed
deliverable at this scope.

## Functional Requirements

- FR-001: User can view, on a device's card, which automation mode(s)
  target this device's room (read-only), plus a link into the existing
  mode editor to make changes. Priority: must-have. Change: new.
  > Socrates: Counter-argument considered: read-only plus a link-out
  > could feel like a half-feature if the user has to leave the card
  > anyway. Resolution: kept as-is — deliberate choice from Phase 3 to
  > avoid a device card silently mutating room-wide mode state (modes
  > target rooms, not single devices), not an oversight.
- FR-002: User can open a Room card to see every device in that room
  together with its mode-targeting status and current temperature.
  Priority: must-have. Change: new.
  > Socrates: Counter-argument considered: an expanded room view is
  > still list-shaped, which doesn't obviously move away from the
  > list-click pattern that motivated this change. Resolution: kept —
  > the original pain was hopping to a separate screen to see this
  > info; an in-context expansion (even if list-shaped) still removes
  > that navigation, which is the actual win being targeted.
- FR-003: User can view a flow-chart-style visualization of a room's
  devices and the mode(s) acting on them. Priority: nice-to-have.
  Change: new.
  > Socrates: Counter-argument considered: a real diagram feature
  > (layout, edges, interactivity) could balloon past the 3-week budget.
  > Resolution: kept, scope-bounded — a simple static grouping/list
  > render of devices + the modes acting on them, not an interactive
  > diagram editor.

The existing drag-to-rotate setpoint dial and drag-reorder-within-room
device ordering must keep working unchanged — captured as Guardrails
above, not restated as separate FRs (would be pure duplication within
this document).

## Business Logic

**No domain logic change.** This change only surfaces existing
mode-targeting relationships (which mode(s) target a device's room) in
new places — the device card and the room card. No new decision is
computed for the user that doesn't already exist in the mode/room data
model.

## Non-Functional Requirements

- Opening a device card or room card to view mode-targeting and
  temperature info feels instant — no visible loading spinner/delay,
  since the underlying data is already in memory/cached by the existing
  polling and mode-query paths.

## Constraints & Preserved Behavior

- **No schema or migration needed:** this change reuses existing data
  (`automationModeTargets`, room, and device tables) — it's new read
  queries and UI surfacing existing relationships, not a new data
  contract.
- **No backward-compatibility risk:** no existing external API consumer
  touches this surface.
- The dashboard grid layout, overall site look, and Setup/Settings
  screens (already named in Guardrails) must not regress.
- The existing drag-to-rotate setpoint dial and drag-reorder-within-room
  ordering (already named in Guardrails) must not regress.

## Non-Goals

- No change to product type (web app) or user base/scale (small,
  2–5 person org).
- Avoid: editing mode membership from the device card — matches the
  read-only + link-out decision (FR-001); no inline room-wide mutation
  surface at the device level.
- Avoid: redesigning the dashboard grid or Setup/Settings screens —
  both confirmed fine as-is; explicit lock so this work doesn't creep
  into them.

## Quality cross-check

All elements present — no gaps to record:
- Access Control: present (no changes; current model preserved)
- Business Logic: present (one-sentence rule: no domain logic change)
- Project artifacts: present
- Timeline-cost ack: present (3 weeks, within the 3-week budget — no
  acknowledgment block needed)
- Non-Goals: present (3 entries)
- Preserved behavior: present (dashboard grid, Setup screens, setpoint
  dial, and drag-reorder named explicitly as must-not-break)

## User Stories

### US-01: Facility admin checks a device's automation without leaving the device card

- **Given** a device belongs to a room that one or more modes target
- **When** the admin opens that device's card
- **Then** they see which mode(s) target the room and the device's
  current temperature/state, with a link to the mode editor if they want
  to change anything — without navigating away to a separate screen first
