# Device Data Schema Implementation Plan

## Overview

Add five domain tables to the Drizzle/SQLite schema (`gateways`, `rooms`, `devices`, `device_room_assignments`, `room_thresholds`), remove the starter `posts` table and all its dependants, then apply the schema to the dev database and generate a migration file.

## Current State Analysis

- `src/server/db/schema.ts` — exports `createTable` (sqliteTableCreator with `.bootstrap-scaffold_` prefix), `posts` (starter, to remove), and `users` (added by F-01, keep).
- `drizzle.config.ts` — dialect: sqlite, tablesFilter: `[".bootstrap-scaffold_*"]`; all new tables via `createTable` are automatically managed.
- No `drizzle/` migrations directory — `db:push` used in dev so far; this change introduces the first migration file.
- `src/server/api/routers/post.ts` — starter router using `posts` schema; to delete.
- `src/server/api/root.ts` — wires `postRouter`; to clean up.
- `src/app/_components/post.tsx` and `src/app/page.tsx` — UI using the post tRPC calls; to replace with a placeholder (real dashboard is S-01).
- Lesson on record: every tsx script reading `process.env` must use `--env-file=.env`; `db:seed` already complies.

## Desired End State

Five domain tables exist in the SQLite dev database, Drizzle is aware of them, TypeScript compiles cleanly, `db:push` applies without error, and a `drizzle/` migration file is generated. The `posts` table and all its code references are gone.

### Key Discoveries

- `src/server/db/schema.ts:13` — `createTable` auto-prefixes every table name with `.bootstrap-scaffold_`; new tables must use it.
- `drizzle-orm ^0.41.0` — `check` (SQLite CHECK constraint) and `uniqueIndex` are available from `drizzle-orm/sqlite-core`.
- Auth-scaffold plan (line 31) explicitly deferred `posts` removal to this change — no merge conflict risk.
- `device_room_assignments.device_id` must be UNIQUE: one device belongs to at most one room (FR-013 Socrates resolution).
- `room_thresholds` columns are nullable: NULL means "use app-level fallback constant" — no separate config table needed.
- `devices.gateway_id` is nullable to allow device records to exist before gateway pairing is confirmed.

## What We're NOT Doing

- No seed data for rooms or gateways — those are runtime config, not dev fixtures.
- No TypeScript enums or Zod schemas for `device_type` — that is S-01's concern.
- No tRPC routers for the new tables — S-01 through S-05 own those.
- No migration for production — LAN-only self-hosted, `db:push` on first deploy is sufficient; migration file is for audit trail only.
- No UI for room/threshold management — S-02 and S-05 own that.
- Not touching `users` table — F-01 owns it.

## Implementation Approach

Single-phase schema work followed by two migration commands. All tables use the existing `createTable` helper so naming conventions and `tablesFilter` are satisfied automatically. The `posts` cleanup is bundled in the same commit to keep the repo consistent.

## Critical Implementation Details

**`check` import**: `check` must be imported from `drizzle-orm/sqlite-core` alongside `index`. The call site is the table extras array, not the column chain.

**Nullable `gateway_id` on devices**: FK is nullable so device rows can be seeded or imported before the gateway record exists. `ON DELETE SET NULL` is the intent — Drizzle expresses this as `.references(() => gateways.id, { onDelete: "set null" })`.

---

## Phase 1: Schema Update

### Overview

Replace the `posts` export with the five domain tables in `schema.ts`, delete the post router and component, and clean up the two files that reference them.

### Changes Required

#### 1. Schema file

**File**: `src/server/db/schema.ts`

**Intent**: Remove the `posts` table export. Add five new exports: `gateways`, `rooms`, `devices`, `deviceRoomAssignments`, `roomThresholds`. Keep `users` and `createTable` unchanged.

**Contract**: Add `check` and `uniqueIndex` to the existing import from `drizzle-orm/sqlite-core`. Table structure:

- `gateways`: `id` TEXT PK (UUID), `tuyaGatewayId` TEXT NOT NULL UNIQUE, `name` TEXT NOT NULL, `ipAddress` TEXT nullable, `localKey` TEXT nullable, `createdAt` / `updatedAt` timestamps (same pattern as `users`).
- `rooms`: `id` TEXT PK (UUID), `name` TEXT NOT NULL, `createdAt` / `updatedAt`.
- `devices`: `id` TEXT PK (UUID), `tuyaDeviceId` TEXT NOT NULL UNIQUE, `gatewayId` TEXT nullable → `.references(() => gateways.id, { onDelete: "set null" })`, `name` TEXT NOT NULL, `deviceType` TEXT NOT NULL, `ipAddress` TEXT nullable, `localKey` TEXT nullable, `productKey` TEXT nullable, `createdAt` / `updatedAt`. Extras array: `check("device_type_check", sql\`${t.deviceType} IN ('sensor', 'valve', 'plug')\`)` and `index("device_gateway_idx").on(t.gatewayId)`.
- `deviceRoomAssignments`: `id` TEXT PK (UUID), `deviceId` TEXT NOT NULL UNIQUE → `.references(() => devices.id, { onDelete: "cascade" })`, `roomId` TEXT NOT NULL → `.references(() => rooms.id, { onDelete: "cascade" })`, `assignedAt` timestamp (no `updatedAt`). The `.unique()` on `deviceId` enforces one device → one room.
- `roomThresholds`: `id` TEXT PK (UUID), `roomId` TEXT NOT NULL UNIQUE → `.references(() => rooms.id, { onDelete: "cascade" })`, `minTempC` REAL nullable, `maxTempC` REAL nullable, `anomalyGapC` REAL nullable, `createdAt` / `updatedAt`.

#### 2. Delete post router

**File**: `src/server/api/routers/post.ts`

**Intent**: Delete the file entirely — it references the removed `posts` schema export.

#### 3. Root router cleanup

**File**: `src/server/api/root.ts`

**Intent**: Remove the `postRouter` import and the `post:` key from `createTRPCRouter({})`. Leave an empty router object so the file structure stays valid.

#### 4. Delete post component

**File**: `src/app/_components/post.tsx`

**Intent**: Delete the file — it calls the now-removed `api.post.*` procedures.

#### 5. Home page placeholder

**File**: `src/app/page.tsx`

**Intent**: Replace the T3 starter demo page (which calls `api.post.hello` and `api.post.getLatest`) with a minimal placeholder. The real dashboard is S-01's deliverable.

**Contract**: A simple server component with no tRPC calls, no imports from deleted files. Content can be a single heading such as "Tuya Device Dashboard" — nothing functional yet.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with zero errors
- `npm run check` (Biome lint) passes
- `npm run dev` starts without runtime errors (dev server boots)

#### Manual Verification

- Opening `http://localhost:3000` redirects to `/login` (auth middleware is active)
- After logging in, the home page renders the placeholder without JS console errors

**Implementation Note**: After automated verification passes, confirm manually that the dev server boots and the placeholder page renders before proceeding to Phase 2.

---

## Phase 2: Migration

### Overview

Apply the new schema to the dev SQLite database and generate a migration file for the audit trail.

### Changes Required

#### 1. Apply schema to dev DB

**File**: runtime — no source file change

**Intent**: Run `npm run db:push` to synchronise the live dev database with `schema.ts`. Drizzle will create the five new tables and drop `posts`.

#### 2. Generate migration file

**File**: `drizzle/` directory (new, auto-generated)

**Intent**: Run `npm run db:generate` to write a SQL migration file. This produces the first file in `drizzle/` — verify it exists after the command.

### Success Criteria

#### Automated Verification

- `npm run db:push` exits with code 0 and reports no errors
- `npm run db:generate` exits with code 0
- `drizzle/` directory exists and contains at least one `.sql` file

#### Manual Verification

- `npm run db:studio` opens Drizzle Studio; all five new tables are visible; `posts` is absent; `users` is present

---

## Testing Strategy

### Automated

- TypeScript compilation (`npm run typecheck`) is the primary gate — if schema types are wrong, it fails here.
- Biome lint (`npm run check`) catches import/style issues.

### Manual Testing Steps

1. Start dev server: `npm run dev`
2. Navigate to `http://localhost:3000` — expect redirect to `/login`
3. Log in with seed credentials — expect home page placeholder
4. Run `npm run db:studio` — confirm five new tables, no `posts`, `users` intact
5. Confirm `drizzle/` directory contains a generated `.sql` file

## Migration Notes

`posts` has no FK dependants (no other table references it). Drizzle will drop it cleanly with `db:push`. No data migration required — dev DB only.

## References

- Roadmap: `context/foundation/roadmap.md` (F-02)
- PRD: `context/foundation/prd.md` (FR-013, Business Logic, NFR persistence)
- Auth scaffold plan: `context/changes/auth-scaffold/plan.md` (users table, posts removal note)
- Lessons: `context/foundation/lessons.md` (tsx --env-file pattern)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema Update

#### Automated

- [x] 1.1 `npm run typecheck` passes with zero errors
- [x] 1.2 `npm run check` (Biome lint) passes
- [x] 1.3 `npm run dev` starts without runtime errors

#### Manual

- [x] 1.4 Opening `http://localhost:3000` redirects to `/login`
- [x] 1.5 After login, home page renders placeholder without console errors

### Phase 2: Migration

#### Automated

- [ ] 2.1 `npm run db:push` exits with code 0
- [ ] 2.2 `npm run db:generate` exits with code 0
- [ ] 2.3 `drizzle/` directory contains at least one `.sql` file

#### Manual

- [ ] 2.4 Drizzle Studio shows five new tables, no `posts`, `users` intact
