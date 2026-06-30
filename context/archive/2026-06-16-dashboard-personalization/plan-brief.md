# Personalized Dashboard Layout — Plan Brief

> Full plan: `context/changes/dashboard-personalization/plan.md`
> Frame brief: `context/changes/dashboard-personalization/frame.md`

## What & Why

A dashboard layout preference store scoped to the only identity boundary that
actually exists today (the single shared login), not a `userId`-keyed table
that would only ever hold one row — treated as two structurally distinct
sub-problems: bounded widget order+visibility, and open-ended room order.
The user's own brainstormed idea ("click and drag widgets to personalize
dashboard") is implemented at full weight: real pointer drag-and-drop for
both the 6 summary widgets and the room groups, with always-visible controls
rather than a separate edit mode.

## Starting Point

`device-overview.tsx` fuses 4 KPI stat cards + a donut chart into one
literal-array block with no per-item addressability; `RoomTemperaturePanel`
is its own component but not reorderable/hideable. Room order today is pure
`createdAt` insertion order — no `sortOrder`/`position` column exists on
`rooms` (unlike `devices`, which already has one). The app has exactly one
shared admin login (`seed.ts`, no adapter, no `/signup`), so the originally
assumed "per-user" persistence has no identity to scope by. The only existing
device-level drag-and-drop (`@dnd-kit`, `device-overview.tsx`) is disabled
whenever a filter narrows the visible device set.

## Desired End State

A logged-in user can drag any of the 6 summary widgets into a new order,
hide any of them, and bring a hidden one back via an always-visible "+N
hidden" affordance. Room groups drag into a custom order, both in "All
sites" view (per-site sections) and single-site view, unaffected by active
filters. All of this survives reloads and is visible identically from any
browser under the one shared login, because it's stored in a new DB table
rather than client storage.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Identity/persistence scope | Not per-`userId` — scoped to the app's actual single shared identity | A `userId` FK would be permanent cardinality-1 schema complexity with zero behavioral payoff under the current auth model | Frame |
| Widgets vs. rooms are two phases, two data shapes | Split into separate phases rather than one "drag-and-drop" feature | Widgets are a bounded order+visibility list; rooms need an open-ended, growing order list — structurally distinct | Frame |
| Storage mechanism | New DB singleton row (`dashboard_layout`, one row, `id: "default"`) | Rejected `localStorage`/cookie (existing precedents for theme/active-site) because the feature should look identical across browsers/devices under the shared login | Plan |
| Interaction mechanism | Full pointer drag-and-drop (not simple pin/hide controls) | Reuses the existing `@dnd-kit` patterns already proven in this codebase for device cards | Plan |
| Edit-mode affordance | Always-visible drag handles + hide controls, no "Customize" toggle | User explicitly rejected the recommended toggle in favor of always-on controls | Plan |
| Widget granularity | Card-level — all 4 KPI stat cards individually addressable (6 widgets total) | User explicitly rejected the recommended section-level (3-widget) grouping | Plan |
| Room order scope | One global order, applied within whichever grouping is currently rendered | Simpler than per-site independent ordering; matches how `groupBySite` already partitions a flat list at render time | Plan |
| Room dragging under active filters | No guard — stays enabled regardless of `activeFilterCount` | User explicitly rejected mirroring the existing device-DnD `dndEnabled` filter guard | Plan |
| Room-order storage shape | `roomOrder` JSON-text column on the same singleton row, not a new `rooms.sortOrder` column | Once a DB singleton row exists for widgets, a third JSON column is simpler than adding + site-scoping a new column on `rooms` — deviates from the frame's literal suggestion | Plan |

## Scope

**In scope:**
- New `dashboard_layout` table + `dashboardLayout` tRPC router (`get`/`save`)
- Splitting the fused KPI block into 6 independently addressable widgets
- Drag-and-drop reordering + hide/restore for all 6 widgets, always-visible controls
- Drag-and-drop reordering for room groups, one global order, no filter guard
- A "Reset layout" action back to defaults

**Out of scope:**
- Any `userId`-scoped storage or multi-account support
- Drag-and-drop for the "Unassigned" device group (stays pinned last)
- Per-site independent room ordering
- Any change to the existing device-card drag-and-drop, its `sortOrder` column, or its `dndEnabled` filter guard

## Architecture / Approach

One new singleton table holds three JSON-text columns (`widgetOrder`,
`hiddenWidgets`, `roomOrder`), mirroring the existing
`automationRules.daysOfWeek` JSON-in-text convention. A shared
`applySavedOrder` pure function sorts any list by a saved id-order, with new
items appended at the end. Two new, independent `DndContext` trees sit
alongside the existing device-card one in `device-overview.tsx` — one for
widgets, one for room groups — neither interacting with the other.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Persistence layer | `dashboard_layout` table, `dashboardLayout` router, `applySavedOrder` utility | Low — small, isolated, mirrors existing patterns exactly |
| 2. Widget reorder/hide | 6 addressable widgets, drag-and-drop, hide/restore, reset | Refactoring the fused KPI block without visually regressing the existing cards |
| 3. Room reorder | Independent room-group `DndContext`, global order applied per visible grouping | Splice-back math: a same-section reorder must not corrupt other sections' saved order |

**Prerequisites:** none beyond what's already in the repo (`@dnd-kit` already a dependency, Drizzle migration workflow already set up).
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- Two sibling `DndContext` trees (existing device-DnD + new widget-DnD + new room-DnD, three total) are assumed not to interfere with each other — dnd-kit supports this, but it's worth confirming visually once Phase 2/3 land.
- No frontend component-test convention exists in this repo; UI correctness for both new DnD layers relies on manual verification, consistent with how the existing device-DnD slice was verified.
- The frame brief flagged the interaction-mechanism question as genuinely open; the user resolved it during planning by choosing full drag-and-drop, so this risk is now closed.

## Success Criteria (Summary)

- Widgets and room groups can be dragged into a new order and hidden/restored, with changes surviving a reload and appearing identically in a second browser under the same login
- The existing device-card drag-and-drop, its filter guard, and its `sortOrder` persistence are completely unaffected
- All automated checks (typecheck, lint, new router/utility unit tests) pass at the end of each phase
