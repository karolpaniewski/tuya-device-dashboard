---
change_id: room-heat-toggle
title: Quick-action room heat toggle
status: archived
created: 2026-06-18
updated: 2026-06-22
archived_at: 2026-06-22T12:02:11Z
---

## Notes

Fast toggle button per room (e.g. "turn off heat in room X") on the dashboard, instead of opening device detail to adjust setpoint.

**Superseded by shaping (2026-06-22):** this change went through `/10x-shape` and `/10x-prd`; canonical decisions now live in `context/foundation/shape-notes.md` and `context/foundation/prd-v4.md`. One material delta from the original notes below: automation conflict is no longer "may re-engage on its next tick" — the PRD locks in indefinite pinning (manual-off wins until a human manually releases it; automation skips a pinned room on every tick, no auto re-engage).

Original discussion notes, still valid for device-level mechanics:

- **Device semantics**: literal valve close — write `valve_state = closed` via the device's DP code (DP 3 in the one documented productKey, `ogx8u5z6`, per `src/server/lib/tuya/dp-codes.ts`), NOT a setpoint drop. Independent of the existing `temp_set` (DP 4) write path used by S-04/S-11.
- Scope (room-level vs per-device, "turn back on" semantics, UI placement) is resolved in the PRD (`prd-v4.md`): room-level toggle on the dashboard card, confirm step before turning off, distinct visual indicator when pinned off, setpoint edits inert while pinned.
