---
change_id: room-heat-toggle
title: Quick-action room heat toggle
status: new
created: 2026-06-18
updated: 2026-06-18
archived_at: null
---

## Notes

Fast toggle button per room (e.g. "turn off heat in room X") on the dashboard, instead of opening device detail to adjust setpoint. Resolved during discussion:

- **Device semantics**: literal valve close — write `valve_state = closed` via the device's DP code (DP 3 in the one documented productKey, `ogx8u5z6`, per `src/server/lib/tuya/dp-codes.ts`), NOT a setpoint drop. Independent of the existing `temp_set` (DP 4) write path used by S-04/S-11.
- **Automation conflict (S-11)**: manual toggle is a simple override — it wins immediately, but an active automation rule for that room may re-engage the valve on its next scheduled tick. No new "paused rule" state to design/track; deferred to a future slice if this proves confusing in practice.
- Scope (room-level vs per-device, "turn back on" semantics, UI placement) still open — for `/10x-plan` or a `/10x-frame` pass to resolve.
