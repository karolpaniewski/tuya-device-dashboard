# Interactive 2D Floor-Plan ("Digital Twin") Map View — Plan Brief

> Full plan: `context/changes/floor-plan-map-view/plan.md`

## What & Why

Add a "Map View" page: an admin uploads a static floor-plan image per site,
drags device icons onto their physical location on it, and clicks a placed
device to open the existing control modal. The PRD records this as primarily
a technical-depth/portfolio showcase (absolute positioning, drag-and-drop)
rather than a response to a deeply-felt user complaint — the underlying
spatial-context and naming-recall pains are real but secondary.

## Starting Point

Devices are shown today only as cards grouped by room (`room-group.tsx`),
with a server-computed per-room comfort badge (OK/Too Cold/Too Hot) and an
existing device control modal opened via local `useState`. There is no
spatial/visual representation of the office layout, and no file-upload
infrastructure anywhere in the app.

## Desired End State

The admin opens "Map View" from the sidebar, sees their uploaded floor plan
with devices placed on it colored by their room's current status, drags new
devices on from a roster, clicks any device to control it exactly as from
the list view — and if the map itself ever fails to render, the dashboard's
list view and valve control keep working untouched, with a clear error
message pointing them there.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Image storage | Local disk (`public/uploads/floor-plans/`) + upload route handler | Matches the app's LAN-only, no-cloud-dependency posture; `public/` is already behind the auth middleware, so no new gating code is needed. | Plan |
| Drag implementation | Native HTML5 Drag and Drop API | Free continuous positioning is a different shape than the existing `@dnd-kit` sortable-list usage; no new dependency. | Plan |
| Upload validation | PNG/JPG only, 5MB cap | Generous enough for a real floor-plan photo, small enough to keep map load time in line with the rest of the dashboard. | Plan |
| Render-failure detection | Image `onError` handler + route-segment error boundary | Covers both failure classes named in FR-009 ("unsupported file, rendering-library bug") without over-engineering. | Plan |
| Unplaced roster placement | Persistent side drawer | Devices stay visible at a glance for dragging, without an extra click — acceptable since this feature is desktop-only. | Plan |
| Remove-device interaction | Dedicated × affordance on the node | Explicit and discoverable; avoids accidental removal from an imprecise drag (PRD's own Socrates note flagged this ambiguity). | Plan |
| Testing scope | Unit + integration only, no Playwright E2E for the drag gesture | Native HTML5 drag-and-drop is notoriously flaky to automate; covers the riskiest logic (coordinate math, validation, persistence) without fighting Playwright. | Plan |
| Data model | Columns directly on `devices`/`sites` (no new join table) | Strict 1:1 extension — one optional position per device, one optional image per site — no relational flexibility needed. | Plan |

## Scope

**In scope:**
- Floor-plan image upload (one per site, replaceable) via Settings
- Drag-and-drop device placement, reposition, and removal
- Badge-colored device nodes reusing the existing S-05 room status
- Click-to-open the existing device control modal from the map
- Render-failure isolation so the map can never block device control

**Out of scope:**
- Room-drawing/wall-snapping tools, room-boundary parsing
- Pan/zoom, mobile/375px support for the map itself
- Real-time multi-user collaboration, spatial automation rules, thermal heatmap overlay
- Upload history (only the current image per site is kept)
- Automated E2E coverage of the drag gesture itself

## Architecture / Approach

Two new nullable columns (`devices.mapXPct`/`mapYPct`, `sites.floorPlanImagePath`)
extend the existing `device.overview` and `site.list` queries — no new
parallel data path. A small new upload route handler (binary, outside tRPC)
writes the image to disk and updates the site row directly. The Map View
page is a new client component reusing `useSiteContext`, the existing
`DeviceModal`, and the existing room-badge color mapping; placement uses
native HTML5 drag events plus one new pure coordinate-math utility.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & migration | Two new nullable columns, migration `0013` | Low — additive, no backfill |
| 2. Backend API | Extended queries, two new mutations, upload route handler, coordinate utility | Upload route handler bypasses tRPC's auth middleware — must call `auth()` directly |
| 3. Settings upload UI | `FloorPlanManager` card, per-site image upload/replace | Low — follows an established component pattern exactly |
| 4. Map View page | Nav entry, page, drag-and-drop, modal reuse, failure isolation | Native HTML5 DnD coordinate math; guardrail verification (list view/mobile/a11y/bulk ops unaffected) needs deliberate manual testing |

**Prerequisites:** None beyond the current codebase — no external service signup, no new paid dependency.
**Estimated effort:** Fits within the PRD's 3-week after-hours budget; roughly one phase per multi-day work session.

## Open Risks & Assumptions

- The upload route handler must independently re-check the session (it
  bypasses tRPC's `protectedProcedure` auth wrapper) — getting this wrong
  would open an unauthenticated upload endpoint.
- Native HTML5 drag-and-drop has known mobile/touch quirks, which is
  acceptable only because this feature is explicitly desktop-only.

## Success Criteria (Summary)

- An admin can upload a floor plan, place/reposition/remove devices on it,
  and control them from the map exactly as from the list view.
- A floor-plan failure never blocks device control via the existing list
  view, and shows a visible, specific error state.
- Mobile, accessibility, and bulk-operation paths are provably unaffected.
