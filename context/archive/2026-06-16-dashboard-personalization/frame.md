# Frame Brief: Personalized Dashboard Layout (Drag-and-Drop)

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

No bug, no user complaint — this is greenfield feature ideation. The user's
seed idea during brainstorming: "Click and drag widgets, to personalize
dashboard." No specific pain (scroll fatigue, irrelevant info, etc.) was
articulated beyond the general desire to personalize the view.

## Initial Framing (preserved)

- **User's stated cause or approach**: full drag-and-drop reordering, built on
  the already-present `@dnd-kit` dependency (already used for device-within-room
  DnD in `device-overview.tsx`).
- **User's proposed direction**: (1) make the summary area — 4 KPI cards + donut
  "By Room" chart + `RoomTemperaturePanel` — reorderable/hideable widgets, (2)
  make room groups (`SiteSection`/`RoomGroup` rendering) draggable into a custom
  order, (3) persist the result **per-user**, with a new userId-scoped
  layout-preference store.
- **Pre-dispatch narrowing**: captured via two `AskUserQuestion` rounds in the
  preceding brainstorming turn (before this skill was invoked): Scope =
  "Summary + per-room order" (the broader of two options — rejected the
  narrower "summary widgets only" recommendation). Persistence = "Per-user"
  (the option marked recommended at the time). The user then explicitly asked
  to frame this before planning, specifically to pressure-test whether full
  drag-and-drop is the right weight vs. simpler alternatives.

## Dimension Map

The stated approach could break down at any of these dimensions:

1. **Identity model** — does "per-user" mean anything distinct in this app, or
   is there only one effective user? ← user's framing lands here
2. **Mechanism weight** — does the value here require pointer-drag reordering,
   or would simpler controls (pin/favorite, show/hide, up/down) deliver the
   same outcome for the actual item counts involved?
3. **Data-shape bundling** — are "reorder 4 fixed widgets" and "reorder N
   rooms" actually one feature with one storage shape, or two structurally
   different problems being bundled under one DnD label?

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **1. Identity model**: "per-user" presumes distinct per-person accounts that don't exist | `src/server/db/schema.ts:25-41` — `users` table has no per-user preference/settings table anywhere in the 9-table schema. `src/server/auth.ts:23-25` — `NextAuth({...})` has no adapter; `session: { strategy: "jwt" }`. `auth.ts:38-61` — sole provider is `Credentials`; `authorize` looks up one row by email, bcrypt-compares, returns `{id, email}`. `src/server/db/seed.ts:8-9,28-37` — exactly one admin row, upserted by email from `AUTH_ADMIN_EMAIL`/`AUTH_ADMIN_PASSWORD` env vars via `onConflictDoUpdate`. No `/signup` or registration route exists under `src/app`. `prd.md:140,142` — "Role model: flat. All authenticated users have identical access... No role separation in MVP." `prd-v2.md:118` — "one user type, full access after email+password login" (Polish, paraphrased). | **STRONG** |
| **2. Mechanism weight**: drag-and-drop is heavier than the item counts justify | Widget set is fixed at ~4 KPI cards + 1 donut + 1 temp panel (`device-overview.tsx:357-449`, `:454-456`) — never grows. Room count scales with sites (multi-site shipped, S-13) but no concrete count found; persona is "facility manager / 2-5 person admin team... multiple office rooms" (`prd.md:26-30`) — likely modest, not large-N. No articulated complaint about *ordering* specifically (vs. general "personalize") exists to confirm or rule this out. | **WEAK / inconclusive** — genuinely open, not resolved by evidence either way |
| **3. Data-shape bundling**: "widgets" and "rooms" are one feature with one storage shape | Rooms have **no** `sortOrder`/`position` column today — `rooms` table (`schema.ts:72-92`) only has `id/name/siteId/createdAt/updatedAt`; `room.list` orders by `.orderBy(rooms.createdAt)` (`room.ts:~25-26`), i.e. insertion time, both in the per-site and `siteId==="all"` branches. By contrast, `devices.sortOrder` already exists (`schema.ts:114`) and is mutated via `device.reorder`/`device.move` (`device.ts:93-126`, `:128-180`), scoped per-`siteId`, independent of room membership (`deviceRoomAssignments`). A "room order" feature would need a brand-new schema column mirroring this pattern; a "widget order/visibility" feature needs only a small ordered-list/hidden-set blob. These are not the same data shape. | **STRONG** — confirmed structurally distinct, not evidenced as wrong to do, but evidenced as wrongly bundled into one undifferentiated "drag-and-drop" label |

## Narrowing Signals

- `prd-v2.md:120` (Polish, paraphrased): "Light/dark theme preference is stored
  client-side — requires no changes to the database schema, role model, or
  session." This sits directly under the PRD's `## Access Control Changes`
  section, which reaffirms the single-account, flat-access model. This is the
  most recent shipped slice (S-17, `roadmap.md:50`, done) facing the *exact*
  same "let the user customize their view" shape this brief is investigating —
  and it explicitly chose not to scope the preference by account.
- `device-overview.tsx:321` — `dndEnabled = activeFilterCount === 0`: the
  existing device-DnD is already disabled whenever any filter is active,
  because the visible set shifts under the user's hands. A room-order DnD
  layer would inherit the same problem one level up (filtering by type/status
  can shrink `filteredRooms` to a subset), which is a real implementation
  wrinkle worth flagging forward to `/10x-plan` rather than resolving here.

## Cross-System Convention

This codebase has handled "let the user customize their view" exactly once
before — `next-themes`, `localStorage` key `"theme"` (`src/app/layout.tsx:41-46`,
`theme-toggle.tsx:7-8,13`) — browser-local, not account-scoped, specifically
*because* there is no meaningful per-account distinction to scope against. The
leading hypothesis (dimension 1) matches this convention directly.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: a dashboard layout preference
> store scoped to the only identity boundary that actually exists today (the
> single shared login / the browser session), not a `userId`-keyed table that
> would, in practice, only ever hold one row — and treated as two
> structurally distinct sub-problems (bounded widget order+visibility vs.
> open-ended room order, which needs a new `rooms.sortOrder` column that
> doesn't exist yet) rather than one homogeneous "drag-and-drop" feature.

Building real per-`userId` storage today buys nothing: every person on the
2-5-person facility team authenticates as the same single seeded `users` row
(`seed.ts:28-37`), so a `userId` foreign key would be a permanent
cardinality-1 dimension — pure schema complexity with no behavioral payoff
unless multi-account login ships first (which is not on the roadmap, per the
PRD/roadmap research: no slice mentions multi-account support). The S-17
theme precedent shows this exact call was already made deliberately, not by
oversight. The widgets-vs-rooms bundling is a secondary but still load-bearing
finding: the plan should treat them as two phases with two different schema
shapes, not one.

The mechanism-weight question (dimension 2 — is full pointer-DnD the right
interaction at all, vs. simpler controls) remains genuinely open. The evidence
here is inconclusive in either direction, and resolving it is a solution
choice, not a framing fact — it belongs to `/10x-plan`'s question set, not
this brief.

## Confidence

**HIGH** — dimension 1 (identity model) and dimension 3 (data-shape bundling)
both have direct, multi-source evidence (schema, auth code, PRD text, and a
directly analogous shipped precedent) and zero contradicting evidence found.
Dimension 2 (mechanism weight) is explicitly left open rather than forced to a
verdict — see "What Changes for /10x-plan" below.

## What Changes for /10x-plan

`/10x-plan` should NOT plan a `userId`-scoped preference table. It should plan
a layout-preference store scoped to the actual identity boundary in this app
(single shared account → effectively a global/deployment-level singleton, or
browser-local if independence across devices matters more than continuity —
both avoid inventing a meaningless per-user dimension). It should also plan
the widget-order/visibility piece and the room-order piece as two distinct
phases with two distinct data shapes, the latter requiring a new
`rooms.sortOrder` (or similar) column mirroring `devices.sortOrder`. It should
explicitly ask the user to pick the interaction mechanism (full DnD vs.
simpler pin/hide/reorder controls) as a first-class solution-design question,
since this brief found no conclusive evidence either way — plus how room-order
DnD should behave when filters shrink the visible room set, mirroring the
existing `dndEnabled` guard.

## References

- Source files: `src/server/db/schema.ts:25-41,72-92,114`,
  `src/server/auth.ts:23-61`, `src/server/db/seed.ts:8-9,28-37`,
  `src/server/api/routers/room.ts:16-43`,
  `src/server/api/routers/device.ts:93-180`,
  `src/app/_components/device-overview.tsx:321,342-456,551-622`,
  `src/app/layout.tsx:28-46`, `src/components/theme-toggle.tsx:7-13`
- PRD/roadmap: `context/foundation/prd.md:26-30,140-142`,
  `context/foundation/prd-v2.md:118-120`, `context/foundation/roadmap.md:47-50`
- Related decision precedent: S-17 visual-ux-redesign (theme persistence),
  `context/changes/visual-ux-redesign/`
