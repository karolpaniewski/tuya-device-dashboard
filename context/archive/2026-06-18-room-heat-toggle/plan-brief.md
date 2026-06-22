# Room Heat Toggle — Plan Brief

> Full plan: `context/changes/room-heat-toggle/plan.md`
> PRD: `context/foundation/prd-v4.md`
> Shape notes: `context/foundation/shape-notes.md`

## What & Why

Add a one-click per-room heat on/off toggle to the dashboard. Today, killing heat in a room requires opening a device modal and lowering its setpoint — a precision tool repurposed for a binary decision, with no way to react to "someone's staying late in one room" or "we're leaving early, kill heat now."

## Starting Point

Heat control today is entirely device-scoped: a setpoint mutation writes a DP value to one device, and automation rules also target individual devices on a schedule. There is no room-level state, no direct valve-close write path (only setpoint), and no concept of a manually-overridden room.

## Desired End State

An admin clicks a toggle on a room's card, confirms via a brief inline popover, and that room's valve(s) close immediately. The room is pinned off — automation stops touching it, setpoint edits become inert, and the card shows a distinct "manually off" indicator — until the admin clicks the toggle again.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Pin precedence | Manual pin always wins over automation, indefinitely | Matches the explicit "off is off until manually turned back on" requirement | PRD |
| Data model | New `roomHeatState` table (1:1 with rooms) | Mirrors the existing `roomThresholds` pattern already used for per-room state | Plan |
| Confirm UX | Small inline popover, not a full modal | Matches the "brief inline confirm" / 2-second urgency goal | Plan |
| Multi-valve rooms | Best-effort — pin persists even if one device fails to close | The room-level promise (automation stops acting) must hold regardless of one flaky device | Plan |
| Inert setpoint | Setpoint mutation short-circuits silently while pinned, no pending-value tracking | Simplest mechanism; matches FR-006's bias toward unambiguous "off is off" | PRD / Plan |
| Health badge | Unaffected — still shows Too Cold/Too Hot normally | Badge logic is genuinely unchanged; the new indicator supplies the missing context | PRD |

## Scope

**In scope:**
- Per-room toggle on the dashboard card, with confirm-before-off
- Direct valve-state DP close/open, independent of setpoint
- Automation skip for pinned rooms (logged as `skipped`)
- Inert setpoint edits while pinned
- Distinct visual indicator for pinned-off rooms

**Out of scope:**
- Bulk/whole-building toggle
- Scheduled/timed auto-release of the pin
- Notifications or reminders for pinned rooms
- Any access-control change
- Persisted "pending setpoint" applied automatically on release

## Architecture / Approach

A new `roomHeatState` table tracks the pin. A `room.toggleHeat` mutation flips it and best-effort sends a direct DP `valve_state` write to every valve device in the room (new `sendValveStateCommand` helper, mirroring the existing `sendPlugCommand` boolean-DP pattern). The automation scheduler and the `device.setpoint` mutation both gain a guard that checks the device's room pin before writing to a device. `device.overview` is extended to return pin state so the dashboard can render the toggle and indicator without an extra round-trip.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model | `roomHeatState` table + valve-state DP map | Low — purely additive schema |
| 2. Backend mutations | Valve-close helper, toggle mutation, inert-setpoint guard, extended overview query | Multi-valve partial failure handling |
| 3. Automation guard | Scheduler skips pinned rooms, logs `skipped` | Must run before the existing temp-threshold check |
| 4. Dashboard UI | New `Popover` primitive, toggle + confirm + indicator on room card | Visual collision with existing health badge colors |
| 5. Tests | Mutation, automation-skip, inert-setpoint, valve-control tests | None significant — mirrors existing test conventions |

**Prerequisites:** None beyond the existing S-01/S-04/S-05/S-11 slices already shipped.
**Estimated effort:** ~1 week of after-hours work across 5 phases, per the PRD's `delivery_weeks: 1`.

## Open Risks & Assumptions

- A failed valve-close command on one device in a multi-valve room means that device may still be physically heating even though the UI shows the room as "off" — accepted tradeoff (best-effort), surfaced as a per-device error, not silently hidden.
- No persisted "intended setpoint" means that after a long pin period, releasing the pin restores whatever setpoint the device last had commanded (likely whatever it was when pinned), not anything edited during the pin — acceptable since setpoint edits during a pin are inert by design.

## Success Criteria (Summary)

- Toggling a room off closes its valve(s) within ~1 second and the indicator appears; automation never re-engages it until toggled back on.
- Setpoint edits on a pinned room never reach the device.
- The existing health badge, setpoint control, and automation continue working unchanged for any non-pinned room.
