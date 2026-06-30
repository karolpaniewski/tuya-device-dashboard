# Automation Visibility on Device & Room Cards — Plan Brief

> Full plan: `context/changes/automation-visibility/plan.md`

## What & Why

Today there's no way to see — from a device or a room — which automation mode currently targets it, without navigating away to Settings. This plan surfaces that existing relationship (modes target rooms, not individual devices) on two read-only surfaces: the device modal's already-reserved-but-disabled "Automations" tab, and a new Room modal. Both link out to the existing mode editor rather than allowing inline edits.

## Starting Point

`device-overview.tsx` already fetches `mode.list` for an existing dashboard widget — that data just isn't connected to the device or room views yet. `device-modal.tsx` has a disabled Automations tab with a literal "coming in a future update" placeholder. There is no "Room card" of any kind today — `room-group.tsx` is a plain section header + device grid.

## Desired End State

Opening any device shows which mode(s) target its room (or an empty state) plus a link to Settings. Clicking a room's header opens a new modal listing every device in that room with its state and the same mode info, presented as two clearly grouped sections (modes vs. devices). Nothing else on the dashboard, Setup, or existing controls changes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Device-side surface | Enable the existing disabled Automations tab | Already-reserved integration point in `device-modal.tsx`; avoids cluttering the compact dashboard card | Plan |
| "Room card" architecture | New RoomModal opened by clicking the room header | Mirrors `DeviceModal`'s existing Dialog pattern; no existing "room card" precedent to extend instead | Plan |
| Mode editor link depth | Simple link to `/setup`, no deep-link | Zero new URL-state plumbing; user selects the mode themselves, matching today's entry point | Plan |
| Secondary flow-chart criterion | Build now, scope-bounded to a static grouping render | PRD's own Socrates resolution already bounds it to non-interactive; closes full PRD scope in one pass | PRD |
| Empty state (zero modes / no room) | Explicit copy + link, distinct unassigned-device case | Matches this app's existing "No modes yet" empty-state convention | Plan |
| Backend changes | None — reuse `device.overview` + `mode.list` | Both already return everything needed; `mode.list` is already fetched at the page level | Plan |

## Scope

**In scope:**
- A tested pure function mapping room → targeting modes (`src/lib/mode-targeting.ts`)
- Enabling and populating the device modal's Automations tab
- A new Room modal (devices + state + mode targeting)
- A simple grouped "modes vs. devices" presentation inside it

**Out of scope:**
- Any inline editing of mode membership from either surface
- Deep-linking to a specific mode's edit form
- Any change to the dashboard grid, Setup/Settings screens, the setpoint dial, or drag-reorder
- An interactive diagram/flow-chart editor
- New schema, migration, or tRPC procedure

## Architecture / Approach

One shared pure function (`getModesForRoom`) computes "which modes target this room" from the already-fetched `mode.list` data. Both the device modal's Automations tab and the new Room modal consume it via prop-threading from `device-overview.tsx` — no new network calls. The Room modal reuses `device-modal.tsx`'s `Dialog`/`DialogContent` primitives but skips the shared-layout morph, since there's no "room card" tile to morph from.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Device-side mode visibility | Automations tab shows targeting mode(s) + empty states + link out | Low — pure UI + a small tested utility, no backend change |
| 2. Room modal | New click-to-open modal listing room's devices + mode info | Low-medium — first new modal pattern not driven by an existing card tile |
| 3. Flow-chart-style grouping | Visual "modes vs. devices" grouping inside the Room modal | Low — presentation-only restructuring of Phase 2's content |

**Prerequisites:** none — single-slice change, no dependency on other in-flight work.
**Estimated effort:** well within the PRD's 3-week after-hours budget; no schema/backend work to slow it down.

## Open Risks & Assumptions

- Assumes a mode's `targets` array correctly carries a per-room `targetOn` value when a mode targets multiple rooms differently — confirmed from `mode.ts`'s existing schema and `mode.list` query, not newly introduced.
- Assumes clicking the room header has no drag-sensor conflict — confirmed: `sortable-room-group.tsx` attaches drag listeners only to a dedicated grip handle, not the header text.

## Success Criteria (Summary)

- A device's Automations tab accurately reflects its room's mode-targeting in all cases (0, 1, 2+ modes; unassigned device)
- Clicking any real room's header opens a modal with correct device/temperature/mode data; the "Unassigned" group stays non-interactive
- Every existing control (setpoint dial, device drag-reorder, room drag-reorder) keeps working unchanged
