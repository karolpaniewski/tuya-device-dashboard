# Event Log Viewer — Plan Brief

> Full plan: `context/changes/event-log-viewer/plan.md`
> Frame brief: `context/changes/event-log-viewer/frame.md`

## What & Why

The event log viewer page (`/events`) is already built and working, but is completely
undiscoverable — it has no entry in the navigation rail. Add one `<RailLink>` entry to
make it reachable.

## Starting Point

`src/app/_components/command-center-shell.tsx` renders a vertical icon rail with 4 entries
(Dashboard / Map / Setup / Automation Flow). The `/events` page, its `EventFeed` component,
and the `event.list` tRPC router all exist and are complete.

## Desired End State

The navigation rail has a 5th entry — `ScrollText` icon, `aria-label="Event Log"` — in
the 3rd slot (after Setup, before Automation Flow). Clicking it opens the EventFeed table
showing the last 24 h of events, filtered by room/device.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Icon | `ScrollText` | Semantically precise for an audit/event log; not used elsewhere | Plan |
| Rail position | 3rd slot (after Setup) | Groups admin + monitoring items together | Plan |
| Scope | Nav link only | All other infrastructure already exists | Frame |

## Scope

**In scope:** Add `ScrollText` to lucide-react import; insert one `<RailLink>` block.

**Out of scope:** Changes to EventFeed, event router, pagination, date-range filtering,
or any other existing component.

## Architecture / Approach

Single file edit (`command-center-shell.tsx`). `RailLink` is an existing local component;
`usePathname()` is already called; lucide-react is already imported. The change is purely
additive and follows the established 4-prop pattern used 4 times in the same file.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Add /events nav link | ScrollText icon in rail, /events reachable | Biome import-order lint failure if ScrollText not inserted alphabetically |

**Prerequisites:** None — all dependencies already exist.
**Estimated effort:** ~5 minutes, 1 phase.

## Open Risks & Assumptions

- Biome enforces alphabetical order within named imports — `ScrollText` must be placed
  correctly or `pnpm lint` will fail.
- No other assumptions; the frame investigation confirmed all other infrastructure is live.

## Success Criteria (Summary)

- Nav rail shows ScrollText icon between Setup and Automation Flow on every page.
- Clicking icon reaches `/events` and renders the EventFeed table.
- Active highlight (cyan glow + left bar) appears when pathname is `/events`.
