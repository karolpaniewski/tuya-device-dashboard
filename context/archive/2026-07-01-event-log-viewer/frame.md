# Frame Brief: Event Log Viewer

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

There is no UI to view the `event_log` table. The admin cannot see recorded
events (threshold breaches, heat toggles, connectivity changes, email alerts).

## Initial Framing (preserved)

- **User's stated cause or approach**: the event_log table exists but has no
  frontend viewer — need to build one.
- **User's proposed direction**: add an event log viewer feature.
- **Pre-dispatch narrowing**: skipped — codebase investigation was conclusive
  before Step 1.5 questions were needed.

## Dimension Map

The observation ("no event log viewer visible") could originate at:

1. **Page doesn't exist** — `/events` route never created
2. **Router not registered** — `eventRouter` absent from root caller
3. **Component not built** — no `EventFeed` or equivalent UI component
4. **Navigation link missing** — page + component + router exist but no
   entry point in the sidebar rail ← actual location of the gap

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Page doesn't exist | `src/app/events/page.tsx` exists — full RSC page with prefetch | NONE |
| Router not registered | `src/server/api/root.ts:15` — `event: eventRouter` registered | NONE |
| Component not built | `src/app/events/_components/EventFeed.tsx` — complete: table, badges, room/device filters, skeleton, empty state, `deriveDetails` per event type | NONE |
| Navigation link missing | `src/app/_components/command-center-shell.tsx:142–165` — rail has Dashboard / Map / Setup / Automation Flow; `/events` absent | STRONG |

## Narrowing Signals

- `EventFeed.tsx` handles all 4 event types (`threshold_breach`, `toggle_heat`,
  `connectivity_change`, `alert_sent`) with Polish labels, colour-coded badges,
  and payload parsing — the component is production-ready.
- `event.ts` router queries last 24 h, joins rooms + devices, orders by
  `createdAt DESC`, limits to 200 rows — already correct for a viewer.
- The page wraps in `<CommandCenterShell>` (same as all other pages) — layout
  is already handled.

## Cross-System Convention

Every page in this app is reachable via a `<RailLink>` in
`command-center-shell.tsx`. The rail uses lucide-react icons sized at 20 px
with an `aria-label`. Adding a new rail item follows an established, repeated
4-line pattern.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the `/events` page is not linked
> from the navigation rail, making it completely undiscoverable — the feature
> is built, it just has no entry point.

The initial framing ("build an event log viewer") was wrong about scope. The
viewer exists in full; the only missing piece is one `<RailLink>` entry in the
sidebar. No new component, no new route, no new tRPC procedure is needed.

## Confidence

**HIGH** — all four dimensions investigated, three ruled out with direct
file:line evidence, one confirmed with strong evidence. No ambiguity.

## What Changes for /10x-plan

Add a single `<RailLink active={pathname === "/events"} href="/events" …>`
to `command-center-shell.tsx`, with an appropriate lucide-react icon (e.g.
`ScrollText` or `Activity`). That is the entire scope.

## References

- `src/app/events/page.tsx` — RSC page (complete)
- `src/app/events/_components/EventFeed.tsx` — full UI component (complete)
- `src/server/api/routers/event.ts` — tRPC router (complete)
- `src/server/api/root.ts:15` — router registration (complete)
- `src/app/_components/command-center-shell.tsx:142–165` — nav rail (missing /events entry)
