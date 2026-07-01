# Per-Room Thresholds — Plan Brief

> Full plan: `context/changes/per-room-thresholds/plan.md`
> Frame brief: `context/changes/per-room-thresholds/frame.md`

## What & Why

The per-room threshold feature already exists end-to-end — schema, alert logic, router, and
UI form all shipped. Two gaps remain: once an admin sets an override there is no way to clear
it back to the global default through the UI, and the three numeric inputs use `type="number"`
which violates the project's lessons.md rule (browser silently rejects comma decimal
separators, causing React state desync with zero feedback).

## Starting Point

`RoomThresholdForm` is a fully working form with Min/Max/Anomaly gap inputs and Save/Cancel
buttons. The router has `getThreshold` and `setThreshold` but no `clearThreshold`. All three
inputs use `type="number"` + `step="0.5"` — the pattern the lessons.md rule explicitly
prohibits.

## Desired End State

A "Reset to global defaults" button appears next to Cancel whenever an override row exists.
Clicking it deletes the row, shows a toast, and closes the form — identical UX flow to Save.
All three inputs accept comma decimal separators without desyncing from React state.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| After reset, form behavior | Close (same as Save) | Consistent with existing post-action UX; no extra state needed | Plan |
| Reset button visibility | Hidden when no override exists (data === null) | Showing it when there's nothing to clear is confusing | Plan |
| Comma normalization | Inline onChange: replace "," → "." | Matches lessons.md prescription; zero impact on submit validation path | Frame |
| Confirmation dialog | None | Direct action; consistent with Save and Cancel | Plan |
| Validation on bad input | Rely on tRPC Zod rejection + existing onError | parseFloat(NaN) → Zod z.number() rejects it; form already handles onError | Plan |

## Scope

**In scope:**
- `clearThreshold` mutation in `room.ts` router
- "Reset to global defaults" button in `RoomThresholdForm`
- `type="text"` + `inputMode="decimal"` fix on all 3 inputs
- Comma→period normalizer in each onChange

**Out of scope:**
- Visual indicator on room rows showing which have custom thresholds
- Confirmation prompt before clearing
- Real-time input regex validation
- Any other file beyond room.ts and room-threshold-form.tsx

## Architecture / Approach

Two files, one phase. `clearThreshold` is a sibling `DELETE` mutation after `setThreshold` —
no new imports needed (`eq` and `roomThresholds` already in scope). The form wires it exactly
like `setThreshold`: mutation hook → button → success closes form + invalidates
`device.overview`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. clearThreshold Mutation + Form Hardening | Delete mutation, Reset button, input type fix | Biome import ordering must be respected — no new imports needed so minimal risk |

**Prerequisites:** None — feature already fully deployed.
**Estimated effort:** ~1 session, single phase.

## Open Risks & Assumptions

- `clearThreshold` on a room with no override row is a no-op DELETE — this is correct
  behavior (deleting 0 rows doesn't error). The button is hidden in this case anyway.

## Success Criteria (Summary)

- Admin can clear a per-room override via "Reset to global defaults" → form closes, room
  falls back to global thresholds on next alert cycle.
- Comma decimal input (`18,5`) normalizes to `18.5` in state without silent desync.
- `pnpm typecheck` + `pnpm lint` pass clean.
