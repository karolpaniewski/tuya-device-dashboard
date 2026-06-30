---
change_id: dashboard-personalization
title: Personalized dashboard layout (drag-and-drop widgets + room order)
status: archived
created: 2026-06-16
updated: 2026-06-30
archived_at: null
---

## Notes

Originated from open-ended feature brainstorming (no bug, no PRD gap) — user's
own seed idea: "Click and drag widgets, to personalize dashboard." Scoped via two
follow-up rounds of AskUserQuestion before framing:

- **Scope**: "Summary + per-room order" — KPI cards + donut + RoomTemperaturePanel
  as reorderable/hideable widgets, AND room groups draggable into custom order
  (broader than the recommended "summary widgets only" option).
- **Persistence**: "Per-user" — each logged-in user gets their own saved
  arrangement (the recommended option).

Routed through `/10x-frame` per user's explicit request, to pressure-test
whether full drag-and-drop is the right weight vs. simpler alternatives before
planning. See `frame.md` for the investigation — the "per-user" persistence
assumption did not survive contact with the actual auth model.
