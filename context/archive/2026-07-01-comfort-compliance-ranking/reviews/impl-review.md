<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Comfort Compliance Ranking Panel

- **Plan**: context/changes/comfort-compliance-ranking/plan.md
- **Scope**: Phase 1 of 2 (full plan)
- **Date**: 2026-07-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Fully device-less rooms cause a silent dead click in the ranking panel

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/server/api/routers/device.ts:521-527, src/app/_components/device-overview.tsx:1172-1174
- **Detail**: `comfortComplianceRanking`'s room list is a direct `select ... from rooms` scoped only by `siteId` (device.ts:521-527) — it includes rooms with zero devices assigned at all. `overview`'s room list is built by iterating `devices` LEFT JOIN `deviceRoomAssignments`/`rooms` (device.ts:368-441), so a room with no devices never produces a row and never appears in `data.rooms`. The click handler that opens the detail sheet does `data?.rooms.find((r) => r.roomId === selectedRoomId); if (!room) return null;` (device-overview.tsx:1173-1174) — clicking a fully-empty room's "No data" row in the new panel silently does nothing. Only bites rooms with literally zero devices of any type.
- **Fix A ⭐ Recommended**: Filter `comfortComplianceRanking`'s room query to only rooms with ≥1 device, matching `overview`'s room definition exactly.
  - Strength: Guarantees every ranked row is clickable; one join added to an already-existing query, no client changes needed.
  - Tradeoff: Hides fully-empty rooms from the ranking entirely — arguably fine, since a room with zero devices has no compliance signal to show either way.
  - Confidence: HIGH — mirrors `overview`'s exact room-membership rule already proven in this file.
  - Blind spot: Haven't confirmed whether the PRD intends genuinely-empty rooms to be visible in this specific panel as a "you haven't wired this room up yet" signal.
- **Fix B**: Keep all rooms in the ranking, but make the row non-interactive (or toast) when the room isn't in `overview`'s set.
  - Strength: Preserves visibility of every room, including totally empty ones, without changing backend room membership semantics.
  - Tradeoff: Needs the panel to know which rooms are click-safe — either threading `overview`'s room set into the panel or duplicating the device-count check.
  - Confidence: MEDIUM — more moving parts, touches the component in a way not covered by existing patterns.
  - Blind spot: Haven't verified whether `overview`'s room list is easily accessible from where the panel is composed without an extra prop.
- **Decision**: FIXED (via Fix A) — filtered `comfortComplianceRanking`'s room query to only rooms with ≥1 device via a `selectDistinct` device-room-assignment join, matching `overview`'s room-membership rule.

### F2 — Threshold edits don't invalidate the ranking panel's cached data

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability/staleness)
- **Location**: src/app/_components/setup/room-threshold-form.tsx:43-54
- **Detail**: `comfortComplianceRanking`'s output depends on per-room thresholds (device.ts:628, 645), but both mutation `onSuccess` handlers in the threshold-editing form only call `void utils.device.overview.invalidate()` (lines 45, 54) — `utils.device.comfortComplianceRanking.invalidate()` is never called. After editing a room's min/max threshold, the ranking panel keeps showing percentages computed against the old thresholds until the query's global 30s `staleTime` expires and a refetch trigger fires — no active poll, unlike `overview`'s `refetchInterval: 30_000`.
- **Fix**: Add `void utils.device.comfortComplianceRanking.invalidate();` alongside the existing `utils.device.overview.invalidate()` call in both `onSuccess` handlers (room-threshold-form.tsx:45, 54).
- **Decision**: FIXED — added the invalidation call to both `onSuccess` handlers.

### F3 — Unbounded query when siteId === "all"

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/server/api/routers/device.ts:546, 604
- **Detail**: `inArray(deviceRoomAssignments.roomId, roomIds)` and `inArray(deviceTemperatureReadings.tuyaDeviceId, allTuyaDeviceIds)` have no upper bound when `siteId === "all"`. This mirrors `overview`'s pre-existing lack of bounding — not a regression introduced by this diff, just worth noting if room/device counts grow large.
- **Fix**: No action needed now — matches an existing, accepted pattern. Revisit only if `overview` itself gets bounded/paginated in the future.
- **Decision**: SKIPPED — matches an existing, accepted pattern; not a regression.
