# Per-Room Thresholds — Form Hardening & Reset Implementation Plan

## Overview

The per-room threshold feature is fully implemented (schema, alert logic, router, UI). Two
gaps remain: the form has no way to clear an override back to global defaults, and its three
numeric inputs use `type="number"` which violates `context/foundation/lessons.md` (silent
locale desync on comma decimal separator). This plan closes both gaps in a single phase.

## Current State Analysis

- `src/server/api/routers/room.ts:273–334` — `getThreshold` + `setThreshold` exist;
  no `clearThreshold`.
- `src/app/_components/setup/room-threshold-form.tsx` — complete form; three inputs
  use `type="number"` + `step="0.5"` (lines 97, 110, 127). No "Reset to global" button.
- `alert-control.ts:102` — falls back to `dbDefaultThresholds` when no per-room row
  exists; clearing the row correctly triggers global fallback on the next eval cycle.

## Desired End State

- Admin can open a room's threshold form, click "Reset to global defaults", and have the
  override cleared — form closes, room reverts to the global fallback in the next alert cycle.
- All three numeric inputs accept both period and comma decimal separators without silently
  desyncing from React state.
- The "Reset" button is hidden when no per-room override exists (i.e., `data === null`
  from `getThreshold`) so the control appears only when meaningful.

### Key Discoveries:

- `db.delete(table).where(eq(...))` is the Drizzle delete pattern; no new import needed —
  `eq` is already imported in `room.ts:2`.
- The form's state variables (`min`, `max`, `gap`) are plain strings already — `onChange`
  writes `e.target.value` directly. Switching to `type="text"` requires only adding a
  comma→period normalizer in `onChange`.
- `parseFloat()` on submit already handles `""` gracefully (returns `NaN`); tRPC Zod schema
  (`z.number()`) rejects NaN and surfaces a `BAD_REQUEST` via the existing `onError` handler
  — no extra guard needed.
- Button visibility gate uses `data` from `getThreshold`: `null` = no override (hide button),
  non-null = override exists (show button).

## What We're NOT Doing

- No visual indicator on the room row showing which rooms have a custom threshold.
- No confirmation prompt before clearing — same direct-action UX as Save and Cancel.
- No real-time regex validation on the numeric inputs — submit-time Zod validation is
  sufficient given the trivial `min < max` check already in place.
- No changes to `alert-control.ts`, the schema, or any other file.

## Implementation Approach

Add `clearThreshold` as a sibling mutation after `setThreshold` in `room.ts`. In the form,
wire `clearThreshold` and add a "Reset to global" button in the existing button row —
conditional on `data !== null`. Fix all three inputs by switching `type` and adding a
normalizer in `onChange`. Two files, one phase.

## Phase 1: clearThreshold Mutation + Form Hardening

### Overview

Adds the `clearThreshold` router procedure, fixes the three `type="number"` inputs per the
lessons.md rule, and wires the "Reset to global defaults" button into the form.

### Changes Required:

#### 1. Add `clearThreshold` mutation

**File**: `src/server/api/routers/room.ts`

**Intent**: Add a `clearThreshold` mutation directly after `setThreshold` (around line 334)
that deletes the per-room row and returns `{ success: true }`. No room-existence check needed
— deleting a non-existent row is a no-op and that's fine.

**Contract**: Procedure input is `z.object({ roomId: z.string() })`. Uses
`ctx.db.delete(roomThresholds).where(eq(roomThresholds.roomId, input.roomId))`. Returns
`{ success: true as const }`. No additional imports required — `eq` and `roomThresholds` are
already in scope.

---

#### 2. Fix numeric inputs + wire Reset button

**File**: `src/app/_components/setup/room-threshold-form.tsx`

**Intent A — input fix**: Replace `type="number"` + `step="0.5"` on all three inputs with
`type="text"` + `inputMode="decimal"`. Update each `onChange` to normalize comma→period
before writing to state, per the lessons.md rule for locale-agnostic numeric inputs.

**Contract A**: Each input's `onChange` becomes:
`onChange={(e) => setX(e.target.value.replace(",", "."))}` where `setX` is the relevant
setter. The `step` prop is removed entirely. No other input attributes change.

**Intent B — Reset button**: Add a `clearThreshold` mutation and a "Reset to global
defaults" button in the existing `<div className="flex gap-2">` button row. The button is
rendered only when `data !== null` (i.e., an override exists). On success it shows a toast,
invalidates `device.overview`, and calls `onClose()` — identical post-action flow as Save.

**Contract B**: The mutation is wired as:
```ts
const clearMutation = api.room.clearThreshold.useMutation({
  onError: (e) => setFormError(e.message),
  onSuccess: () => {
    toast.success("Reset to global defaults");
    void utils.device.overview.invalidate();
    onClose();
  },
});
```
Button: `<Button onClick={() => clearMutation.mutate({ roomId })} type="button" variant="outline" disabled={clearMutation.isPending}>Reset to global</Button>`. Rendered after Cancel, conditionally on `data !== null`. Biome alphabetical import ordering must be respected — no new imports needed (all hooks already imported).

---

### Success Criteria:

#### Automated Verification:

- Type checking passes: `pnpm typecheck`
- Linting passes: `pnpm lint`

#### Manual Verification:

- Set a custom threshold for a room (e.g., 15/30/2), save it. Reopen the form — values
  appear pre-filled. Click "Reset to global defaults" → toast fires, form closes.
- Reopen the form for the same room — inputs show 18/24/3 (global defaults), "Reset to
  global" button is now hidden (no override row exists).
- Open the form for a room that has NO override — "Reset to global" button is absent.
- Enter `18,5` in a Min °C field — it normalizes to `18.5` in the input on keystroke. Save
  works normally.

**Implementation Note**: After automated verification passes, pause for manual confirmation
before the phase-end commit.

---

## Testing Strategy

### Manual Testing Steps:

1. Setup → Rooms → gear icon on any room → form opens
2. Set thresholds to non-default values and save
3. Re-open form — verify values are pre-filled, "Reset to global" button is visible
4. Click "Reset to global" — verify toast "Reset to global defaults", form closes
5. Re-open form — verify inputs show 18/24/3, "Reset to global" button absent
6. Test comma input: type `20,5` in any field — verify it normalizes to `20.5`

## References

- Frame brief: `context/changes/per-room-thresholds/frame.md`
- Lessons rule: `context/foundation/lessons.md` — "Native typed `<input>` elements can desync"
- Router: `src/server/api/routers/room.ts:273–334`
- Form: `src/app/_components/setup/room-threshold-form.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: clearThreshold Mutation + Form Hardening

#### Automated

- [x] 1.1 Type checking passes: pnpm typecheck
- [x] 1.2 Linting passes: pnpm lint

#### Manual

- [ ] 1.3 Reset flow: set threshold, reopen, Reset to global → toast + close; reopen → defaults + button hidden
- [ ] 1.4 Room with no override: Reset to global button absent
- [ ] 1.5 Comma input normalizes: type 20,5 → becomes 20.5 on keystroke
