---
change_id: floor-plan-map-view
title: Interactive 2D floor-plan ("digital twin") Map View
status: archived
created: 2026-06-24
updated: 2026-06-24
archived_at: 2026-06-24T09:51:21Z
---

## Notes

Originated from open-ended feature brainstorming (seed idea: interactive 2D
floor plan / "digital twin"). Shaped via `/10x-shape` (brownfield) into
`context/foundation/shape-notes.md`, then promoted to `context/foundation/prd.md`
(v7) via `/10x-prd`. The user explicitly named this primarily a
portfolio/skill-demonstration feature (absolute positioning, drag-and-drop,
canvas/SVG manipulation) rather than a response to a deeply-felt existing
user complaint — recorded as such in the PRD's Problem Statement.

Pure additive visualization layer over the existing S-05 threshold badge and
S-16 device modal — no domain-logic change, no new telemetry path, no data
migration. Desktop-only; existing list/table view remains the sole mobile,
accessibility, and bulk-operations path (preserved-behavior guardrails FR-008
through FR-011).

See `plan.md` for the full implementation plan and `plan-brief.md` for a
two-page summary.
