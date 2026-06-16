# Room → Site Reassignment Implementation Plan

## Overview

Add a transactional `room.setSite` mutation that moves a room — together with
its assigned devices and, when exclusive to it, its gateway — to a different
site in one atomic operation, plus a confirmation-gated UI entry point in
Setup → Rooms.

## Current State Analysis

`rooms.siteId`, `devices.siteId`, and `gateways.siteId` are three
independent, `notNull` columns (`src/server/db/schema.ts:58`, `:80`, `:115`),
each with its own FK to `sites.id` (`onDelete: "restrict"`). No FK or trigger
keeps them in sync, and no mutation anywhere updates any of them after row
creation — `room.ts` only has `rename` (name only, `room.ts:72-86`) and
`setDeviceRoom` (which validates but never changes `siteId`,
`room.ts:108-150`). The only existing cross-entity site guards are
**block**-style: `room.delete` refuses when devices are still assigned
(`room.ts:88-106`), `site.delete` refuses when the site still has rooms or
gateways (`site.ts:50-89`). `device.move` (`device.ts:128-180`) is the one
existing mutation that wraps a multi-row update in `ctx.db.transaction`,
making it the right structural precedent for this feature rather than the
delete guards.

`room.list` (`room.ts:15-41`) currently filters by `siteId` but does not
return each room's own `siteId` in its output — the UI has no way today to
know which site a room belongs to once rooms from multiple sites are mixed
together (the "All Sites" view).

No gateway-management UI exists anywhere in `src/app/_components/` — gateways
are backend/seed-only today, so the gateway side of this feature has no UI
surface to build, only backend logic.

### Key Discoveries:

- `device.overview` filters by `devices.siteId` but joins rooms regardless of
  `rooms.siteId` (`device.ts` overview query) — if only `rooms.siteId`
  changed, Setup → Rooms (`room.list`, filtered by `rooms.siteId`) and the
  Dashboard (`device.overview`, filtered by `devices.siteId`) would disagree
  about which site a moved room belongs to. This is the concrete evidence
  that devices must cascade with the room, not just a correctness nicety.
- Seed data (`src/server/db/seed.ts:49-99`) shows one gateway per site with
  all of that gateway's devices sharing the site — confirms gateway↔room is
  1:1 in practice, though the schema does not enforce it.
- `room.test.ts` and `site.test.ts` establish the test conventions to extend:
  module-level `vi.mock` for `auth`/`db`, `createCaller` from `~/server/api/root`,
  auth-gate tests asserting `UNAUTHORIZED`, and — critically — guard-blocking
  tests that assert the downstream mutation mock was **never called**, not
  just that an error was thrown (`room.test.ts`'s `CROSS_SITE_ASSIGNMENT` test
  calls this "the highest-signal test").
- Per `context/foundation/lessons.md`, any `Select` whose value can start
  non-empty from server data needs an explicit `items` prop. The new per-room
  site-picker always starts empty (it's a one-shot action trigger, not
  persisted state), so this specific bug class doesn't apply, but `items` is
  still passed for consistency with the rest of the codebase.

## Desired End State

A user can pick a new site for a room directly in Setup → Rooms. After
confirming, the room, all of its currently-assigned devices, and (if no
other room shares it) its gateway move to the new site in one atomic step.
`room.list` and `device.overview` agree about the room's site immediately
after the move. If the room's gateway is shared with a device assigned to a
different room, the whole move is rejected with a clear error and nothing
changes.

Verify by: moving a room with devices in the UI, confirming it now appears
under the new site in both Setup → Rooms and the Dashboard, and confirming
the old site no longer shows it or its devices.

## What We're NOT Doing

- No UI for gateway management — the gateway cascade is backend-only, since
  no gateway UI exists in this codebase today and this feature doesn't add one.
- No bulk/multi-room move — one room at a time, matching the "mislabeled at
  setup" correction framing (not a bulk re-org tool).
- No retroactive re-validation of already-existing `CROSS_SITE_ASSIGNMENT`
  cases — this feature only handles the forward move; it does not audit or
  fix any pre-existing inconsistency.
- No automatic detachment or reassignment of devices on a blocked
  (gateway-shared) move — the user must resolve the conflict manually, same
  as `room.delete`'s existing "reassign them first" pattern.

## Implementation Approach

Model the new mutation directly on `device.move`'s existing structure:
validate everything that can be checked without writing, then perform every
write inside a single `ctx.db.transaction`. The gateway-exclusivity check
(does this gateway serve any device outside this room?) is the one genuinely
new piece of logic; everything else — site/room existence checks, the
transaction wrapper, the TRPCError code/message style — follows established
patterns in `room.ts` and `device.ts` directly.

## Critical Implementation Details

**Gateway exclusivity check.** "Exclusive to this room" means *every* device
on that gateway is currently assigned (via `deviceRoomAssignments`) to the
room being moved — a device on the same gateway that is unassigned (no room)
or assigned to a different room both count as non-exclusive and must block
the entire move. (An unassigned device counts because, after the move, the
gateway's `siteId` would change while that device's `siteId` stays put,
reintroducing exactly the inconsistency this feature exists to prevent.)
Concretely: collect the distinct, non-null `gatewayId`s among the moving
room's assigned devices, then for each one check whether any device on that
`gatewayId` resolves (via a left join to `deviceRoomAssignments`) to a room
other than this one, or to no room at all. If so, throw before any write
happens — do not begin the transaction.

**Site-picker as an action trigger, not persisted state.** The per-room
`Select` added in Phase 3 never holds onto the selected value — selecting an
option opens the confirmation dialog and the `Select`'s own `value` stays
`""` throughout (the dialog, not the `Select`, is the source of truth for
the pending move). This is a deliberate deviation from the controlled-value
pattern used elsewhere in this file (e.g. the rename `Input`) — flagging it
so the implementer doesn't try to make the `Select` "remember" the chosen
site.

## Phase 1: Backend mutation — `room.setSite`

### Overview

Add the transactional mutation to `room.ts`, and add `siteId` to
`room.list`'s output so the UI can know each room's current site.

### Changes Required:

#### 1. `room.list` — expose `siteId` per room

**File**: `src/server/api/routers/room.ts`

**Intent**: The UI needs to know each room's current site to exclude it from
the move-target picker, especially in the "All Sites" view where rooms can
belong to different sites.

**Contract**: Add `siteId: room.siteId` to the object returned from the
`.map()` in the `list` procedure (`room.ts:36-40`). Additive change — no
existing caller destructures this object exhaustively, so this is non-breaking.

#### 2. `room.setSite` mutation

**File**: `src/server/api/routers/room.ts`

**Intent**: Atomically reassign a room, its assigned devices, and (when
exclusive) its gateway to a new site.

**Contract**: New `protectedProcedure` named `setSite`, input
`{ roomId: z.string(), targetSiteId: z.string() }`. Validation order (each
check runs before any write, matching `device.move`'s validate-then-transact
shape):

1. Target site exists (`select id from sites where id = targetSiteId`) —
   else `TRPCError({ code: "BAD_REQUEST", message: "Site not found" })`,
   reusing `create`'s exact wording (`room.ts:53-55`).
2. Room exists (`select id, siteId from rooms where id = roomId`) — else
   `TRPCError({ code: "NOT_FOUND", message: "Room not found" })`, matching
   `rename`/`setThreshold`.
3. `room.siteId !== targetSiteId` — else `TRPCError({ code: "BAD_REQUEST", message: "Room is already assigned to this site" })`.
4. Gateway exclusivity (see Critical Implementation Details above) — else
   `TRPCError({ code: "BAD_REQUEST", message: "GATEWAY_SHARED_WITH_OTHER_ROOM" })`,
   matching the bare-uppercase-code convention already used for
   `CROSS_SITE_ASSIGNMENT` (`room.ts:130-133`).

Then, inside one `ctx.db.transaction`:
- `update rooms set siteId = targetSiteId where id = roomId`
- `update devices set siteId = targetSiteId where id in (<assigned device ids>)` (skip if none)
- `update gateways set siteId = targetSiteId where id in (<exclusive gateway ids>)` (skip if none)

Return `{ success: true as const }`, matching `delete`/`setThreshold`/`move`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`

#### Manual Verification:

- `npm run db:studio` — manually move a room with devices via a direct
  `room.setSite` call (tRPC devtools or a temporary script) and confirm
  `room`, `device`, and `gateway` rows all show the new `site_id`.

---

## Phase 2: Tests for `room.setSite`

### Overview

Extend `room.test.ts` with coverage for the new mutation, following its
existing conventions exactly.

### Changes Required:

#### 1. `room.setSite` test coverage

**File**: `src/server/api/routers/room.test.ts`

**Intent**: Cover the auth gate, the happy-cascade path, every rejection
path, and the two structural edge cases (no gateway, no devices) named in
the Frame Brief and this plan.

**Contract**: Add a `describe("setSite", ...)` block with:
- Auth gate: `session: null` → `UNAUTHORIZED`, mirroring the existing
  pattern for other mutations in this file.
- Happy path: room with 2+ devices on one gateway exclusive to this room →
  all three tables' update mocks are called with the new `siteId`.
- Same-site rejection: `targetSiteId === room.siteId` → `BAD_REQUEST`,
  asserts no update mock was called.
- Target site not found → `BAD_REQUEST`, asserts no update mock was called.
- Gateway shared with a different room → `BAD_REQUEST` with
  `GATEWAY_SHARED_WITH_OTHER_ROOM`, asserts no update mock was called (the
  "highest-signal" pattern from the existing `CROSS_SITE_ASSIGNMENT` test).
- Gateway shared with an *unassigned* device (no room) → same rejection,
  covering the "unassigned counts as non-exclusive" rule from Critical
  Implementation Details.
- No-gateway room (devices have `gatewayId: null`) → succeeds, only `rooms`
  and `devices` updates run, no `gateways` update.
- No-devices room → succeeds, only the `rooms` update runs.

### Success Criteria:

#### Automated Verification:

- New tests pass: `npm run test`
- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`

#### Manual Verification:

- None — this phase is fully covered by automated tests.

---

## Phase 3: UI — move-to-site picker in Setup → Rooms

### Overview

Add a per-room inline site-picker that opens a confirmation dialog before
calling `room.setSite`, wired into the existing error/toast/invalidate
pattern in `room-manager.tsx`.

### Changes Required:

#### 1. Pass `sites` down from `setup-shell.tsx`

**File**: `src/app/_components/setup/setup-shell.tsx`

**Intent**: `RoomManager` needs the full site list to build the move-target
picker; `setup-shell.tsx` already fetches it via `sitesQuery`.

**Contract**: Pass `sites={sitesQuery.data ?? []}` as a new prop to
`<RoomManager>` (`setup-shell.tsx:53`).

#### 2. Per-room move-to-site picker + confirmation dialog

**File**: `src/app/_components/setup/room-manager.tsx`

**Intent**: Let the user pick a new site for a room, confirm the cascading
move (room + N device(s)), and surface success/failure the same way every
other mutation in this file already does.

**Contract**:
- New `sites: { id: string; name: string }[]` prop (typed from
  `RouterOutputs["site"]["list"]`).
- New `setSiteMutation = api.room.setSite.useMutation({ onError: (e) => setError(e.message), onSuccess: () => { toast.success("Room moved"); setMoveTarget(null); invalidate(); } })`.
- New state `moveTarget: { room: RoomItem; siteId: string; siteName: string } | null`.
- Per room row, when `sites.length > 1` (mirroring `PageShell`'s identical
  guard for its own site switcher), render a `Select` whose `items` are
  every site **except** `room.siteId`, placeholder `"Move to site…"`,
  `value=""` always (see Critical Implementation Details — it's a one-shot
  trigger, not persisted state). `onValueChange` looks up the chosen site by
  id and sets `moveTarget`.
- A `Dialog` (reusing `~/components/ui/dialog` primitives), open whenever
  `moveTarget !== null`, showing `Move "${moveTarget.room.name}" and its
  ${moveTarget.room.deviceCount} device(s) to ${moveTarget.siteName}?` with
  Cancel (clears `moveTarget`) and Confirm (`setSiteMutation.mutate({ roomId: moveTarget.room.id, targetSiteId: moveTarget.siteId })`) buttons.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run check`
- All existing tests pass: `npm run test`

#### Manual Verification:

- In the browser: open Setup → Rooms with 2+ sites configured, pick a
  different site for a room with devices, confirm the dialog text matches
  the room/device count, confirm, and see the room disappear from the
  current site's list and the toast confirm success.
- Verify the moved room's devices now show the new site in the Dashboard
  (`device.overview`).
- Verify a room sharing a gateway with another room's device shows the
  `GATEWAY_SHARED_WITH_OTHER_ROOM` error inline and nothing changes.
- Verify the current site never appears as an option in the room's own
  move-to-site picker.
- Verify the picker is hidden entirely when only one site exists.

---

## Testing Strategy

### Unit Tests:

- All `room.setSite` paths listed in Phase 2.

### Integration Tests:

- None added — the existing tRPC router test style (mocked `db`) already
  exercises the full mutation logic; no separate integration layer exists in
  this codebase for routers.

### Manual Testing Steps:

1. With 2+ sites and a room that has devices on its own exclusive gateway,
   move it via the UI; confirm room+devices+gateway all show the new site in
   `npm run db:studio`.
2. Attempt to move a room whose gateway also serves a device in a different
   room; confirm the move is rejected and nothing changes.
3. Move a room with no devices; confirm it succeeds with no device/gateway
   side effects.
4. Confirm the current site is never offered as a move target, and the
   picker disappears when there's only one site.

## Performance Considerations

None — this is a single small transaction touching at most a handful of rows
(one room, its devices, at most one gateway), well within the existing
`device.move` transaction's already-proven shape.

## Migration Notes

No schema migration needed — this feature only updates existing `siteId`
columns introduced by the `multi-site` change; no new tables or columns.

## References

- Frame brief: `context/changes/room-site-reassignment/frame.md`
- Structural precedent: `src/server/api/routers/device.ts:128-180` (`move`)
- Existing block-style guards: `src/server/api/routers/room.ts:88-106`,
  `src/server/api/routers/site.ts:50-89`
- Schema: `src/server/db/schema.ts:43-158`
- Test conventions: `src/server/api/routers/room.test.ts`,
  `src/server/api/routers/site.test.ts`
- Prior multi-site work: `context/changes/multi-site/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend mutation — `room.setSite`

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run check`

#### Manual

- [x] 1.3 `npm run db:studio` — manually move a room with devices and confirm `room`, `device`, and `gateway` rows all show the new `site_id`

### Phase 2: Tests for `room.setSite`

#### Automated

- [ ] 2.1 New tests pass: `npm run test`
- [ ] 2.2 Type checking passes: `npm run typecheck`
- [ ] 2.3 Linting passes: `npm run check`

### Phase 3: UI — move-to-site picker in Setup → Rooms

#### Automated

- [ ] 3.1 Type checking passes: `npm run typecheck`
- [ ] 3.2 Linting passes: `npm run check`
- [ ] 3.3 All existing tests pass: `npm run test`

#### Manual

- [ ] 3.4 Move a room with devices via the UI; confirm dialog text matches room/device count; confirm; room disappears from current site's list; toast confirms success
- [ ] 3.5 Verify moved room's devices show the new site in the Dashboard (`device.overview`)
- [ ] 3.6 Verify a room sharing a gateway with another room's device shows the `GATEWAY_SHARED_WITH_OTHER_ROOM` error inline and nothing changes
- [ ] 3.7 Verify the current site never appears as an option in the room's own move-to-site picker
- [ ] 3.8 Verify the picker is hidden entirely when only one site exists
