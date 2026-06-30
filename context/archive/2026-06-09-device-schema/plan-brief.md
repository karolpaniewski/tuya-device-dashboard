# Device Data Schema — Plan Brief

> Full plan: `context/changes/device-schema/plan.md`

## What & Why

Add the five domain tables the rest of the product depends on (`gateways`, `rooms`, `devices`, `device_room_assignments`, `room_thresholds`) and remove the T3 starter `posts` table. Without this schema, every subsequent slice (S-01 through S-05) has nowhere to persist device state, room assignments, or threshold config.

## Starting Point

`schema.ts` currently has two tables: `posts` (starter, unused by the product) and `users` (added by F-01). No domain tables exist. Drizzle + libsql are already wired; `db:push` and `db:generate` scripts are present. No `drizzle/` migrations directory yet.

## Desired End State

Five domain tables exist in the dev SQLite database. The `posts` table and all its code references (router, component, page demo) are gone. TypeScript compiles cleanly. A `drizzle/` migration file is generated for the audit trail. The home page shows a minimal placeholder; auth gate remains active.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Tuya protocol fields on devices | Include now (tuya_device_id, local_key, ip_address, product_key) | S-01 polling loop needs all fields in one table — adding them later requires a mid-stream migration | Plan |
| Gateway as own table | Yes — `gateways` table with FK from devices | LAN polling iterates per-gateway; a FK is cleaner than SELECT DISTINCT on a text column | Plan |
| Global threshold default | Nullable columns + app constants (no DB row) | PRD doesn't require admin-configurable global default in MVP; NULL = fallback | Plan |
| device_type encoding | TEXT with CHECK constraint IN ('sensor','valve','plug') | DB-level validation at zero cost; type list is stable for MVP | Plan |
| Migration strategy | db:push (dev) + db:generate (audit file) | Matches auth-scaffold precedent; fast dev iteration + migration file for future env setup | Plan |

## Scope

**In scope:**
- Add `gateways`, `rooms`, `devices`, `device_room_assignments`, `room_thresholds` tables
- Remove `posts` table and all references (router, component, page)
- `db:push` + `db:generate` (first migration file)

**Out of scope:**
- tRPC routers for new tables (S-01 through S-05)
- Seed data for rooms or gateways
- TypeScript Zod schemas / enums for `device_type`
- UI for room or threshold management
- `users` table (F-01)

## Architecture / Approach

All tables use the existing `createTable` helper which auto-prefixes with `.bootstrap-scaffold_` — no `drizzle.config.ts` changes needed. Foreign keys: `devices.gateway_id → gateways.id (SET NULL)`, `device_room_assignments.{device_id, room_id} → CASCADE`. `device_id` is UNIQUE in assignments to enforce one-device-one-room. `room_thresholds` is 1:1 with rooms via UNIQUE on `room_id`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema Update | 5 new tables in schema.ts; posts and its code removed; TypeScript compiles | Biome lint may flag unused imports left over from post.tsx cleanup |
| 2. Migration | Dev DB synced; first drizzle/ migration file generated | db:push on SQLite drops posts — verify no FK dependants first (there are none) |

**Prerequisites:** F-01 (auth-scaffold) implemented — `users` table in schema.ts must be present.
**Estimated effort:** ~1 session, 1–2 hours.

## Open Risks & Assumptions

- `devices.gateway_id` is nullable — a device with no gateway FK is a valid (if incomplete) record. S-01 must handle this gracefully in the polling query.
- `check` constraint syntax for drizzle-orm 0.41 SQLite confirmed available; if it silently fails on push (SQLite quirk), fall back to app-level validation and remove the extras entry.

## Success Criteria (Summary)

- `npm run typecheck` and `npm run check` pass with zero errors
- `npm run db:studio` shows all five new tables with correct columns; `posts` absent
- `drizzle/` directory contains at least one generated `.sql` migration file
