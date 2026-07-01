---
project: "Tuya Device Dashboard"
context_type: brownfield
created: 2026-07-01
updated: 2026-07-01
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 2
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "change category"
      decision: "significant feature, not a new module or architecture change"
    - topic: "access control"
      decision: "no changes — single-tier login preserved"
    - topic: "time window"
      decision: "fixed trailing 7 days, no configurability"
    - topic: "ranking placement"
      decision: "new panel on the main dashboard"
    - topic: "severity vs. % time"
      decision: "% time is the sort key; average degrees-off-threshold shown as secondary stat"
    - topic: "data gaps"
      decision: "surface data-coverage basis (e.g. 4 of 7 days) rather than hiding incomplete data"
    - topic: "export/reporting"
      decision: "dropped from MVP; explicit non-goal"
  frs_drafted: 2
  quality_check_status: accepted
---

# Shape Notes: Tuya Device Dashboard — Comfort Compliance Ranking

## Current System

Tuya Device Dashboard is a LAN-only web dashboard for facility management (2–5
person team), replacing per-device use of the Tuya mobile app. Tech stack:
Next.js 15 / React 19, tRPC v11, Drizzle ORM + libsql (SQLite), NextAuth v5.
Users are facility management staff monitoring and controlling heating valves
and temperature sensors across rooms and sites.

Change category: significant feature — a new capability built on top of
existing data, not a new module or architecture change.

## Vision & Problem Statement

Room comfort thresholds (S-05) show a live OK / Too Cold / Too Hot badge per
room, and temperature history (S-09) exists per device/room — but there's no
way to see which rooms are chronically problematic over time. Staff only see
the instantaneous state; they can't tell "room 3 has been too cold 40% of the
time this week" without manually eyeballing history charts room by room.

This gap only became visible after S-05 and S-09 were both in real use — the
live badge and the history charts are each useful on their own, but neither
answers "which room needs attention first" over a time window. That
aggregation view is the missing piece.

## User & Persona

Primary persona: the facility manager role within the team — the person
responsible for comfort/complaints — who checks this periodically, distinct
from day-to-day device operators adjusting setpoints in the moment.

## Access Control

Current model: single-tier login (NextAuth v5), no role separation — any
authenticated user sees everything.

No changes planned — current model preserved. Any logged-in user can view the
comfort compliance ranking; no new roles are introduced for this feature.

## Success Criteria

### Primary
- A new panel on the main dashboard ranks all rooms worst-to-best by % of
  time spent outside their comfort threshold over the trailing 7 days.
- Clicking a room in the ranking jumps to its existing detail/history view.

### Secondary
- Manager can export or copy the ranked list (e.g. for a report or email).

### Guardrails
- Existing per-room threshold configuration (S-05) and temperature-history
  charts (S-09) continue to work unchanged — this feature is purely additive
  and read-only; it must not write to or alter existing threshold/history
  data flows.
- The 7-day compliance computation must not noticeably degrade main
  dashboard load time.

## Functional Requirements

### Comfort compliance ranking
- FR-001: Facility manager can view a ranked list of rooms ordered by %
  time out of comfort threshold over the trailing 7 days, with average
  degrees-off-threshold shown alongside each room as a secondary severity
  indicator. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: "% time alone hides severity
  > magnitude — a room barely over threshold 50% of the time could outrank
  > a room wildly over threshold only 10% of the time." Resolution: keep %
  > time as the sort key, but display average degrees-off-threshold per
  > room as a secondary stat so severity is visible without changing the
  > sort logic.
- FR-002: System computes % time-out-of-threshold and average
  degrees-off-threshold per room from existing temperature-history and
  threshold data; when a room's sensor was offline for part of the 7-day
  window, the ranking indicates partial data coverage (e.g. "based on 4 of
  7 days") instead of presenting the % as complete. Priority: must-have.
  Change: new
  > Socrates: Counter-argument considered: "if temperature-history data has
  > gaps (device offline), % time-out-of-threshold could be computed on
  > incomplete data and mislead the manager." Resolution: surface data
  > coverage explicitly rather than hiding the gap.

### Considered and dropped
- Clicking a ranked room to open its detail view — not a standalone FR;
  folded into US-01 as an acceptance criterion (reuses the existing
  room-detail route).
  > Socrates: Counter-argument considered: "duplicates existing navigation
  > — the room list already links to the detail view." Resolution: dropped
  > as a standalone FR; captured as an acceptance criterion instead.
- Export/copy the ranked list — dropped from this MVP.
  > Socrates: Counter-argument considered: "reporting/export scope creep
  > for an MVP that's about surfacing a ranking." Resolution: dropped;
  > revisit later only if actually requested.
- Explicit "existing threshold config + history views continue unchanged"
  FR — dropped as redundant.
  > Socrates: Counter-argument considered: "redundant with the Guardrails
  > section, which already commits to this." Resolution: dropped; preserved
  > behavior stays captured only in Guardrails.

## Constraints & Preserved Behavior

- Ships through the existing lint + typecheck + Vitest + build CI pipeline
  (S-06); no special deployment window.
- No backward-compatibility concern — this feature is read-only and
  additive; it introduces no new API contracts or data migrations.
- Preserved behavior: existing per-room threshold configuration (S-05) and
  temperature-history views (S-09) must keep working unchanged (also
  captured under Guardrails above).

## Business Logic

A room's comfort compliance score aggregates its historical in/out-of-threshold
status over a trailing 7-day window into a percentage of time spent outside
its comfort threshold, paired with the average magnitude of that deviation,
and rooms are ranked worst-to-best by that score.

This is a new domain rule layered on top of the existing S-05 live-status
rule (current temperature vs. configured threshold). Where S-05 answers "is
this room OK right now," this rule answers "how much has this room been out
of compliance recently, and how badly."

Inputs: each room's configured comfort threshold (min/max) and its
temperature-history readings over the trailing 7 days. Output: a percentage
(time out of threshold), an average deviation magnitude, and a data-coverage
indicator (days with data out of 7). The user encounters this as a sorted
list on the main dashboard, one row per room, most problematic first.

## Non-Functional Requirements

- Computing the 7-day compliance ranking does not noticeably degrade main
  dashboard load time (same property already captured as a Guardrail above).

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
- Ranking updates to reflect the current rolling 7-day window on each
  dashboard load (not cached indefinitely)
- Each ranked room shows both % time out of threshold and average
  degrees-off-threshold
- A room with partial data coverage (sensor offline part of the window)
  shows the day-count basis (e.g. "based on 4 of 7 days") instead of
  presenting an incomplete % as final
- Clicking a ranked room reuses the existing room-detail route — no new
  navigation is introduced

## Non-Goals

- **No custom time windows** — fixed 7-day rolling window only; no
  user-configurable 24h/30d toggle in this MVP.
- **No export/reporting** — no PDF/CSV export, no email digest, no
  scheduled reports (confirms the FR-004 drop above).
- **No predictive/forecasting logic** — purely backward-looking (what
  happened in the last 7 days); no projection of future compliance or trend
  forecasting.
- **No per-device breakdown in the ranking view** — ranking is room-level
  only; drilling into which specific sensor caused a violation stays in the
  existing detail view, not duplicated in the ranking panel.

## Quality cross-check

All elements present — no gaps. Access Control, Business Logic,
Timeline-cost acknowledgment, Non-Goals, and Preserved Behavior are all
captured. `quality_check_status: accepted`.

