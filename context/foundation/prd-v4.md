---
project: "Tuya Device Dashboard — S-20 Room Heat Toggle"
version: 4
status: draft
created: 2026-06-22
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

**System purpose:** A LAN-only web dashboard for a small facility-management team to monitor and control networked climate devices (temperature sensors, heating valves) across rooms.

**Key architecture:** Next.js 15 web app with a tRPC v11 API layer, Drizzle ORM over a SQLite (libsql) database, and a polling/control mechanism for LAN-connected Tuya devices.

**Tech stack:** Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Tuya LAN device polling/control via DP (data-point) codes.

**Current user base:** Facility manager / office administrator, small office (2–5 person org), single flat admin identity — no role separation.

**Core functionality today:** The dashboard shows live devices grouped by room with online/offline status and temperature. Heat control exists only as per-device valve setpoint control — opened via a device modal, where the admin adjusts a target temperature number. Automation rules can also drive setpoints on a schedule. No room-level on/off action exists anywhere today; turning heat off in a room means manually opening each valve device and lowering its setpoint.

## Problem Statement & Motivation

Turning off heat in a room today requires opening that room's valve device and manually lowering its setpoint — a precision tool repurposed for a binary decision. There's no fast way to react to "someone's staying late in one room" or "we're leaving early, kill heat everywhere" — situations that need an immediate room-level on/off, not a temperature adjustment.

This is needed now because these are recurring, ad-hoc, same-day situations a facility manager has to handle in the moment — automation handles the routine schedule but cannot react to them. The current workaround (opening each device modal and lowering the setpoint) is slow and imprecise for what is fundamentally a binary decision: the existing setpoint UI was built for precision ("set this room to 21°C"), not for the speed this scenario needs ("kill heat in 2 seconds before I leave"). Automation's schedule-based model can't represent "off, starting now, until someone says otherwise" — that state doesn't exist in the system today.

## User & Persona

**Role:** Facility manager / office administrator (2–5 person org) — same persona as the rest of the app; no new persona is introduced by this change.

**Device:** Desktop browser (primary), mobile (secondary — existing mobile support must not regress for this new quick-action control).

**Pain moment (existing users, new capability):** Two concrete situations: (1) someone is staying late in a single room while the rest of the office is empty — the admin wants to keep that one room warm and kill heat elsewhere without touching automation rules; (2) leaving the office early and wanting to kill heating immediately, before automation's scheduled off-time would normally trigger.

## Success Criteria

### Primary
Admin opens the dashboard and sees a heat on/off toggle on every room card. Clicking it off closes that room's valve directly (independent of setpoint); the room is pinned off and automation skips it on subsequent ticks. Clicking it on again releases the pin and resumes normal setpoint/automation control.

### Secondary
The room card visually distinguishes "manually pinned off" from any other off/cold state, so an admin can tell at a glance which rooms were deliberately overridden versus just naturally cold or offline.

### Guardrails
- Existing setpoint control and automation rules continue working unchanged for any room that hasn't been manually toggled off.
- The existing room health badge (OK / Too Cold / Too Hot) continues to reflect actual temperature normally — a manually-off room that cools down still shows Too Cold; no new suppression logic is introduced.
- Existing mobile viewport support does not regress — the toggle must be usable at that breakpoint.
- Clicking the heat toggle produces visible feedback (confirm step, then off-state reflected on the card) within roughly 1 second, matching the urgency of the pain moment this change addresses.

## User Stories

### US-01: Toggling heat off in a room

- **Given** an admin viewing the dashboard with a room card showing live status
- **When** they click the heat toggle on a room's card and confirm
- **Then** that room's valve closes immediately, the room is pinned off, the card shows the manually-off indicator, automation skips that room on subsequent ticks, and the health badge continues to reflect actual temperature normally

What's different before vs. after: today there is no room-level toggle at all — the only way to affect heat is opening a device modal and adjusting setpoint, which does not pin anything off or interact with automation's scheduling.

#### Acceptance Criteria
- Toggling off requires a confirm step before the valve closes
- The valve close is independent of the room's current setpoint value
- The pin persists across page reloads and automation ticks until a human toggles the room back on
- Editing setpoint while pinned off is accepted but has no effect on the valve until the pin is released
- The manually-off indicator is visually distinct from the OK/Too Cold/Too Hot health badge

## Scope of Change

- [new] Admin can toggle a room's heat on/off via a button on that room's dashboard card; turning off requires a confirm step before the valve actually closes (protects against accidental taps on an already-busy card). Priority: must-have.
  > Socrates: Counter-argument considered: the room card is already crowded (status, temperature, badge, setpoint control) — adding a toggle risks clutter and accidental taps. Resolution: require a confirm step before the toggle actually turns heat off, trading one extra click for protection against mis-taps.

- [new] Toggling a room's heat off closes that room's valve directly, independent of setpoint, and pins it off indefinitely until a human manually toggles it back on. Priority: must-have.
  > Socrates: Counter-argument considered: pinning heat off indefinitely risks freeze damage if forgotten during cold weather. Resolution: accepted as a deliberate tradeoff — matches the explicit requirement that "off is off until manually turned back on." No safety floor or auto-release is introduced; this is the admin's responsibility.

- [modified] Automation rules skip a manually-pinned-off room on every tick until the pin is released — today automation has no concept of an override and always acts on schedule. Priority: must-have.
  > Socrates: Counter-argument considered: a silent skip could surprise the admin, especially if a room stays pinned off across multiple days and the reason is forgotten. Resolution: rely on the visual indicator as the only signal — no additional notification or reminder is introduced, keeping scope tight.

- [new] The room card shows a distinct visual indicator (e.g. "Room X has manually toggled heating off") when a room is pinned off, separate from the existing health badge. Priority: must-have.
  > Socrates: Counter-argument considered: a colored indicator may collide with the existing health-badge colors, causing visual confusion rather than clarity. Resolution: the exact visual treatment is resolved at implementation/design time, choosing a value that doesn't collide with existing badge colors — the requirement is "a distinct indicator," not a specific color.

- [preserved] The room health badge (OK / Too Cold / Too Hot) continues to reflect actual temperature normally for a manually-pinned-off room — no new suppression or relabeling logic is introduced. Priority: must-have.
  > Socrates: Counter-argument considered: a "Too Cold" badge on a room the admin deliberately turned off could read as an alarm rather than an expected state. Resolution: accepted — the badge logic is genuinely unchanged (already true today for any cold/offline room), and the manually-off indicator supplies the missing context.

- [modified] Existing setpoint control continues to work unchanged for any room that hasn't been manually toggled off. For a room that IS currently pinned off, setpoint edits are accepted and saved but remain inert — the valve stays closed and the pin stays active — until the on/off toggle is used to release the pin. Priority: must-have.
  > Socrates: Counter-argument considered: if setpoint editing has no effect while pinned off, does that look broken to the admin? The alternative — treating a setpoint edit as an implicit "turn heat back on" — risks accidentally releasing a pin via an unrelated edit. Resolution: setpoint changes on a pinned-off room are inert until released; only the toggle itself releases the pin, keeping "off is off" unambiguous regardless of what else changes.

## Constraints & Compatibility

- Must continue using the same device-control mechanism that existing valve setpoint control already uses — no new device integration or protocol is introduced.
- Existing setpoint control and automation rules continue to work unchanged for any room that hasn't been manually toggled off.
- No backward-compatibility concerns beyond the above — no external consumers or other integrations touch valve state today.
- Manual-off must pin the room off indefinitely; automation must not silently re-engage a manually-off room — it stays off until a human manually turns heat back on.

## Business Logic Changes

**A manual heat pin always takes precedence over automation: once a room is manually toggled off, automation treats it as out of scope on every tick until a human releases the pin.**

This is a new rule, not a modification to automation's existing schedule logic — today automation is the only thing driving valve state on a schedule, with no concept of an override. This change introduces a precedence layer above it: the manual pin is the input, "skip this room" is automation's output for as long as the pin holds, and the admin encounters it by seeing automation simply not act on a pinned room — no schedule rewrite, no automation-rule edit, just a state automation checks before acting.

## Access Control Changes

No access control changes — current model preserved: existing email + password login, single flat role, full access for the one effective user type. Any admin can toggle any room's heat; no role boundary is introduced by this work.

## Non-Goals

- No change to existing product type (web app) or existing user base (small office/admin, 2–5 person org) — this change doesn't introduce a new product surface or open the system to new users.
- No bulk/whole-building toggle. This change is strictly per-room, one click per card — a "turn off heat everywhere" master switch is a different feature, not part of this MVP.

## Open Questions

None — all gaps surfaced during shaping (room-card crowding, freeze risk, silent automation skip, indicator color collision, badge alarm-reading, and setpoint-while-pinned behavior) were resolved through the Socrates challenge round; see the `> Socrates:` notes under `## Scope of Change` for each resolution.
