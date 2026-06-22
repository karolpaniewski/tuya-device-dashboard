---
project: Tuya Device Dashboard
context_type: brownfield
created: 2026-06-22
updated: 2026-06-22
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 1
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 6
  quality_check_status: accepted
---

> Seed idea: S-20 from the roadmap — "one-click 'turn off heat in room X'
> quick action on the dashboard — closes the valve (DP `valve_state`)
> directly, independent of setpoint; manual action overrides automation,
> which may re-engage on its next tick." Prerequisites: S-01
> (live-device-overview), S-04 (valve-setpoint-control), S-11
> (automation-rules). Roadmap flags this `needs-shaping` — the toggle
> granularity and undo semantics are open.

## Current System

Dashboard (`/`) shows live devices grouped by room (S-01) with online/offline
status and temperature. Heat control today exists only as per-device valve
setpoint control (S-04) — opened via a device modal, admin adjusts a target
temperature number. Automation rules (S-11) can also drive setpoints on a
schedule. No room-level on/off action exists anywhere today; turning heat
off in a room means manually opening each valve device and lowering its
setpoint.

Stack: Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Tuya LAN
polling/control via the same DP-based valve mechanism S-04 already uses —
unchanged, no new stack needed.

Users: facility manager / office administrator — same persona as the rest
of the app, flat single-admin identity model (NextAuth email + password,
no roles).

**Must preserve:**
- Manual off pins the room off indefinitely — automation (S-11) must not
  silently re-engage a manually-off room; it stays off until a human
  manually turns heat back on.
- Existing setpoint control (S-04) and automation rules (S-11) continue to
  work unchanged for rooms that haven't been manually toggled off.

## Vision & Problem Statement

Turning off heat in a room today requires opening that room's valve device
and manually lowering its setpoint — a precision tool repurposed for a
binary decision. There's no fast way to react to "someone's staying late
in one room" or "we're leaving early, kill heat everywhere" — situations
that need an immediate room-level on/off, not a temperature adjustment.

**Change:** Add a one-click per-room heat on/off action to the dashboard.
"Off" closes the valve directly (independent of setpoint) and pins the
room off — automation rules do not re-engage it until a human manually
turns heat back on. This is a missing capability, not a UX refinement:
automation (S-11) handles the routine schedule, but cannot react to
ad-hoc same-day situations a facility manager needs to handle in the
moment.

**Insight:** The existing setpoint UI was built for precision ("set this
room to 21°C"), not for the speed this scenario needs ("kill heat in 2
seconds before I leave"). Automation's schedule-based model can't
represent "off, starting now, until someone says otherwise" — that state
doesn't exist in the system today.

## User & Persona

**Role:** Facility manager / office administrator (2–5 person org) — same
persona as the rest of the app, no new persona introduced.
**Device:** Desktop browser (primary), mobile (secondary — S-08 already
shipped, must not regress for a quick-action button).
**Pain moment:** Two concrete situations: (1) someone is staying late in
a single room while the rest of the office is empty — they want to keep
that one room warm and kill heat elsewhere without touching automation
rules; (2) leaving the office early and wanting to kill heating
immediately, before automation's scheduled off-time would normally
trigger.

## Access Control

No changes planned — current model preserved: NextAuth email + password
login, single flat role, full access for the one effective user type. Any
admin can toggle any room's heat; no role boundary is introduced by this
work.

## Success Criteria

### Primary
Admin opens the dashboard and sees a heat on/off toggle on every room
card. Clicking it off closes that room's valve directly (independent of
setpoint); the room is pinned off and automation (S-11) skips it on
subsequent ticks. Clicking it on again releases the pin and resumes
normal setpoint/automation control.

### Secondary
The room card visually distinguishes "manually pinned off" from any other
off/cold state, so an admin can tell at a glance which rooms were
deliberately overridden versus just naturally cold or offline.

### Guardrails
- Existing setpoint control (S-04) and automation rules (S-11) continue
  working unchanged for any room that hasn't been manually toggled off.
- The room health badge (OK / Too Cold / Too Hot, S-05) continues to
  reflect actual temperature normally — a manually-off room that cools
  down still shows Too Cold; no new suppression logic is introduced.
- Mobile/375px viewport support (S-08) does not regress — the toggle must
  be usable at that breakpoint.

**Timeline:** well under 3 weeks of after-hours work — a single toggle
button, one DP mutation, and one persisted per-room flag.

## Functional Requirements

### Heat toggle

- FR-001: Admin can toggle a room's heat on/off via a button on that room's
  dashboard card. Priority: must-have. Change: new.
  > Socrates: Counter-argument considered: the room card is already crowded
  > (status, temperature, badge, setpoint control) — adding a toggle risks
  > clutter and accidental taps. Resolution: require a confirm step before
  > the toggle actually turns heat off (e.g. a brief inline confirm), trading
  > one extra click for protection against mis-taps. The FR is revised to
  > include this confirm step.

- FR-002: Toggling a room's heat off closes that room's valve directly,
  independent of setpoint, and pins it off indefinitely until a human
  manually toggles it back on. Priority: must-have. Change: new.
  > Socrates: Counter-argument considered: pinning heat off indefinitely
  > risks freeze damage if forgotten during cold weather. Resolution:
  > accepted as a deliberate tradeoff — matches the user's explicit "off is
  > off until manually turned back on" requirement. No safety floor or
  > auto-release is introduced; this is the admin's responsibility. FR
  > stands as written.

- FR-003: Automation rules (S-11) skip a manually-pinned-off room on every
  tick until the pin is released. Priority: must-have. Change: modified.
  > Socrates: Counter-argument considered: a silent skip could surprise the
  > admin, especially if a room stays pinned off across multiple days and
  > the reason is forgotten. Resolution: rely on the visual indicator
  > (FR-004) as the only signal — no additional notification or reminder is
  > introduced, keeping scope tight. FR stands as written.

### Visual feedback

- FR-004: The room card shows a distinct visual indicator (e.g. "Room X has
  manually toggled heating off") when a room is pinned off, separate from
  the existing health badge. Priority: must-have. Change: new.
  > Socrates: Counter-argument considered: a yellow indicator may collide
  > with existing badge colors (OK/Too Cold/Too Hot, S-05), causing visual
  > confusion rather than clarity. Resolution: the exact color is resolved
  > at implementation/design time, choosing a value that doesn't collide
  > with existing badge colors — the requirement is "a distinct indicator,"
  > not a specific color. FR stands as written with this clarification.

### Preserved behavior

- FR-005: The room health badge (OK / Too Cold / Too Hot, S-05) continues
  to reflect actual temperature normally for a manually-pinned-off room — no
  new suppression or relabeling logic is introduced. Priority: must-have.
  Change: preserved.
  > Socrates: Counter-argument considered: a "Too Cold" badge on a room the
  > admin deliberately turned off could read as an alarm rather than an
  > expected state. Resolution: accepted — the badge logic is genuinely
  > unchanged (already true today for any cold/offline room), and the
  > manually-off indicator (FR-004) sits alongside it to supply the missing
  > context. FR stands as written.

- FR-006: Existing setpoint control (S-04) continues to work unchanged for
  any room that hasn't been manually toggled off. For a room that IS
  currently pinned off, setpoint edits are accepted and saved but remain
  inert — the valve stays closed and the pin stays active — until the
  on/off toggle is used to release the pin. Priority: must-have. Change:
  modified.
  > Socrates: Counter-argument considered: if setpoint editing has no
  > effect while pinned off, does that look broken to the admin? The
  > alternative — treating a setpoint edit as an implicit "turn heat back
  > on" — risks accidentally releasing a pin via an unrelated edit.
  > Resolution: setpoint changes on a pinned-off room are inert until
  > released; only the toggle itself releases the pin. Keeps "off is off"
  > unambiguous regardless of what else changes. FR stands as written.

## User Stories

### US-01: Toggling heat off in a room

- **Given** an admin viewing the dashboard with a room card showing live
  status
- **When** they click the heat toggle on a room's card and confirm
- **Then** that room's valve closes immediately, the room is pinned off,
  the card shows the manually-off indicator, automation skips that room on
  subsequent ticks, and the health badge continues to reflect actual
  temperature normally

#### Acceptance Criteria
- Toggling off requires a confirm step before the valve closes
- The valve close is independent of the room's current setpoint value
- The pin persists across page reloads and automation ticks until a human
  toggles the room back on
- Editing setpoint while pinned off is accepted but has no effect on the
  valve until the pin is released
- The manually-off indicator is visually distinct from the OK/Too
  Cold/Too Hot health badge

## Business Logic

**A manual heat pin always takes precedence over automation: once a room
is manually toggled off, automation (S-11) treats it as out of scope on
every tick until a human releases the pin.**

This is a new rule, not a modification to automation's existing schedule
logic — today automation is the only thing driving valve state on a
schedule, with no concept of an override. This change introduces a
precedence layer above it: the manual pin is the input, "skip this room"
is automation's output for as long as the pin holds, and the admin
encounters it by seeing automation simply not act on a pinned room — no
schedule rewrite, no automation-rule edit, just a state automation checks
before acting.

## Non-Functional Requirements

- Clicking the heat toggle produces visible feedback (confirm step, then
  off-state reflected on the card) within roughly 1 second — matching the
  "kill heat in 2 seconds before I leave" urgency from the original pain
  moment.
- Mobile/375px viewport support (S-08) does not regress for the toggle or
  the manually-off indicator (restated from the Guardrails above as a
  measurable property).

## Constraints & Preserved Behavior

- Must respect the existing Tuya DP `valve_state` contract — the toggle
  uses the same DP-based valve control S-04 already uses; no new device
  protocol is introduced.
- Existing setpoint control (S-04) and automation rules (S-11) continue to
  work unchanged for any room that hasn't been manually toggled off (see
  FR-006).
- No backward-compatibility concerns beyond the DP contract above — no
  external API consumers or other integrations touch valve state today.

## Non-Goals

- No change — existing product type (web app) and existing user base
  (small office/admin, 2–5 person org) — this change doesn't introduce a
  new product surface or open the system to new users.
- Avoid: bulk/whole-building toggle. This change is strictly per-room, one
  click per card — a "turn off heat everywhere" master switch is a
  different feature, not part of this MVP.

No hard deadline; after-hours work, well under 3 weeks (already recorded
in Success Criteria / `timeline_budget.delivery_weeks`).
