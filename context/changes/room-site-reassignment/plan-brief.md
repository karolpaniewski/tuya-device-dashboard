# Room → Site Reassignment — Plan Brief

> Full plan: `context/changes/room-site-reassignment/plan.md`
> Frame brief: `context/changes/room-site-reassignment/frame.md`

## What & Why

The actual problem is to provide an atomic, transactional "fix the site
label" operation that reassigns a room's `siteId` together with the `siteId`
of its assigned devices and — when that gateway exclusively serves this
room — the gateway's `siteId`, in one move, rather than adding an isolated
single-column `room.siteId` edit. The literal request ("let me edit a room's
site") would otherwise leave `devices.siteId` and `gateways.siteId` silently
inconsistent, since nothing today keeps these three independent columns in
sync.

## Starting Point

`rooms.siteId`, `devices.siteId`, and `gateways.siteId` are three
independent, required columns with no FK or trigger tying them together.
No mutation anywhere updates any of them after creation. The codebase's
existing cross-entity site guards (`room.delete`, `site.delete`) all
**block** rather than cascade. `device.move` is the one existing mutation
that wraps a multi-row update in a transaction — the structural template
this plan follows. No UI for moving a room's site exists today, and no
gateway-management UI exists at all.

## Desired End State

In Setup → Rooms, a user picks a new site for a room, confirms a dialog
showing how many devices will move with it, and the room + its devices +
(when exclusive) its gateway all land on the new site atomically. Setup →
Rooms and the Dashboard agree about the room's site immediately afterward.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Cascade scope | Room + devices + gateway (when exclusive) | Anything less leaves `siteId` columns silently inconsistent across the dashboard vs. setup views | Frame |
| Gateway shared with another room | Block the entire move | Matches the codebase's existing block-don't-corrupt convention; cascading would silently strand the other room's devices | Plan |
| Confirmation before submit | Show a confirmation dialog | This is a multi-entity cascade, materially heavier than the existing instant inline rename | Plan |
| UI entry point | Inline per-room site-picker | Consistent with the existing per-row inline-edit pattern (rename) | Plan |
| Same-site target | Excluded from the picker entirely | Removes the question at the UI layer instead of needing an error message | Plan |
| Implementation pattern | `ctx.db.transaction`, modeled on `device.move` | Existing, proven precedent for multi-row atomic updates in this codebase | Plan |

## Scope

**In scope:**
- New `room.setSite` transactional mutation (room.ts)
- `room.list` exposing each room's `siteId`
- Inline move-to-site picker + confirmation dialog in `room-manager.tsx`
- Full test coverage for the new mutation's happy/blocked/edge paths

**Out of scope:**
- Gateway management UI (none exists; cascade is backend-only)
- Bulk/multi-room moves
- Retroactively auditing or fixing pre-existing site inconsistencies
- Automatic device reassignment when a move is blocked

## Architecture / Approach

A single new tRPC mutation validates target site existence, same-site
rejection, and gateway exclusivity (does any other room's device, or an
unassigned device, share this room's gateway?) before opening one
`ctx.db.transaction` that updates `rooms`, `devices`, and optionally
`gateways`. The UI is a thin trigger: a per-room `Select` opens a
confirmation dialog, which calls the mutation and reuses the file's existing
error/toast/invalidate plumbing.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend mutation | `room.setSite` + `room.list.siteId` | Gateway-exclusivity query logic is the one genuinely new piece — must treat unassigned devices on the gateway as non-exclusive too |
| 2. Tests | Full coverage of happy/blocked/edge paths | Missing the "unassigned device blocks too" case would let a real bug ship silently |
| 3. UI | Inline picker + confirm dialog in Setup → Rooms | Select-as-action-trigger deviates from this file's usual controlled-value pattern — easy to implement as persisted state by mistake |

**Prerequisites:** None — no schema changes, builds entirely on existing `multi-site` columns.
**Estimated effort:** ~1 session across 3 phases (small, well-precedented surface).

## Open Risks & Assumptions

- Assumes gateway↔room is 1:1 in practice (confirmed via seed data and user
  answer in the Frame Brief) — the exclusivity check still defensively
  handles the schema-permitted multi-room case by blocking rather than
  assuming it can't happen.
- No retroactive fix for any `siteId` drift that may already exist from
  before this feature shipped — only forward moves are covered.

## Success Criteria (Summary)

- Moving a room with devices in the UI updates room, devices, and (when
  exclusive) gateway atomically, and both Setup → Rooms and the Dashboard
  reflect the new site immediately.
- A move blocked by a shared gateway leaves all rows unchanged and shows a
  clear error.
- All new and existing automated tests pass; no manual verification step is
  skipped.
