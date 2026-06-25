---
project: Tuya Device Dashboard
version: 5
status: draft
created: 2026-06-22
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

# TODO: one-sentence system purpose statement — see Open Questions

# TODO: key architecture style (monolith / microservices / serverless / other) — see Open Questions

Tech stack: Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Tuya LAN
polling/control via a DP-based valve mechanism.

Current user base: facility manager / office administrator — flat
single-admin identity model (no roles), small office (2–5 person org).

Core functionality today:
- Automation rules (S-11) are scoped per-device: each rule pairs a
  day/time schedule with a temperature threshold and links one sensor to
  one valve. Rules were built one device at a time because that's how
  setpoint control (S-04) already worked.
- A per-room manual heat on/off toggle (room-heat-toggle) pins a room's
  valve off independently of setpoint and automation, until a human
  releases the pin. Automation already skips a manually-pinned-off room
  on every tick.

Must preserve (carried into this change): the manual heat-off pin
continues to override any new automation model — a manually-pinned-off
room stays off regardless of scenes/modes, exactly as it does today.
Continuity of the existing per-device rule data through this change is
explicitly NOT a preservation requirement — the old rule shape is
expected to be superseded, not kept running in parallel.

## Problem Statement & Motivation

Automation rules are scoped per-device, not per-situation. This causes
three compounding problems:

- **Changing many devices for one situation.** A real-world situation
  like "everyone's leaving early" or "weekend, no one's in" requires
  editing or toggling each device's rule individually instead of flipping
  one switch.
- **Rules drift out of sync.** Rules set up once per device no longer
  reflect how each room is actually used today, and it's hard to tell
  which rules are stale.
- **Can't express the situations that matter.** The day/time +
  temperature-threshold shape can't represent the actual scenarios (away
  mode, holiday, an event in one room) at all, regardless of how many
  per-device rules are created.

Current workaround and its cost: an admin reacts to a situation by
hunting down and editing/toggling several per-device rules that have
likely drifted out of sync with how the room is actually used — and even
then, the rule shape can't represent the situation being reacted to.

# TODO: why this change is needed now (trigger event, business pressure, or user feedback that prompted this rework, as distinct from the standing pain above) — see Open Questions

**Insight:** Today's rules were scoped device-by-device because that's
how setpoint control (S-04) already worked — automation inherited that
granularity without anyone asking what situation it should actually be
automating for. A scene/mode model starts from the situation (away,
night, event) and fans out to devices, instead of starting from the
device and hoping the situations line up.

## User & Persona

**Role:** Facility manager / office administrator (2–5 person org) — same
persona as the rest of the app, no new persona introduced by this
change.

**Device:** Desktop browser (primary), mobile (secondary — must not
regress).

**Pain moment:** Needing to react to a situation (leaving early, a
weekend, a one-room event) and instead of flipping one switch, having to
hunt down and edit/toggle several per-device rules that have likely
drifted out of sync with how the room is actually used — and even then,
the day/time + temperature-threshold shape can't represent the situation
being reacted to.

## Success Criteria

### Primary
Admin creates a named mode (e.g. "Away"), assigns which rooms/devices the
mode controls and an on/off target state for each (e.g. valve closed),
and attaches a day/time schedule to it (or triggers it manually).
Automation then acts via that mode — on schedule or on manual trigger —
instead of the old per-device rules, while still respecting the manual
heat-off pin: a manually-pinned-off room stays off regardless of any
mode.

### Secondary
Admin can preview what a mode would do (which rooms/devices, what target
state) before it actually triggers or goes live on a schedule.

### Guardrails
- The manual heat-off pin continues to take precedence over any mode — a
  pinned-off room is skipped by every mode, the same way it's skipped by
  today's per-device rules.
- Mobile/375px viewport support (S-08) does not regress — mode creation,
  management, and triggering must remain usable at that breakpoint.
- The room health badge (OK / Too Cold / Too Hot, S-05) continues to
  reflect actual temperature normally, unaffected by which mode is
  active.
- A manually triggered mode visibly takes effect within roughly 1 second
  — matching the existing manual heat-off toggle's responsiveness bar.

Timeline: roughly three weeks of after-hours work — mode
creation/management UI, room/device assignment with target states,
scheduling, manual trigger, and cutting automation over from per-device
rules to modes.

## User Stories

### US-01: Activating a mode

- **Given** an admin viewing the dashboard
- **When** they create a mode, assign rooms/devices with target states,
  and attach a schedule (or trigger it manually)
- **Then** the mode activates at the scheduled time (or immediately on
  manual trigger), sets each assigned room/device to its target state,
  skips any room that is currently manually pinned off, and the old
  per-device rule no longer runs for that room — a difference from
  today, where each device's rule runs independently with no situational
  grouping

#### Acceptance Criteria
- A mode's schedule fires automatically at the configured day/time
- Manual trigger activates the mode immediately, and wins over an active
  schedule-driven state until the next schedule tick
- Target states assigned to rooms/devices within a mode are on/off only,
  not arbitrary setpoints
- A manually triggered mode visibly takes effect within roughly 1 second
- A manually-pinned-off room is skipped by the mode, the same way it's
  skipped by today's per-device rules — surfaced only via the existing
  manually-off indicator, no new mode-specific messaging
- Existing per-device rules are surfaced as reference during mode setup
  and deleted only after an explicit confirm step
- Once cutover is confirmed, the old per-device rule for a room no longer
  drives that room's valve

## Scope of Change

- [new] Admin can create a named mode, assigning which rooms/devices it
  controls and an on/off target state for each — not an arbitrary
  setpoint. (FR-001)
  > Socrates: Counter-argument considered: allowing full setpoint control
  > per mode would duplicate the existing setpoint UI and add complexity.
  > Resolution: v1 mode target states are on/off only; arbitrary setpoint
  > targets are out of scope.
- [new] Admin can edit an existing mode's name, room/device assignments,
  and target states. (FR-002)
  > Socrates: Counter-argument considered: editing could be replaced by
  > delete-and-recreate, or editing an active mode could be risky.
  > Resolution: none strong enough to drop edit; stands as written.
- [new] Admin can delete a mode. Deleting a mode that is currently active
  or scheduled immediately stops it from controlling its rooms — those
  rooms revert to no automation (no mode acting on them) until a new
  mode is created. (FR-003)
  > Socrates: Counter-argument considered: deleting an active/scheduled
  > mode could leave its rooms in an undefined state. Resolution: rooms
  > revert to no automation on delete — explicit, not undefined.
- [new] Admin can attach a recurring day/time schedule to a mode so it
  activates automatically. (FR-004)
  > Socrates: Counter-argument considered: scheduling is the riskiest,
  > most complex part of this rework — v1 could ship manual-trigger-only
  > and add scheduling in v2. Resolution: kept in v1 as written — the old
  > per-device rules were schedule-based, so cutover needs a real
  > schedule-based replacement, not just manual trigger.
- [new] Admin can manually trigger a mode immediately, outside its
  schedule. If a manual trigger fires while a schedule-driven mode is
  already active for the same room, the manual trigger wins until the
  next scheduled change takes over. (FR-005)
  > Socrates: Counter-argument considered: manual trigger could collide
  > with an active schedule with no defined precedence. Resolution:
  > manual trigger always wins until the next schedule tick.
- [modified] Automation acts via modes — scheduled or manually triggered
  — instead of the old per-device rules; activating a mode sets each
  assigned room/device to its target state. A room with no mode assigned
  has zero automation, by design — same as an unconfigured room today; no
  fallback is introduced. (FR-006, was: automation drives valves via
  independent per-device day/time + temperature-threshold rules)
  > Socrates: Counter-argument considered: an unassigned room silently
  > loses all scheduled control, a regression risk if the admin forgets
  > to assign it. Resolution: accepted as a deliberate v1 tradeoff — zero
  > automation for an unassigned room mirrors today's behavior for a room
  > with no rule; no warning/fallback mechanism is introduced.
- [modified] A mode skips any room that is currently manually pinned off;
  the pin takes precedence over mode activation, the same way it takes
  precedence over today's per-device rules. No new mode-specific UI
  messaging is introduced — the existing manually-off indicator is the
  only signal. (FR-007, was: per-device rules skip a manually-pinned-off
  room)
  > Socrates: Counter-argument considered: a silent skip could read as a
  > bug in the new mode rather than expected pin precedence, especially
  > during testing. Resolution: rely on the existing manually-off
  > indicator as sufficient context — no new mode-specific messaging.
- [removed] Existing per-device automation rules are surfaced as
  reference during mode setup (so the admin can see what they're
  replacing), then deleted only after an explicit confirm step — not
  silently or automatically. No migration to modes, no parallel
  operation after confirm. (FR-008)
  > Socrates: Counter-argument considered: silently deleting carefully
  > tuned existing rules with no review step risks losing real, working
  > configuration. Resolution: show existing rules during mode setup as
  > reference, delete only after an explicit confirm step.
- [new] Admin can preview what a mode would do (which rooms/devices, what
  target state) before triggering it or before it goes live on a
  schedule. Priority: nice-to-have. (FR-009)
  > Socrates: Counter-argument considered: preview may duplicate the
  > mode-creation/edit screen, which already shows rooms/devices and
  > target states. Resolution: kept as nice-to-have anyway — a dedicated
  > preview is still considered worth having even with the overlap.
- [preserved] The manual heat-off pin continues to take precedence over
  any mode — a pinned-off room is skipped by every mode, the same way
  it's skipped by today's per-device rules.
- [preserved] The room health badge (OK / Too Cold / Too Hot, S-05)
  continues to reflect actual temperature normally, unaffected by which
  mode is active.
- [preserved] Mobile/375px viewport support (S-08) does not regress for
  mode creation, management, or triggering.

## Constraints & Compatibility

- Backward compatibility: must respect the existing device-control
  contract (the same valve-state mechanism the existing setpoint control,
  S-04, and the manual heat-off toggle, room-heat-toggle, already use) —
  no new device protocol is introduced.
- Data migration: none. Existing per-device rules are not converted into
  modes. They're surfaced as reference during mode setup, then deleted on
  an explicit confirm step — modes start from an empty slate. No rollback
  plan is needed since there is no schema migration of rule data.
- Existing integrations that must continue working: the device-control
  contract used by today's setpoint control and manual heat-off toggle.
- Preserved behavior (explicitly named):
  - The manual heat-off pin continues to take precedence over any mode,
    exactly as it does over today's per-device rules.
  - No external API consumers or other integrations touch valve state
    today, so no backward-compatibility concerns exist beyond the
    device-control contract above.

## Business Logic Changes

**Current rule:** Automation drives a room's valve according to a
per-device day/time + temperature-threshold schedule, unless that room
is manually pinned off, in which case automation skips it.

**Change:** Automation now drives valves via named modes — each grouping
a set of rooms/devices with an on/off target state and a day/time
schedule (or manual trigger) — replacing the old per-device schedule; the
manual-pin precedence is unchanged.

This modifies the existing rule rather than introducing an unrelated one.
The change groups the schedule by situation (a named mode covering
several rooms/devices at once) instead of by individual device, and
narrows the per-mode target to a simple on/off state. The admin
encounters this as: instead of editing N device rules to react to a
situation, they flip one mode; the manual-pin precedence that already
exists is untouched by this change.

## Access Control Changes

No access control changes — current model preserved: single flat admin
role, full access for the one effective user type. Any admin can create,
edit, and trigger any mode; no role boundary is introduced by this
change.

## Non-Goals

- No change to product type (web app) or user base (small office/admin,
  2–5 person org) — this change doesn't introduce a new product surface
  or open the system to new users.
- No hard deadline beyond the already-recorded 3-week after-hours
  estimate; no additional deployment/CI/CD constraint beyond what's in
  Constraints & Compatibility.
- Avoid: arbitrary setpoint targets in modes. Modes set rooms/devices
  on/off only — a specific temperature target per mode is a different,
  larger feature, not part of this change.
- Avoid: overlapping-mode conflict-resolution UI. Beyond "manual trigger
  wins until the next schedule tick," no dedicated UI for detecting or
  resolving overlapping mode schedules on the same room is built in this
  change.

## Open Questions

1. **What is the one-sentence system purpose statement for Current System
   Overview?** — TBD by user. Block: no (architecture and tech stack are
   otherwise documented).
2. **What is this system's key architecture style (monolith /
   microservices / serverless / other)?** — TBD by user. Block: no.
3. **Why is this rework needed now, as distinct from the standing pain
   it addresses?** (trigger event, business pressure, or user feedback
   that prompted starting this specific change at this time) — TBD by
   user. Block: no.
