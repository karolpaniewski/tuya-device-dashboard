# Multi-Site Support — Implementation Plan

## Overview

Add a `sites` table and `siteId` foreign key to rooms, gateways, and devices so that a single dashboard instance can serve multiple office locations. A site picker in the dashboard header lets users switch between sites (or select "All Sites" for a merged view). All tRPC procedures are updated to filter by the active siteId. All authenticated users see all sites; user-to-site access control is deferred.

## Current State Analysis

Six tables, none with any site/tenant column. Two tRPC routers (`device`, `room`) — all 9 procedures return all rows from the DB with no scoping. The polling worker (`src/server/workers/tuya-poller.ts:10`) does `db.select().from(gateways)` with no filter — this is correct and does **not need to change**: it polls all gateways across all sites; site filtering happens at the tRPC query layer. Frontend has two routes (`/` and `/setup`) with no site-based routing.

Key files:
- `src/server/db/schema.ts` — 6 tables, no siteId anywhere (`schema.ts:30-144`)
- `src/server/api/routers/device.ts:100` — `overview` is a `.query()` with no input
- `src/server/api/routers/room.ts:13` — `list` is a `.query()` with no input; `create` takes `{name}` only
- `src/server/db/seed.ts:41-91` — inserts gateway + devices with no siteId
- `src/app/page.tsx:9` — `api.device.overview.prefetch()` with no args

## Desired End State

The `sites` table exists with at least one site ("Default"). Every room, gateway, and device row has a `siteId` pointing to a valid site. The dashboard header shows the active site name with a dropdown picker; selecting a different site or "All Sites" switches the entire dashboard view. In "All Sites" mode, rooms are grouped by site name (bold section dividers). A "Sites" panel in the setup page allows creating, renaming, and deleting sites (delete is blocked if the site has rooms or gateways).

Verify by:
1. `npm run ci` passes
2. At 375px: site picker is visible and usable
3. Switching sites on dashboard shows only that site's rooms/devices
4. "All Sites" shows rooms from all sites with site-name section headers
5. Deleting a site with rooms shows a clear error; deleting an empty site succeeds
6. Migration applied to a seeded DB shows all existing rows have `siteId = 'default'`

### Key Discoveries

- `schema.ts:8-10` — `sqliteTableCreator` applies `.bootstrap-scaffold_` prefix to all table names; the new `sites` table must use the same `createTable` helper
- `device.ts:100` — `overview` has no input today; changing it to `.input(z.object({ siteId: z.string() })).query(...)` is a breaking API change — all callers (page.tsx prefetch, SetupShell, DeviceOverview useQuery) must be updated
- `schema.ts:30-45` — `gateways` table has no siteId; `schema.ts:47-58` — `rooms` table has no siteId; both need the FK before any phase 3 scoping can work
- `seed.ts:41-91` — inserts a gateway and 5 devices with no siteId; after migration the seed must also insert a site first and pass its id when inserting the gateway
- SQLite `ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT 'value'` works cleanly as long as the default value satisfies the FK at migration time — adding `.default('default')` in the Drizzle column definition enables this approach without a full table rebuild
- `trpc.ts:28` — `createTRPCContext` only returns `{db, session, headers}`; it does NOT need to be modified (siteId travels as input, not context)
- `setup-shell.tsx:12` — calls `api.room.list.useQuery()` (no args today); after Phase 3, this becomes `api.room.list.useQuery({ siteId: activeSiteId })`

## What We're NOT Doing

- No user-to-site membership management (no `userSites` junction table in this slice)
- No per-site roles or permission differences
- No changes to the polling worker (`tuya-poller.ts`) — it polls all gateways and is correctly site-unaware
- No URL-based site routing (`/sites/[siteId]/...`) — existing `/` and `/setup` routes are unchanged
- No cross-site analytics, temperature comparisons, or aggregate views beyond the flat merged list
- No pagination or search for sites (2–5 sites, flat dropdown is sufficient)
- No audit log of site changes

## Implementation Approach

Four sequential phases, each independently shippable and `npm run ci`-gated. Phase 1 is a pure schema change — no procedure or UI changes. Phase 2 adds the site router and setup UI but does not yet scope any existing procedure. Phase 3 wires siteId into the existing procedures (the one visible breaking change: `overview` and `room.list` gain an input). Phase 4 adds the client-side site context, site picker, and the "All Sites" two-level render path.

The polling worker is never touched — it continues polling all gateways regardless of site; the tRPC layer is where scoping happens.

## Critical Implementation Details

**Migration ordering**: The `sites` table must be created and the default site row inserted BEFORE the `ALTER TABLE` statements that add the `siteId` FK column on `rooms`, `gateways`, and `devices`. After `drizzle-kit generate`, hand-edit the generated SQL to move the `CREATE TABLE .bootstrap-scaffold_site` block and its `INSERT` to the top.

**siteId default = 'default'**: The Drizzle column definition for `siteId` uses `.notNull().default('default')`. This allows SQLite's `ALTER TABLE ADD COLUMN site_id TEXT NOT NULL DEFAULT 'default'` without a full table rebuild. For all future inserts, the application must pass the siteId explicitly — the default exists only to satisfy the migration backfill without a data-copy migration.

**overview input change is a breaking API boundary**: `device.overview` currently has no input. Adding `z.object({ siteId: z.string() })` changes its tRPC key. Every caller must be updated in the same Phase 3 commit: `page.tsx` prefetch (reads cookie via `next/headers`), `SetupShell` (reads from SiteContext), `DeviceOverview` useQuery (reads from SiteContext). If any caller is left without the input, TypeScript will catch it.

**device.siteId derives from gateway.siteId**: devices get their siteId from the gateway they belong to. Migration backfills `devices.siteId` via a subquery: `UPDATE ... SET site_id = COALESCE((SELECT site_id FROM gateways WHERE id = gateway_id), 'default')`. For devices with `gateway_id = NULL`, the fallback is `'default'`. Future device inserts (via seed or any new provisioning flow) must set `siteId` to match their gateway's `siteId`.

---

## Phase 1: Database Foundation

### Overview

Add the `sites` table and `siteId` FK column to `rooms`, `gateways`, and `devices`. Run migration 0001 which auto-creates the "Default" site and backfills all existing rows.

### Changes Required

#### 1.1 `src/server/db/schema.ts` — add sites table and siteId columns

**Intent**: Add the `sites` table using the existing `createTable` helper (same prefix convention). Add `siteId` as a NOT NULL FK column to `rooms`, `gateways`, and `devices`, with `.default('default')` to enable the simple ALTER TABLE migration path.

**Contract**:
```ts
export const sites = createTable("site", (d) => ({
  id: d.text({ length: 255 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: d.text({ length: 255 }).notNull(),
  createdAt: d.integer({ mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));
```

On `gateways`, `rooms`, and `devices` — add inside the `(d) => ({...})` callback:
```ts
siteId: d.text("site_id", { length: 255 }).notNull()
  .default("default")
  .references(() => sites.id, { onDelete: "restrict" }),
```

Also add a `site_idx` index on each table: `index("room_site_idx").on(t.siteId)` etc.

Export `sites` alongside the existing table exports at the bottom of the file so tRPC routers can import it.

#### 1.2 `drizzle/0001_*.sql` — migration

**Intent**: Generate the migration with `drizzle-kit generate`, then hand-edit it so:
1. `CREATE TABLE IF NOT EXISTS .bootstrap-scaffold_site (...)` comes first
2. `INSERT INTO .bootstrap-scaffold_site VALUES ('default', 'Default', unixepoch(), NULL)` comes immediately after
3. The three `ALTER TABLE` statements (rooms, gateways, devices) come after the INSERT
4. The devices backfill query (see Critical Implementation Details above) is added as a final UPDATE statement

**Contract**: After the migration runs, every existing row in `rooms`, `gateways`, and `devices` has `site_id = 'default'`. The `sites` table has exactly one row `{id: 'default', name: 'Default'}`.

#### 1.3 `src/server/db/seed.ts` — insert site before gateway

**Intent**: After migration 0001 is in place, the seed script must insert a site row before inserting the gateway (the FK now requires it). Also pass `siteId` when inserting the gateway and devices.

**Contract**: Import `sites` from `~/server/db/schema`. Add an `onConflictDoNothing()` upsert for site `{id: 'default', name: 'Default'}` before the gateway insert. Pass `siteId: 'default'` when inserting the gateway; pass `siteId: 'default'` (or derive from gateway) when inserting each device.

### Success Criteria

#### Automated Verification

- Migration applies cleanly on a fresh DB: `npm run db:migrate`
- Migration applies cleanly on a seeded DB (existing rows get siteId = 'default'): seed first, then migrate
- TypeScript passes: `npm run build` — no type errors from the new schema columns
- Linting passes: `npx biome check .`
- New migration correctness test passes: `vitest run`

#### Manual Verification

- `drizzle-kit studio` shows the `sites` table and `siteId` columns on all three tables
- Seed script runs cleanly after migration: `npm run db:seed`

---

## Phase 2: Site tRPC Router + Setup UI

### Overview

Add a `site` tRPC router with full CRUD (list, create, rename, delete) and wire it into the root router and the setup page. Existing procedures are unchanged; this phase just adds the new surface. Tests for all four site procedures are added.

### Changes Required

#### 2.1 `src/server/api/routers/site.ts` — new router

**Intent**: Create a new file with four `protectedProcedure` handlers following the exact pattern of `room.ts`.

**Contract**: Procedures:

- `site.list` — query, no input. Returns `{id, name, createdAt}[]` ordered by name. No filtering.
- `site.create` — mutation, input `{name: z.string().min(1).max(255)}`. Inserts a site with a new UUID. Returns `{id, name}`.
- `site.rename` — mutation, input `{id: z.string(), name: z.string().min(1).max(255)}`. Updates `name` where `id = input.id`. Throws `NOT_FOUND` if no row matched.
- `site.delete` — mutation, input `{id: z.string()}`. Guard: query `rooms` and `gateways` WHERE `siteId = input.id`; if either has rows, throw `BAD_REQUEST` with message `"SITE_NOT_EMPTY"`. Otherwise delete the site. Guard against deleting the last site: if site count before delete = 1, throw `BAD_REQUEST` `"CANNOT_DELETE_LAST_SITE"`.

#### 2.2 `src/server/api/root.ts` — wire new router

**Intent**: Register `siteRouter` alongside the existing `deviceRouter` and `roomRouter`.

**Contract**: Import `siteRouter` from `~/server/api/routers/site` and add `site: siteRouter` to `createTRPCRouter({...})`.

#### 2.3 `src/app/_components/setup/site-manager.tsx` — new component

**Intent**: A new client component mirroring `RoomManager`'s UI pattern — a list of sites with rename/delete buttons, an "Add site" form at the bottom. Rendered inside `SetupShell` as a new section above `RoomManager`.

**Contract**: Props: `{ utils: ReturnType<typeof api.useUtils> }`. Uses `api.site.list.useQuery()`, `api.site.create.useMutation()`, `api.site.rename.useMutation()`, `api.site.delete.useMutation()`. Delete button: disabled and titled "Has rooms or gateways" when the site's device/room count > 0 (the server also enforces this, so the UI guard is informational). Success toasts on create/rename/delete using `toast.success(...)` pattern from `room-manager.tsx`. Error messages via the `ErrorMessage` component. No threshold form equivalent.

#### 2.4 `src/app/_components/setup/setup-shell.tsx` — wire SiteManager

**Intent**: Import and render `SiteManager` at the top of the `SetupShell` return, before `RoomManager`.

**Contract**: Add `api.site.list.useQuery()` to the loading/error checks. Pass `utils` to `SiteManager`.

#### 2.5 `src/server/api/routers/site.test.ts` — new test file

**Intent**: Unit tests for all four site procedures, following the exact pattern of `src/server/api/routers/room.test.ts` (mock ctx with in-memory db).

**Contract**: Cover:
- `site.list`: returns all sites ordered by name
- `site.create`: inserts a site and returns it; duplicate name is allowed (no unique constraint)
- `site.rename`: updates name; NOT_FOUND on unknown id
- `site.delete` happy path: removes the site
- `site.delete` SITE_NOT_EMPTY guard: blocked when a room exists with that siteId
- `site.delete` CANNOT_DELETE_LAST_SITE guard: blocked when only one site remains

### Success Criteria

#### Automated Verification

- `npm run ci` passes (6 new site router tests + all existing 45 tests)
- TypeScript passes with `site: siteRouter` in root.ts

#### Manual Verification

- Setup page shows a "Sites" section with the "Default" site listed
- Can create a new site, rename it, and delete it (if empty)
- Delete on a site that has rooms shows an appropriate error (server throws `SITE_NOT_EMPTY`)
- Toasts appear on create/rename/delete

---

## Phase 3: Procedure Scoping

### Overview

Update `device.overview`, `room.list`, and `room.create` to accept a `siteId` input and filter accordingly. Add a cross-site guard to `room.setDeviceRoom`. Update all callers. Add scoping tests. The polling worker is untouched.

### Changes Required

#### 3.1 `src/server/api/routers/device.ts` — scope overview by siteId

**Intent**: Change `overview` from a no-input query to an input query that filters by the given siteId. Add `siteId` and `siteName` to each room item in the response so the UI can group by site in "All Sites" mode.

**Contract**:

Input schema: `z.object({ siteId: z.string() })` where `"all"` means return all sites' data.

Query changes:
- Add a WHERE clause when `input.siteId !== "all"`: filter the existing device query on `eq(devices.siteId, input.siteId)`.
- Add a second query to fetch all sites: `await ctx.db.select({id: sites.id, name: sites.name}).from(sites)` and build a `siteMap: Map<string, string>` (id → name). This is a separate query following the existing pattern at `device.ts:151`.
- On each room item in the response, add `siteId: row.room?.siteId ?? row.device.siteId` and `siteName: siteMap.get(siteId) ?? ''`.
- The `DeviceItem` interface and the returned `rooms` array items gain `siteId: string` and `siteName: string`.

#### 3.2 `src/server/api/routers/room.ts` — scope list and create by siteId

**Intent**: `room.list` filters by siteId; `room.create` inserts with the given siteId. Other mutations (`rename`, `delete`, `getThreshold`, `setThreshold`) operate by ID — they do not need siteId input (access to all sites is permitted in this slice).

**Contract**:

`room.list`: change from `.query(async ({ctx}) => {...})` to `.input(z.object({ siteId: z.string() })).query(async ({ctx, input}) => {...})`. When `input.siteId !== "all"`: add `.where(eq(rooms.siteId, input.siteId))` to the rooms query.

`room.create`: change input from `{name}` to `{name: z.string().min(1).max(255), siteId: z.string().min(1)}`. Pass `siteId: input.siteId` in the insert values.

`room.setDeviceRoom`: add a cross-site guard. After fetching the room and device rows, check `room.siteId === device.siteId`; if they differ, throw `BAD_REQUEST` with `"CROSS_SITE_ASSIGNMENT"`.

#### 3.3 `src/app/page.tsx` — pass siteId to prefetch

**Intent**: The SSR prefetch now requires a siteId. Read the active site from the request cookie via `next/headers`.

**Contract**:
```ts
import { cookies } from "next/headers";
// inside Home():
const activeSiteId = (await cookies()).get("tuya-active-site")?.value ?? "all";
void api.device.overview.prefetch({ siteId: activeSiteId });
```

#### 3.4 `src/app/_components/setup/setup-shell.tsx` — pass siteId to queries

**Intent**: The two queries that now require siteId must receive it. At Phase 3, before the SiteContext provider exists, use a temporary hard-coded `"all"` until Phase 4 wires the real context.

**Contract**: Change `api.room.list.useQuery()` to `api.room.list.useQuery({ siteId: "all" })` and `api.device.overview.useQuery()` to `api.device.overview.useQuery({ siteId: "all" })`. These will be updated again in Phase 4.

#### 3.5 `src/app/_components/device-overview.tsx` — pass siteId

**Intent**: `DeviceOverview` currently calls `api.device.overview.useQuery()` with no args. Update to accept a `siteId` prop and pass it.

**Contract**: Add `interface DeviceOverviewProps { siteId: string }` and update the `useQuery` call to `api.device.overview.useQuery({ siteId: props.siteId }, { refetchInterval: ... })`. At Phase 3, the parent `page.tsx` passes `siteId="all"` until Phase 4 wires real context. Also update the `HydrateClient` wrapper in `page.tsx` to pass `<DeviceOverview siteId={activeSiteId} />`.

#### 3.6 New tests: scoping

**Intent**: Verify that `device.overview` and `room.list` only return data for the requested site, not other sites' data.

**Contract**:
- `device.overview({ siteId: 'site-a' })` when two sites exist: returns only rooms/devices scoped to site-a
- `device.overview({ siteId: 'all' })`: returns rooms/devices from all sites
- `room.list({ siteId: 'site-a' })`: returns only rooms with siteId = 'site-a'
- `room.list({ siteId: 'all' })`: returns all rooms
- `room.setDeviceRoom` cross-site guard: throws `CROSS_SITE_ASSIGNMENT` when room.siteId ≠ device.siteId

Tests live in new files: `src/server/api/routers/device-scoping.test.ts` and `src/server/api/routers/room-scoping.test.ts`, or added as new `describe` blocks to existing test files.

Also: a migration correctness test in `src/server/db/migration.test.ts` (or similar) that applies migration 0001 to a seeded DB and asserts all rows have `site_id = 'default'`.

### Success Criteria

#### Automated Verification

- `npm run ci` passes with all scoping tests included
- TypeScript: no errors from changed procedure signatures
- `device.overview({ siteId: 'X' })` returns only that site's data (test)
- `room.list({ siteId: 'X' })` returns only that site's rooms (test)
- Cross-site room assignment blocked (test)

#### Manual Verification

- Dashboard loads correctly (SSR prefetch now passes siteId from cookie)
- Setup page loads with `siteId: "all"` showing all rooms/devices
- No visual regressions on dashboard or setup page

---

## Phase 4: Site Switcher + All Sites UI

### Overview

Add a client-side `SiteContext` provider, a `SitePicker` dropdown in the `PageShell` header, the "All Sites" two-level room grouping in `DeviceOverview`, and wire the real active siteId into all client queries that Phase 3 left at `"all"`.

### Changes Required

#### 4.1 `src/components/site-context.tsx` — new client context

**Intent**: A React context that owns the active site state, reads/writes the `tuya-active-site` cookie, auto-selects the first alphabetical site when the cookie is absent, and exposes `{activeSiteId, sites, setActiveSite}` to the component tree.

**Contract**:

```ts
// Context shape:
interface SiteContextValue {
  activeSiteId: string; // specific siteId or "all"
  sites: { id: string; name: string }[];
  setActiveSite: (id: string) => void;
}
```

Implementation:
- `SiteProvider` is a `"use client"` component that wraps children
- Calls `api.site.list.useQuery()` to get the sites list
- On mount (via `useEffect`): reads `document.cookie` for `tuya-active-site`
  - If present and not empty: use that value as `activeSiteId`
  - If absent: when `sites` data loads, set to the site with the lowest `name` alphabetically, write cookie
- `setActiveSite(id)`: sets `document.cookie = 'tuya-active-site=<id>; path=/'`, updates state, calls `utils.device.overview.invalidate()` and `utils.room.list.invalidate()`
- Exposes a `useSiteContext()` hook that throws if used outside provider

#### 4.2 `src/app/layout.tsx` — wrap with SiteProvider

**Intent**: Mount `SiteProvider` inside `TRPCReactProvider` (so it has access to tRPC queries) but outside `SessionProvider` position doesn't matter.

**Contract**: Import `SiteProvider` from `~/components/site-context` and wrap `{children}` with it inside `TRPCReactProvider`.

#### 4.3 `src/components/page-shell.tsx` — add SitePicker to header

**Intent**: Render a site picker dropdown in the right-hand area of the header, to the left of the existing `rightContent` link.

**Contract**: Import `useSiteContext` and the shadcn `Select` component. Add a `<Select>` in the header div alongside the existing title and `rightContent`. Options: one `<SelectItem>` per site (from context.sites) plus an "All Sites" item with value `"all"`. The trigger shows the active site's name (or "All Sites"). On `onValueChange`: call `context.setActiveSite(value)`. The picker should not be rendered when `context.sites.length <= 1` (single-site users don't need it, matching the PRD's original single-site scope).

#### 4.4 `src/app/_components/device-overview.tsx` — wire real siteId + All Sites two-level render

**Intent**: Replace the temporary `siteId="all"` prop with the real `activeSiteId` from `SiteContext`. Add a two-level render path for "All Sites" mode.

**Contract**:

- Import `useSiteContext` and remove the `siteId` prop from `DeviceOverviewProps` (read from context instead)
- `const { activeSiteId } = useSiteContext()`
- Pass `activeSiteId` to the `useQuery` call
- When `activeSiteId === "all"`: group the `data.rooms` array by `room.siteName` (the new field added in Phase 3). Render a `<SiteSection>` wrapper around each group containing a bold site-name header, then the existing `<RoomGroup>` components for that site's rooms.
- When `activeSiteId !== "all"`: existing render logic unchanged (no site header needed).

New sub-component `SiteSection` (can be in the same file or a new `site-section.tsx`): renders `<section>` with a `<h2>` showing the site name, then `{children}` (the room groups for that site).

#### 4.5 `src/app/_components/setup/setup-shell.tsx` — wire real siteId

**Intent**: Replace the temporary `{ siteId: "all" }` placeholders from Phase 3 with the real active siteId from `SiteContext`.

**Contract**: Import `useSiteContext`, destructure `activeSiteId`, and pass it to both `api.room.list.useQuery({ siteId: activeSiteId })` and `api.device.overview.useQuery({ siteId: activeSiteId })`. Also pass `activeSiteId` to `RoomManager` for use in `room.create` calls (so new rooms are created in the active site).

#### 4.6 `src/app/_components/setup/room-manager.tsx` — pass siteId to room.create

**Intent**: `room.create` now takes `{name, siteId}`. Pass the active site id.

**Contract**: Add `activeSiteId: string` to `RoomManager`'s props (received from SetupShell). In the `createMutation.mutate()` call, pass `siteId: activeSiteId` alongside `name`.

#### 4.7 `src/app/page.tsx` — use real SiteContext for DeviceOverview

**Intent**: Phase 3 added `activeSiteId` from `cookies()` for SSR prefetch. The client-side `<DeviceOverview>` no longer needs the prop — it reads from `SiteContext`. Update accordingly.

**Contract**: Remove the `siteId` prop from `<DeviceOverview />` (DeviceOverview reads from context). Keep the SSR prefetch reading from the cookie via `next/headers` as in Phase 3 — it doesn't need to change.

### Success Criteria

#### Automated Verification

- `npm run ci` passes (all existing tests + new tests from Phases 1–3)
- TypeScript: no errors from new SiteContext hook usage
- Biome: no lint warnings

#### Manual Verification

- Header shows active site name in dropdown; "All Sites" is the last option
- Selecting a different site instantly switches the dashboard to that site's rooms/devices
- "All Sites" shows bold site-name section headers above each site's room groups
- Same-named rooms in different sites are distinguishable by section header
- Setup page: site picker works; creating a room in the active site assigns it the correct siteId; the room appears in the correct site section on the dashboard
- Single-site deployment: site picker dropdown is hidden (≤1 site)
- Cookie persists across page refreshes; new tab auto-selects the correct site

---

## Testing Strategy

### Unit Tests

- `site.ts` router: 6 cases (list, create, rename, delete happy, SITE_NOT_EMPTY, CANNOT_DELETE_LAST_SITE)
- `device.overview` scoping: 2 cases (single site, all sites)
- `room.list` scoping: 2 cases (single site, all sites)
- `room.setDeviceRoom` cross-site guard: 1 case

### Migration Test

- Apply migration 0001 to a seeded database; assert `SELECT COUNT(*) FROM rooms WHERE site_id != 'default'` = 0

### Manual Testing Steps

1. Run `npm run db:migrate` on an existing seeded DB; verify no data loss and all rows have `site_id = 'default'`
2. Create a second site via the setup page "Sites" section
3. Create a room in the new site; assign a device to it
4. Switch dashboard to the new site — only the new room/device appears
5. Switch to "All Sites" — both sites' rooms appear with bold section headers
6. Try to delete the site with rooms — expect error toast
7. Delete all rooms/gateways from the site, then delete it — succeeds
8. Verify cookie persistence across browser refresh and new tab

## Migration Notes

Migration 0001 is additive-only (adds a table and adds columns with DEFAULT). It is safe to run against a production database with existing data. The "Default" site row uses hardcoded id `'default'` so the migration is idempotent — rerunning it does not add duplicate rows (use `INSERT OR IGNORE`).

After migration, the seeded admin user will see all existing rooms, gateways, and devices under the "Default" site. They can rename it to the actual office location name via the Sites setup section.

## References

- `src/server/db/schema.ts` — all table definitions (lines 1–145)
- `src/server/api/routers/device.ts:100` — overview procedure (current no-input form)
- `src/server/api/routers/room.ts:13` — list and create procedures
- `src/server/workers/tuya-poller.ts` — untouched; polls all gateways regardless of site
- `src/app/_components/setup/room-manager.tsx` — reference for SiteManager component pattern
- Similar plan: `context/changes/ux-polish/plan.md` — multi-phase shadcn UI addition pattern

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Database Foundation

#### Automated

- [ ] 1.1 Migration applies cleanly on a fresh DB: `npm run db:migrate`
- [ ] 1.2 Migration applies cleanly on a seeded DB (all rows get `siteId = 'default'`)
- [ ] 1.3 TypeScript passes: `npm run build`
- [ ] 1.4 Linting passes: `npx biome check .`
- [ ] 1.5 Migration correctness test passes: `vitest run`

#### Manual

- [ ] 1.6 `drizzle-kit studio` shows `sites` table and `siteId` columns on all three tables
- [ ] 1.7 Seed script runs cleanly after migration: `npm run db:seed`

### Phase 2: Site Router + Setup UI

#### Automated

- [ ] 2.1 `npm run ci` passes (6 new site router tests + all 45 existing)
- [ ] 2.2 TypeScript passes with `site: siteRouter` in root.ts

#### Manual

- [ ] 2.3 Setup page shows "Sites" section with "Default" site listed
- [ ] 2.4 Can create, rename, and delete (empty) site via UI
- [ ] 2.5 Deleting a site with rooms shows error toast

### Phase 3: Procedure Scoping

#### Automated

- [ ] 3.1 `npm run ci` passes with all scoping tests included
- [ ] 3.2 TypeScript: no errors from changed procedure signatures
- [ ] 3.3 `device.overview({ siteId: 'X' })` returns only that site's data (test)
- [ ] 3.4 `room.list({ siteId: 'X' })` returns only that site's rooms (test)
- [ ] 3.5 Cross-site room assignment blocked (test)

#### Manual

- [ ] 3.6 Dashboard loads correctly (SSR prefetch passes siteId from cookie)
- [ ] 3.7 Setup page loads with `siteId: "all"` showing all rooms/devices, no regressions

### Phase 4: Site Switcher + All Sites UI

#### Automated

- [ ] 4.1 `npm run ci` passes (all existing + new tests)
- [ ] 4.2 TypeScript: no errors from new SiteContext hook usage
- [ ] 4.3 Biome: no lint warnings

#### Manual

- [ ] 4.4 Header dropdown shows active site name; "All Sites" is last option
- [ ] 4.5 Switching sites updates dashboard to show only that site's rooms/devices
- [ ] 4.6 "All Sites" shows bold site-name section headers above each site's room groups
- [ ] 4.7 Site picker hidden on single-site deployments
- [ ] 4.8 Cookie persists across page refreshes; new tab auto-selects correct site
- [ ] 4.9 Creating a room in the active site assigns correct siteId; appears in correct section
- [ ] 4.10 Delete site with rooms → error; delete empty site → success
