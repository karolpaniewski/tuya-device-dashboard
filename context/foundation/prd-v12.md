---
project: "Tuya Device Dashboard"
version: 12
status: draft
created: 2026-07-01
context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 2
  hard_deadline: null
  after_hours_only: true
---

# PRD: Tuya Device Dashboard — Comfort Compliance Ranking

## Current System Overview

Tuya Device Dashboard is a LAN-only web dashboard for facility management,
replacing per-device use of the Tuya mobile app.

- **System purpose:** monitor and control Tuya smart devices (heating valves,
  temperature sensors) across rooms and sites from a single fleet view,
  without an internet connection.
- **Key architecture:** Next.js App Router web app with a tRPC API layer; a
  persistent LAN-polling process feeds live device state.
- **Tech stack:** Next.js 15 / React 19, tRPC v11, Drizzle ORM + libsql
  (SQLite), NextAuth v5.
- **Current user base:** a small facility management team (2–5 people).
- **Core functionality today:** live device overview grouped by room, room
  assignment setup, device filter/search, valve setpoint control, per-room
  comfort thresholds with a live OK / Too Cold / Too Hot status badge, and
  per-device/per-room temperature history charts.

## Problem Statement & Motivation

The live comfort-status badge shows a room's state right now, and the
temperature-history charts show a room's readings over time — but there's no
way to see which rooms are chronically problematic. Staff can only tell
"room 3 has been too cold 40% of the time this week" by manually eyeballing
history charts room by room; there is no aggregated, ranked view of comfort
performance across rooms.

This gap only became visible after both the live-status badge and the
history charts were in real use — each is useful on its own, but neither
answers "which room needs attention first" over a time window. The current
workaround is manual, room-by-room chart inspection, which does not scale
past a handful of rooms and produces no ranked priority list.

## User & Persona

Primary persona: the facility manager role within the team — the person
responsible for comfort/complaints — who checks this periodically, distinct
from day-to-day device operators adjusting setpoints in the moment. No new
persona is introduced; this serves an existing dashboard user in a new way.

## Success Criteria

### Primary
- A new panel on the main dashboard ranks all rooms worst-to-best by % of
  time spent outside their comfort threshold over the trailing 7 days.
- Clicking a room in the ranking jumps to its existing detail/history view.

### Secondary
- # TODO: secondary success criterion — see Open Questions

### Guardrails
- Existing per-room threshold configuration and temperature-history charts
  continue to work unchanged — this feature is purely additive and
  read-only; it must not write to or alter existing threshold/history data
  flows.
- The 7-day compliance computation must not noticeably degrade main
  dashboard load time.

## User Stories

### US-01: Facility manager views the comfort compliance ranking

- **Given** a logged-in facility manager on the main dashboard
- **When** the comfort compliance panel loads
- **Then** rooms are shown ranked worst-to-best by % time out of threshold
  over the last 7 days, and clicking a room navigates to its existing
  detail/history view

#### Acceptance Criteria
- A room with no assigned sensors shows as "no data" rather than 0% or an
  error
- The ranking always reflects the current rolling 7-day window; it never
  shows results from a stale, previously computed window
- Each ranked room shows both % time out of threshold and average
  degrees-off-threshold
- A room with partial data coverage (sensor offline part of the window)
  shows the day-count basis (e.g. "based on 4 of 7 days") instead of
  presenting an incomplete % as final
- Clicking a ranked room reuses the existing room-detail route — no new
  navigation is introduced

## Scope of Change

- [new] Facility manager can view a ranked list of rooms ordered by % time
  out of comfort threshold over the trailing 7 days, with average
  degrees-off-threshold shown alongside each room as a secondary severity
  indicator.
  > Socrates: Counter-argument considered: "% time alone hides severity
  > magnitude — a room barely over threshold 50% of the time could outrank
  > a room wildly over threshold only 10% of the time." Resolution: keep %
  > time as the sort key, but display average degrees-off-threshold per
  > room as a secondary stat so severity is visible without changing the
  > sort logic.
- [new] System computes % time-out-of-threshold and average
  degrees-off-threshold per room from existing temperature-history and
  threshold data; when a room's sensor was offline for part of the 7-day
  window, the ranking indicates partial data coverage (e.g. "based on 4 of
  7 days") instead of presenting the % as complete.
  > Socrates: Counter-argument considered: "if temperature-history data has
  > gaps (device offline), % time-out-of-threshold could be computed on
  > incomplete data and mislead the manager." Resolution: surface data
  > coverage explicitly rather than hiding the gap.
- [preserved] Existing per-room threshold configuration and
  temperature-history views continue to function unchanged.

**Considered and dropped** (not in scope for this change):
- Clicking a ranked room to open its detail view was not added as a
  standalone capability — it reuses the existing room-detail route and is
  captured only as an acceptance criterion on US-01.
  > Socrates: Counter-argument considered: "duplicates existing navigation
  > — the room list already links to the detail view." Resolution: dropped
  > as a standalone item; captured as an acceptance criterion instead.
- Export/copy of the ranked list — dropped from this MVP.
  > Socrates: Counter-argument considered: "reporting/export scope creep
  > for an MVP that's about surfacing a ranking." Resolution: dropped;
  > revisit later only if actually requested.

## Constraints & Compatibility

- Ships through the existing CI pipeline (lint, typecheck, automated tests,
  build); no special deployment window.
- No backward-compatibility concern — this feature is read-only and
  additive; it introduces no new external contracts and requires no changes
  to existing stored data.
- Existing integrations that must continue working: per-room threshold
  configuration and temperature-history views.
- Preserved behavior: both of the above must keep working unchanged after
  this change ships.

## Business Logic Changes

A room's comfort compliance score aggregates its historical
in/out-of-threshold status over a trailing 7-day window into a percentage of
time spent outside its comfort threshold, paired with the average magnitude
of that deviation, and rooms are ranked worst-to-best by that score.

This is a new domain rule layered on top of the existing live-status rule
(current temperature vs. configured threshold). Where the existing rule
answers "is this room OK right now," this new rule answers "how much has
this room been out of compliance recently, and how badly."

Inputs: each room's configured comfort threshold (min/max) and its
temperature-history readings over the trailing 7 days. Output: a percentage
(time out of threshold), an average deviation magnitude, and a data-coverage
indicator (days with data out of 7). The user encounters this as a sorted
list on the main dashboard, one row per room, most problematic first.

## Access Control Changes

No access control changes — current model preserved. Current model:
single-tier login, no role separation among authenticated users. Any
logged-in user can view the comfort compliance ranking; no new roles are
introduced for this feature.

## Non-Goals

- **No custom time windows** — fixed 7-day rolling window only; no
  user-configurable 24h/30d toggle in this MVP.
- **No export/reporting** — no export or scheduled-report capability of any
  kind.
- **No predictive/forecasting logic** — purely backward-looking (what
  happened in the last 7 days); no projection of future compliance or trend
  forecasting.
- **No per-device breakdown in the ranking view** — ranking is room-level
  only; drilling into which specific sensor caused a violation stays in the
  existing detail view, not duplicated in the ranking panel.

## Open Questions

1. **What is the Secondary success criterion?** — The shaping session
   recorded "export/copy the ranked list" as the original secondary
   criterion, but that capability was subsequently dropped as a non-goal
   during the Socrates challenge round, leaving no secondary success
   criterion on record. Owner: user. Block: no (Primary + Guardrails are
   sufficient to ship; a secondary criterion can be added later).
