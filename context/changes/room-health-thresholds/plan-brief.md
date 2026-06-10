# Room Health Thresholds — Plan Brief

> Full plan: `context/changes/room-health-thresholds/plan.md`

## What & Why

Wire the already-built scoring infrastructure into the user-visible UI. `scoreRoom()` runs on every poll, `badge`/`anomaly`/`suggestion` are already in the API response — they just aren't displayed. This slice adds the two missing backend procedures, fixes two silent bugs in the scoring pipeline, and surfaces the results in both the dashboard and the setup page.

## Starting Point

`roomThresholds` table exists, `scoreRoom()` is complete, and `device.overview` already returns `badge`, `anomaly`, `suggestion` per room. `RoomGroup` doesn't render those fields. Rooms without a threshold record silently fall back to null values (no badge shown). Multi-sensor rooms use the first sensor found instead of the coldest.

## Desired End State

Every room on the dashboard shows a colored badge (OK / Too Cold / Too Hot) based on its current temperature vs. per-room thresholds. An anomaly suggestion ("Temperature is X°C below setpoint…") appears under the room header when detected. Admins can configure per-room thresholds via an inline form in `/setup` (⚙ button per room). Rooms with no configured threshold score against hardcoded defaults (18–24 °C, gap 3 °C).

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Multi-sensor aggregation | Minimum (worst-case) | Conservative — surfaces problems in any corner of the room; roadmap suggested default | Plan |
| Global defaults | Hardcode 18 / 24 / 3 °C | PRD doesn't require a UI for global defaults; no DB row needed | Plan |
| Threshold config location | /setup page, inline per room | One admin screen for all room config; follows established /setup pattern | Plan |
| Suggestion display | Below room header, anomaly-only | Contextual, always visible when relevant | Plan |
| Per-device flags | Room-level badge only | RoomGroup badge surfaces the problem; DeviceCard unchanged | Plan |
| Tests | None — manual only | Logic trivial at this layer; scoring.ts already tested | Plan |

## Scope

**In scope:** `getThreshold` + `setThreshold` procedures, hardcoded default scoring, minimum-sensor aggregation fix, dashboard badge/suggestion display, `/setup` inline threshold form.

**Out of scope:** User-configurable global defaults, per-device anomaly flags, test suite additions, historical threshold tracking.

## Architecture / Approach

Backend-first: Phase 1 adds procedures and fixes scoring. Phase 2 adds read-only dashboard display (no new fetch — fields already in the response). Phase 3 adds the write path (setup UI). The `getThreshold` query is lazy (one fetch per open form), avoiding N+1 queries and leaving the existing `room.list` tests intact.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Threshold procedures + default scoring | `getThreshold`, `setThreshold` in room router; 18–24 °C fallback; min-sensor fix | Biome import-order or Drizzle upsert pattern mismatch |
| 2. Dashboard badge display | Colored badge chips + anomaly suggestion text in RoomGroup | Biome prop-sort on new optional props |
| 3. Threshold config UI | Inline ⚙ form per room in /setup; pre-populated from getThreshold | useEffect initialization timing on lazy query |

**Prerequisites:** S-01 + S-02 complete  
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- When a room has a partial threshold entry (some values null), the null columns disable the corresponding scoring dimension — acceptable, since the setup form always submits all three values.
- `getThreshold` uses `staleTime: Infinity` in the form to avoid re-fetching mid-edit; saving invalidates `device.overview` so the dashboard refreshes.

## Success Criteria (Summary)

- Every room with at least one temperature sensor shows a badge (OK / Too Cold / Too Hot) using defaults or configured thresholds
- Anomaly suggestions appear in the dashboard when temperature is significantly below setpoint
- Admins can set per-room thresholds in `/setup` with inline validation
