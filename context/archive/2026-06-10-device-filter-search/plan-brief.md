# Device Filter and Search — Plan Brief

> Full plan: `context/changes/device-filter-search/plan.md`

## What & Why

Add a horizontal filter bar to the main dashboard that lets the facility manager narrow the device list by room, type (sensor/valve/plug), online/offline status, and name search. The PRD lists these as must-have FRs (FR-006 – FR-009) and they're the last unblocked UX improvement before valve control and room thresholds land.

## Starting Point

The dashboard currently shows all devices grouped by room with no filtering capability. The `device.overview` tRPC query already returns `deviceType`, `isOnline`, `name`, and `roomId` per device — every field the filter logic needs is already in memory.

## Desired End State

A filter bar sits between the header and the device groups. Selecting a room shows only that room's group; selecting a type or status hides non-matching devices within each group. Typing in the search box narrows by name in real-time. Room groups with zero matches are hidden; a "No devices match" message with a "Clear filters" action appears when everything is filtered out. The 30-second auto-refresh continues unaffected.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Filter execution | Client-side only | PRD scope is ≤50 devices; no server round-trip needed | Plan |
| Filter bar placement | Horizontal bar above room groups | Always visible, zero extra clicks, follows header/content layout | Plan |
| Room filter UX | Single-select `<select>` dropdown | "Show me Room 1" is the dominant use case; multi-select adds complexity for no gain at this scale | Plan |
| Multi-filter semantics | AND (must match all active filters) | "All offline valves in Room 1" is the natural mental model | Plan |
| Empty room groups | Hidden entirely | Clean, signal-dense output; PRD scale makes the distinction from "no devices in room" acceptable | Plan |
| View mode under filters | Always keep room grouping | Consistent layout; avoids a second render path | Plan |
| Tests | None — manual only | Logic is trivial; user confirmed | Plan |

## Scope

**In scope:** Name search, room filter, type filter, status filter, AND combination, empty-state message, "Clear filters" action, unassigned group participation in non-room filters.

**Out of scope:** URL-based filter persistence, multi-select room filter, filter persistence across sessions, server-side filtering, automated tests, filter chips on the Unassigned group header.

## Architecture / Approach

Pure client-side: `FilterState` type + `FilterBar` presentational component (Phase 1); `DeviceOverview` gains filter state via `useState`, applies a predicate over in-memory data, and renders `FilterBar` above the groups (Phase 2). No new tRPC procedures; no DB changes; `RoomGroup` and `DeviceCard` are unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. FilterBar Component | New pure presentational filter bar with room dropdown, type chips, status chips, name search | Biome prop-sort or import-order lint fails on first pass |
| 2. DeviceOverview Integration | Filter state + predicate wired in; empty-state message; all FR-006–009 satisfied | Edge case: Unassigned group visibility under room filter |

**Prerequisites:** S-01 (live-device-overview) — complete; F-01 (auth-scaffold) — complete  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- The `device.overview` query is already cached client-side; filter state resets on page reload — acceptable per scope decision.
- Biome `noAutofocus` and prop-sort rules may trigger on the `<input>` in the filter bar; fix with `biome-ignore` comment or prop reorder as in prior components.

## Success Criteria (Summary)

- Room, type, status, and name filters each work independently and in combination (AND logic)
- Room groups with 0 matches after filtering are hidden; a clear-able empty state is shown when everything is filtered out
- 30-second auto-refresh works with filter state preserved
