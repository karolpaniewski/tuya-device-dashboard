# Multi-Site Support — Plan Brief

> Full plan: `context/changes/multi-site/plan.md`

## What & Why

A single dashboard instance must serve multiple named office locations ("sites"), each with their own rooms, gateways, and devices. Today the DB has no site concept — all data is globally visible to all users with no isolation. Adding site support allows the facility team to manage e.g. "Main Office" and "Warehouse" from one dashboard without data bleeding between locations.

## Starting Point

Six DB tables (users, gateways, devices, deviceRoomAssignments, rooms, roomThresholds), none with a `siteId` column. Both tRPC routers return all rows with no filtering. One active deployment with existing rooms, gateways, and devices that will all migrate to a "Default" site. The polling worker (`tuya-poller.ts`) polls all gateways every 30s and is deliberately site-unaware — it keeps working unchanged.

## Desired End State

Every room, gateway, and device row has a `siteId` FK. The dashboard header shows the active site in a dropdown; selecting a different site (or "All Sites") instantly switches the view. In "All Sites" mode, rooms are grouped by bold site-name section headers. The setup page has a Sites panel for CRUD. All authenticated users can see and manage all sites (per-user site restrictions are deferred).

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Network topology | Single server, routed internal network | S-13 outcome describes one dashboard instance; LAN routing between offices assumed available | Plan |
| DB isolation model | Row-level siteId on rooms, gateways, devices | Stays in single SQLite file; follows existing Drizzle pattern; simpler than separate DB files | Plan |
| Auth scope | Global login, all users see all sites | Extending the existing flat role model; user-to-site access lists deferred | Plan |
| Site admin | Any authenticated user | Keeps the current flat role model; no super-admin needed | Plan |
| Migration | Auto-create 'Default' site; backfill everything to it | Self-contained, idempotent migration with no data loss | Plan |
| Site count | Small (2–5), flat dropdown | No pagination or search needed; `Select` component fits all sites | Plan |
| Site switcher | Header dropdown, active site in cookie `tuya-active-site` | No URL restructuring; existing / and /setup routes unchanged | Plan |
| Cross-site view | "All Sites" option + two-level section headers | User explicitly requested merged view; site headers disambiguate same-named rooms | Plan |
| siteId in tRPC | Input parameter (not cookie in server context) | Clean React Query cache keys; SSR prefetch reads cookie via `next/headers` | Plan |
| Polling worker | Unchanged | Polls all gateways across all sites; site scoping is a query-layer concern only | Plan |

## Scope

**In scope:**
- `sites` table + `siteId` FK on rooms, gateways, devices (migration 0001)
- Auto-create "Default" site in migration; backfill all existing rows
- Site CRUD tRPC router (list, create, rename, delete with guards)
- SiteManager component in setup page
- `device.overview({ siteId })` and `room.list/create({ siteId })` input changes
- Cross-site room-assignment guard in `room.setDeviceRoom`
- `SiteContext` client provider + `SitePicker` Select in PageShell header
- "All Sites" two-level render in `DeviceOverview` (site section headers)
- Seed update, scoping tests, site router tests, migration correctness test

**Out of scope:**
- User-to-site membership management (`userSites` junction table)
- Per-user site permissions or roles
- Polling worker changes (it's correctly site-unaware)
- URL-based site routing (`/sites/[siteId]/...`)
- Cross-site analytics or temperature comparisons

## Architecture / Approach

The `sites` table uses the existing `createTable` helper (same `.bootstrap-scaffold_` prefix). `siteId` gets `.notNull().default('default')` on all three tables so SQLite can apply the migration via simple `ALTER TABLE ADD COLUMN ... DEFAULT 'default'` without a full table rebuild. The migration must be hand-edited after `drizzle-kit generate` to ensure the sites table + insert come before the ALTER statements.

The active site travels as a tRPC **input parameter** (not a cookie in the server context), which gives each query its own React Query cache key. The SSR prefetch in `page.tsx` reads the cookie from `next/headers` and passes it to the prefetch call. On the client, `SiteContext` reads the cookie, auto-selects the first alphabetical site if absent, and exposes `setActiveSite()` which updates the cookie and invalidates all queries.

The polling worker is untouched — it is correctly site-unaware and continues polling all gateways every 30s.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database foundation | sites table + siteId on 3 tables, migration 0001, seed update | Migration ordering: sites table + INSERT must come before ALTER TABLE FKs — hand-edit required after `drizzle-kit generate` |
| 2. Site router + setup UI | site.list/create/rename/delete tRPC + SiteManager in setup page | `site.delete` guard must check both rooms AND gateways; also block last-site deletion |
| 3. Procedure scoping | overview + room.list/create accept siteId; cross-site assignment guard; SSR prefetch wired | Breaking API change: `overview` gains an input — ALL callers must be updated in one commit |
| 4. Site switcher + All Sites UI | SiteContext, SitePicker in header, two-level render in DeviceOverview | SiteContext race condition: cookie read + sites query must both resolve before activeSiteId is final |

**Prerequisites:** Phase 1 migration must be applied before Phase 2 (site router references the sites table schema).  
**Estimated effort:** ~3–4 focused sessions across 4 phases

## Open Risks & Assumptions

- The customer's internal network must have IP routing between the server and all sites' device subnets — the app cannot establish this routing; it must already exist
- `siteId` on devices is maintained consistently with gateway siteId at insertion time; if a gateway is later moved to a different site, its devices' siteIds become stale — no migration tooling for that edge case in this slice
- The SiteContext cookie-read + sites-query race on first render may show "All Sites" for one tick before auto-selecting the correct site; this is a visible flicker if the dashboard loads fast enough

## Success Criteria (Summary)

- `npm run ci` passes after each phase
- Switching sites on the dashboard shows only that site's rooms/devices; no cross-site data leak
- Migration applied to existing data: all rows have `siteId = 'default'`; no data loss
