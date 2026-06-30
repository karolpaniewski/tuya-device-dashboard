# Frame Brief: Room → Site Reassignment

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

There is currently no way to move/reassign a room to a different site.

## Initial Framing (preserved)

- **User's stated cause or approach**: the user wants new functionality to let a room be reassigned to a different site.
- **User's proposed direction**: add a feature/UI to change a room's site.
- **Pre-dispatch narrowing**: the room being moved usually has devices assigned already (not the empty edge case); the user wants devices to move together with the room, not stay behind; and the scope should be broader than rooms alone — rooms, gateways, and devices together.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Room-only edit** — add a `siteId` field/mutation on rooms only, leave devices untouched.  ← initial literal framing
2. **Room + cascading device site update** — also update `devices.siteId` for every device currently assigned to that room.
3. **Gateway-anchored move** — reframe the unit of the operation to the gateway (the real physical/network boundary), cascading down to its devices and the rooms they're assigned to.
4. **Block-and-guide (established convention)** — mirror this codebase's existing `room.delete`/`site.delete` pattern: block the site change while devices/gateway are still attached, forcing manual reassignment first.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Room-only edit | `room.ts` has no site-change mutation today; `rename` only touches `name` (room.ts:72-86). User explicitly said devices should follow the room (narrowing Q2). | WEAK — contradicts the user's own stated intent |
| 2. Room + cascading device update | `rooms.siteId`, `devices.siteId`, `gateways.siteId` are three independent `notNull` columns with no FK tying them together (schema.ts:43-158); the `CROSS_SITE_ASSIGNMENT` guard is only checked at assignment time, in two call sites (room.ts:129-134, device.ts:150-155); no mutation anywhere updates any `siteId` after row creation (confirmed via grep across workers/routers/seed). User confirmed rooms usually have devices (Q1) and devices should follow (Q2). | STRONG for room+devices, but incomplete alone — doesn't address the gateway |
| 3. Gateway-anchored move | Seed data shows exactly one gateway per site, with every device under it sharing that site (seed.ts:49-99). `multi-site/change.md` frames the model as "each site has its own rooms, gateways, and devices" — a clean partition. User confirmed scope should include gateways (Q3) and confirmed that in practice one room maps to exactly one gateway (topology answer). | STRONG — the gateway must move with the room's devices, or the device↔gateway site relationship (always implicitly consistent today, never actually checked) breaks silently |
| 4. Block-and-guide convention | `room.delete` blocks when devices are assigned: "Room has assigned devices — reassign them first" (room.ts:96-101). `site.delete` blocks when the site still has rooms or gateways: `SITE_NOT_EMPTY` (site.ts:61-83). This is the codebase's consistent house style for cross-entity site integrity. | WEAK as a literal pattern match — the user explicitly wants cascade, not a block; but `device.move`'s existing `ctx.db.transaction` wrapper (device.ts:158-178) is the right structural precedent for *how* to implement a safe cascade |

## Narrowing Signals

- **Trigger question** resolved the framing decisively: this is a **mislabeled-at-setup correction**, not a live physical relocation ("Mislabeled at setup" was the chosen answer). Nothing physically moves — the room/gateway/devices were assigned to the wrong site when first created. This rules out treating the gateway as immovable hardware that can't follow, and supports a same-transaction relabel of room + gateway + devices rather than a block-until-manually-cleared guard.
- **Topology question** confirmed: in this deployment, a room's devices always share one gateway. This makes "cascade from room → its devices → their shared gateway" structurally safe in the common case — but see the open edge case below, which this answer does not fully rule out at the schema level.

## Cross-System Convention

This codebase's two existing cross-entity site-integrity guards (`room.delete`, `site.delete`) both **block** rather than cascade — that convention exists to prevent *accidental* orphaning during destructive (delete) operations. The reframed problem here is a different shape: a deliberate, atomic *correction* across a cluster that's already known to be consistent in practice, which is structurally closer to `device.move`'s existing pattern of wrapping multi-row updates in `ctx.db.transaction` (device.ts:158-178) than to the delete guards' block-and-refuse pattern.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: provide an atomic, transactional "fix the site label" operation that reassigns a room's `siteId` together with the `siteId` of its assigned devices and — when that gateway exclusively serves this room — the gateway's `siteId`, in one move, rather than adding an isolated single-column `room.siteId` edit.

The literal initial framing ("add a way to edit a room's site") would leave `devices.siteId` and `gateways.siteId` silently inconsistent with the room's new site, since nothing today keeps these three independent columns in sync and no other code path ever updates them after creation. The user's own answers — devices should follow, scope includes gateways, this is a setup-time mislabeling rather than a live relocation — all point at a single cluster-correction operation, not a single-column edit.

One edge case the reframe does **not** fully resolve, and `/10x-plan` must decide explicitly: the schema allows one gateway to serve devices assigned to *multiple* rooms (gateway↔room is not 1:1 in the data model — it's only observed to be 1:1 in this deployment's actual data). The plan needs a concrete rule for what happens if the room being moved shares its gateway with devices assigned to a *different* room that is not moving — e.g., detect this case and block with a clear error, versus only ever cascading the gateway's `siteId` when it exclusively serves the room being moved.

## Confidence

**HIGH** — strong evidence from source (schema.ts, room.ts, device.ts, site.ts, seed.ts) plus two decisive, unambiguous narrowing answers from the user. The one open edge case (a gateway shared across rooms) is named explicitly rather than papered over, and is a `/10x-plan`-level decision, not a framing gap.

## What Changes for /10x-plan

Plan a single transactional mutation (e.g. `room.setSite`) that: validates the target site exists, updates the room's `siteId`, updates `siteId` on every device currently assigned to that room (via `deviceRoomAssignments`), and updates the shared gateway's `siteId` — but only after explicitly checking whether that gateway also serves devices in other rooms, with a defined behavior (block vs. partial cascade) for that case. Model the implementation on `device.move`'s transaction pattern, not on a single-column room edit and not on the delete guards' block pattern.

## References

- Source files: `src/server/api/routers/room.ts:43-150`, `src/server/api/routers/site.ts:50-89`, `src/server/api/routers/device.ts:128-180`, `src/server/db/schema.ts:43-158`, `src/server/db/seed.ts:49-99`
- Related research: `context/changes/multi-site/change.md` (introduced the three independent `siteId` columns; explicitly scoped out cross-site concerns)
- Investigation: direct source reads this session — the codebase surface was small and well-bounded enough that sub-agent dispatch would have been padding (no hypothesis needed agent-scale investigation)
