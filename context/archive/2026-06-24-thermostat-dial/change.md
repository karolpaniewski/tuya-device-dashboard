---
change_id: thermostat-dial
title: Thermostat dial + shared-layout card→modal transition
status: archived
created: 2026-06-24
updated: 2026-06-30
archived_at: null
---

## Notes

Originated from `context/foundation/prd.md` (v1) — a premium-feel UI/interaction
polish pass over the existing device card and device detail modal. Replaces the
card's +/− setpoint buttons and the modal's linear slider with a drag-to-rotate
circular thermostat dial (valve devices only), and adds a Framer Motion
shared-layout expand/collapse transition between the card and the modal for
all device types. No domain-logic change, no backend changes.

See `plan.md` for the full implementation plan and `plan-brief.md` for a
two-page summary.
