# Frame Brief: Per-Room Temperature Threshold Overrides

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

The app only has global temperature thresholds (one min/max/gap for all rooms).
An admin cannot set different limits per room (e.g. bathroom 22°C, bedroom 18°C).

## Initial Framing (preserved)

- **User's stated cause or approach**: global thresholds are the only option; per-room
  overrides need to be built.
- **User's proposed direction**: add a per-room threshold feature.
- **Pre-dispatch narrowing**: skipped — codebase investigation was conclusive before
  Step 1.5 questions were needed.

## Dimension Map

The observation ("no per-room threshold overrides") could originate at:

1. **Schema missing** — no `room_threshold` table in the DB
2. **Alert logic ignores per-room rows** — table exists but evaluation always uses globals
3. **Router missing** — no tRPC procedures to read/write per-room thresholds
4. **UI missing** — backend exists but no way to set values from the admin panel  ← initial framing
5. **Feature is fully complete** — all layers exist; perception gap only

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Schema missing | `src/server/db/schema.ts:210–237` — `roomThresholds` table with `roomId` (FK → rooms, cascade), nullable `minTempC`/`maxTempC`/`anomalyGapC`, check constraint, `createdAt`/`updatedAt` | NONE |
| Alert logic ignores per-room rows | `src/server/lib/alert-control.ts:67–77` — loads all `roomThresholds` into a Map; line 102: `const thresholds = thresholdMap.get(roomId) ?? dbDefaultThresholds` — per-room first, default fallback | NONE |
| Router missing | `src/server/api/routers/room.ts:273–334` — `getThreshold` (query by roomId, returns null if none) + `setThreshold` (upsert with min<max validation) | NONE |
| UI missing | `room-manager.tsx:189–209` — gear icon (`<Settings size={14}>`) per room row opens inline `<RoomThresholdForm>`; `room-threshold-form.tsx` — full form: skeleton loading, Min/Max/Gap inputs, Save/Cancel, success toast | NONE |
| Feature fully complete | All 5 layers confirmed with file:line evidence | STRONG |

## Narrowing Signals

- `alert-control.ts` imports `roomThresholds` from schema and explicitly builds a
  `thresholdMap` before evaluating any room — the override logic has been live since
  this feature was first shipped.
- `room-threshold-form.tsx` uses `api.room.getThreshold` + `api.room.setThreshold`
  — the round-trip is wired end-to-end.
- The form pre-fills with `18/24/3` when no per-room row exists (sensible defaults),
  and with actual saved values otherwise.

## Cross-System Convention

Every other "per-room" feature in this codebase (heat state, alert state) follows the
same pattern: a dedicated table with a `roomId` FK + `onDelete: cascade`, read by the
alert/poller loop with a global fallback. Per-room thresholds follow this convention
exactly.

## Reframed (or Confirmed) Problem Statement

> **The actual situation is**: per-room threshold overrides are fully implemented
> across all layers — the feature already exists and is in production.

The admin can access it today: Setup → Rooms → gear icon (⚙) next to any room →
inline form with Min °C / Max °C / Anomaly gap °C fields. The alert evaluation
loop (`alert-control.ts`) already applies per-room values before falling back to
globals.

**Potential follow-up gaps** (not confirmed bugs, worth validating):
1. **No "reset to global" button** — once a per-room override is set, there is no
   UI to clear it back to the global default. The only way is to delete the row
   directly. A `clearThreshold` mutation + "Reset to default" button may be wanted.
2. **`type="number"` inputs** — `room-threshold-form.tsx:99,110,127` uses
   `type="number"` which violates the lesson about native number input desyncs
   (see `context/foundation/lessons.md` — "Native typed `<input>` elements can
   desync from React state"). Worth patching to `type="text"` + `inputMode="decimal"`.

## Confidence

**HIGH** — all five dimensions investigated with direct file:line evidence. The
feature is complete. No ambiguity.

## What Changes for /10x-plan

Nothing to plan for the originally stated feature — it already exists. If the user
wants to proceed, the two follow-up gaps above are the only addressable scope:

1. Add `clearThreshold` mutation + "Reset to default" UI control (small)
2. Fix `type="number"` → `type="text"` + `inputMode="decimal"` in
   `room-threshold-form.tsx` (trivial, driven by lessons.md rule)

Either could be a micro-plan, or both combined into one small phase.

## References

- `src/server/db/schema.ts:210–237` — `roomThresholds` table
- `src/server/lib/alert-control.ts:67–77, 102` — per-room threshold evaluation
- `src/server/api/routers/room.ts:273–334` — `getThreshold` / `setThreshold`
- `src/app/_components/setup/room-manager.tsx:189–243` — gear icon + inline form
- `src/app/_components/setup/room-threshold-form.tsx` — form component
- `context/foundation/lessons.md` — "Native typed `<input>` elements can desync"
