# Comfort Compliance Ranking — Plan Brief

> Full plan: `context/changes/comfort-compliance-ranking/plan.md`

## What & Why

Facility staff can see a room's live comfort status and its temperature
history, but can't tell which rooms are *chronically* problematic without
manually eyeballing history charts room by room. This adds a dashboard
panel that ranks all rooms worst-to-best by % of time spent outside their
comfort threshold over the trailing 7 days, so a facility manager can see
which room needs attention first at a glance.

## Starting Point

The dashboard already computes a live OK/Too Cold/Too Hot badge per room
(`scoreRoom()`) and stores per-device temperature readings with a proven
7-day bucketing query pattern (`temperatureHistory`) — but nothing
aggregates across time at the room level. This is new query logic on top
of existing tables (`rooms`, `roomThresholds`, `deviceTemperatureReadings`)
— no schema changes.

## Desired End State

A new panel on the dashboard lists every room, worst-first, with its %
time out of threshold and average degrees-off-threshold. Rooms with no
sensors or no recent data show "no data" instead of a misleading 0%.
Rooms with gaps show a coverage note ("based on 4 of 7 days"). Clicking a
room opens the same detail sheet used elsewhere on the dashboard. The
panel is draggable and hideable like the rest of the dashboard's widgets.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Aggregation granularity | Hourly buckets (168/room over 7 days) | Reuses the existing proven 7d bucket size from `temperatureHistory`; fine enough for a meaningful % figure without the cost of raw-reading-level computation | Plan (user-confirmed) |
| Multi-sensor combination | Minimum-of-bucket-averages | Extends the existing per-column `AVG()` bucketing SQL with one added cross-sensor `MIN`, preserving the "coldest sensor wins" rule from the live badge | Plan (user-confirmed) |
| Widget registration | Full personalization widget (both `DEFAULT_WIDGET_ORDER` and `widgetDefinitions`) | Consistent with the rest of the dashboard; doing both steps together avoids repeating an orphaned-id gap found during research | Plan (user-confirmed) |
| Day-coverage rule | Any single reading counts a day as covered | Simplest rule, directly matches the PRD's "presence over 7 days" framing without inventing a new density threshold | Plan (user-confirmed) |
| Severity stat scope | Avg degrees-off computed only over violating buckets | Represents "how badly," not diluted by in-range buckets where deviation is zero | Plan |

## Scope

**In scope:**
- New pure aggregation function + unit tests
- New site-scoped tRPC procedure returning a sorted room ranking
- New dashboard panel, registered in the personalization system
- Reusing the existing room-detail sheet for click-through

**Out of scope:**
- Custom/configurable time windows, export/reporting, predictive
  forecasting, per-device breakdown (all explicit PRD non-goals)
- Any change to `scoreRoom`, `temperatureHistory`, or existing panels
- Fixing the pre-existing orphaned widget-id gap found during research

## Architecture / Approach

Backend: one grouped SQL query (not N+1) fetches all rooms' sensor
readings for the trailing 7 days, bucketed hourly using the same
integer-division bucketing already used for the per-device 7-day chart;
a pure function combines sensors per bucket and classifies each bucket
against thresholds (reusing `scoreRoom`'s badge rule) to produce the
per-room percentage, severity, and coverage stats. Frontend: a
self-contained panel component queries this procedure and renders into
the existing widget grid, reusing the existing room-detail sheet for
navigation.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend | Pure aggregation logic + tested tRPC ranking procedure | Query must stay a single grouped pass to respect the "don't degrade dashboard load" guardrail |
| 2. Frontend | Ranking panel wired into the dashboard + personalization system | Widget grid is sized for small KPI tiles — needs a full-width `className` override |

**Prerequisites:** none beyond the existing S-05/S-09 data being populated.
**Estimated effort:** ~1 session across 2 phases (matches the PRD's
2-week/after-hours delivery budget with margin).

## Open Risks & Assumptions

- Assumes UTC day boundaries are acceptable for "coverage" grouping
  (single-timezone LAN deployment — no DST edge case expected).
- Assumes hourly granularity is sufficient signal for the % figure;
  very short (sub-hour) threshold violations would be smoothed into an
  hourly average rather than counted individually.

## Success Criteria (Summary)

- A facility manager can see, at a glance, which room has been most out
  of comfort compliance over the last week, ranked worst-first.
- Rooms without usable data are clearly distinguished from compliant
  rooms — never shown as a misleading 0%.
- The new panel behaves like every other dashboard widget (draggable,
  hideable, persisted) and reuses existing navigation with zero
  regressions to existing threshold/history features.
