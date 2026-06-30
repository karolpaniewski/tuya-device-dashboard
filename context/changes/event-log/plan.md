# Dziennik Zdarzeń (Event Log) Implementation Plan

## Overview

Additive feature that introduces a persistent event log to the Tuya Device Dashboard. A new `event_log` table captures four classes of domain events (threshold breaches, heat toggle changes, connectivity transitions, sent email alerts). A new `/events` page lets facility managers browse the last 24 hours of activity with optional room/device filtering.

## Current State Analysis

The dashboard shows present state only — no trajectory. `deviceStateStore` (in-memory `Map`) tracks live `isOnline` / `temperatureC` but discards transitions. `roomAlertState` records the current alert episode (`lastBadge`, `enteredAt`, `notifiedAt`) but no history. No event table exists; the DB has 15 tables across two schema groupings.

**Key hook points found by research:**

- **toggleHeat** — `src/server/api/routers/room.ts:358–374` — upserts `roomHeatState` with `pinnedOff`; hook goes after the upsert, before the fan-out to valve commands
- **connectivity change** — `src/server/workers/tuya-poller.ts:76–84` — inner loop where `deviceStateStore.set(tuyaDeviceId, {...})` is called per device each poll; hook compares prev vs new `isOnline` inline
- **threshold breach (new episode)** — `src/server/lib/alert-control.ts:116–134` — upserts `roomAlertState` with `enteredAt = new Date()` when badge goes from OK → violation; hook follows the upsert
- **threshold breach (badge flip)** — `src/server/lib/alert-control.ts:138–141` — updates `lastBadge` when badge flips between violation types without resolution; this is a separate code path requiring its own hook
- **alert sent** — `src/server/lib/alert-control.ts:161` — `await getEmailClient().sendAlertEmail(...)` throws on failure; hook goes immediately after the successful return, before the `notifiedAt` stamp

**Schema pattern:** all tables use `sqliteTableCreator` defined at `schema.ts:13–15` (prefixes DB table names with `.bootstrap-scaffold_`). Timestamps are `integer({ mode: "timestamp" })` with `.default(sql\`(unixepoch())\`)`. Other tables use UUID text PKs; `event_log` uses integer autoincrement (append-only log, no FK references to this table).

**Page pattern:** RSC page calls `api.X.prefetch()`, wraps a client component in `<HydrateClient>`, no per-page `auth()` — middleware at `src/middleware.ts` protects all routes except `/login`.

**UI pattern:** no shadcn Table or Card component exists — use native `<table>` styled with CSS variables, matching `src/app/_components/setup/device-table.tsx`. `Badge` component available at `src/components/ui/badge.tsx`.

## Desired End State

`/events` page loads in < 2 s showing a chronological feed of the last 24 h of domain events (most recent first). FM can optionally filter the feed to a single room or device. A heat toggle, threshold breach, connectivity change, or email alert recorded in production is visible in the feed on the next page load.

Existing `/` dashboard loads without regression; event log writes never block `toggleHeat` or polling.

### Key Discoveries

- `db` is already imported in both `tuya-poller.ts` and `alert-control.ts` (they write to `deviceTemperatureReadings` and `roomAlertState` respectively) — no new db import needed
- `deviceId` column stores `tuyaDeviceId` (string, Tuya's internal ID); the tRPC read query joins `devices ON devices.tuyaDeviceId = eventLog.deviceId` to resolve device names
- `roomId` column stores the internal UUID (FK to `rooms.id`); standard join at read time
- `alert_sent` events leave `roomId` and `deviceId` null — they are batch events; payload carries `{ count: N }` for display
- Badge flip (Too Cold → Too Hot without resolution) is a **separate code path** at lines 138–141 — must have its own hook or threshold breaches from flips will be invisible

## What We're NOT Doing

- No retention / cleanup of old event_log rows (v1 non-goal)
- No push/SMS notifications (non-goal)
- No changes to the email alert triggering logic
- No changes to existing tables (`device_temperature_readings`, `device_state_store`, `room_alert_state`)
- No type-based filter (deferred to v2; room/device filter covers the main FM use case)
- No server-side pagination beyond LIMIT 200 (24 h window + small fleet = well under limit)

## Implementation Approach

Four phases in strict dependency order: schema first (DB must exist before hooks write to it), then the read-side router (decoupled from hooks), then hooks (writes to the now-existing table), then the page (consumes the router). Each phase has automated verification that must pass before proceeding.

All event writes are fire-and-forget: wrapped in `try { ... } catch { /* swallow */ }` with no logging. The empty catch is intentional — the event log must never block the caller.

## Critical Implementation Details

**Badge flip is a second hook location.** `alert-control.ts` has two branches that write a non-OK badge: the new-episode branch (`enteredAt = now`) and the badge-flip branch (updates `lastBadge` without resetting `enteredAt`). Both must receive a `threshold_breach` event_log write. Miss the flip branch and cold→hot transitions produce no event.

**Cold-start guard is load-bearing.** In the connectivity hook: `if (prevState !== undefined && prevState.isOnline !== newIsOnline)`. The `prevState !== undefined` check prevents a flood of false "came online" events on every server restart. Without it, every restart logs every device as coming online.

**Use `createTable`, not `sqliteTable`.** `schema.ts` exports the local `createTable = sqliteTableCreator(...)` at line 13–15. The CLAUDE.md example uses the bare `sqliteTable` for illustration — in this file use `createTable("event_log", {...})` so the `.bootstrap-scaffold_` prefix is applied consistently.

**alert_sent hook placement.** The hook goes between `sendAlertEmail()` (line 161) and the `notifiedAt` stamp (lines 162–169). `sendAlertEmail` throws on Resend API error; placing the hook after ensures we only log emails that actually sent.

---

## Phase 1: Schema & Migration

### Overview

Adds the `event_log` table to the Drizzle schema and generates + applies migration 0014. No other files change in this phase.

### Changes Required

#### 1. eventLog table definition

**File:** `src/server/db/schema.ts`

**Intent:** Append the `eventLog` table at the bottom of the file. Additive — no existing table is modified.

**Contract:**
```ts
export const eventLog = createTable("event_log", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at", { mode: "timestamp" })
               .notNull()
               .default(sql`(unixepoch())`),
  eventType: text("event_type").notNull(),   // "threshold_breach" | "toggle_heat" | "connectivity_change" | "alert_sent"
  roomId:    text("room_id", { length: 255 }),   // nullable — null for connectivity_change and alert_sent
  deviceId:  text("device_id", { length: 255 }), // nullable — stores tuyaDeviceId; null for room-scoped events
  payload:   text("payload").notNull(),           // JSON string, shape varies by eventType
});

export const eventLogCreatedAtIdx = index("event_log_created_at_idx")
  .on(eventLog.createdAt);
```

#### 2. Generate and apply migration

**Intent:** Run the Drizzle CLI to produce `drizzle/0014_*.sql` and apply it to the local DB.

**Contract:** Two sequential commands:
```bash
npm run db:generate
npm run db:migrate
```

`db:migrate` uses the credentials from `.env` (`DATABASE_URL`). In CI, the migration is applied implicitly by `next build` (Drizzle auto-migrate on start is configured, or the CI DB is rebuilt from scratch each run — verify which applies before finalizing this step).

### Success Criteria

#### Automated Verification

- `npm run db:generate` exits 0 and produces a new file matching `drizzle/0014_*.sql`
- `npm run db:migrate` exits 0 against the local `.env` database
- `npm run typecheck` passes with the new table in scope

#### Manual Verification

- Open Drizzle Studio (`npm run db:studio`) and confirm `.bootstrap-scaffold_event_log` table exists with the correct columns and index

---

## Phase 2: tRPC Event Router

### Overview

Creates the `event.list` protected procedure and registers it in the root router. No UI yet — this phase is complete when `api.event.list` is callable and returns a typed response.

### Changes Required

#### 1. New event router

**File:** `src/server/api/routers/event.ts` (new file)

**Intent:** A single `list` procedure that queries the last 24 h of event_log rows, joins rooms and devices for display names, and returns a typed array.

**Contract:**
- Procedure: `protectedProcedure.query(...)` (no input — no server-side filter; filtering is client-side)
- `since` = `new Date(Date.now() - 24 * 60 * 60 * 1000)`
- Query: `db.select({...}).from(eventLog).leftJoin(rooms, eq(eventLog.roomId, rooms.id)).leftJoin(devices, eq(eventLog.deviceId, devices.tuyaDeviceId)).where(gte(eventLog.createdAt, since)).orderBy(desc(eventLog.createdAt)).limit(200)`
- Selected fields: all `eventLog` columns + `roomName: rooms.name` + `deviceName: devices.name` (both nullable from left joins)
- Return type is inferred by tRPC; no manual `z.object()` needed for the output

The `devices` table join key is `devices.tuyaDeviceId` (not `devices.id`) — `eventLog.deviceId` stores the Tuya external ID.

#### 2. Register in root router

**File:** `src/server/api/root.ts`

**Intent:** Add `event: eventRouter` to `appRouter` following the existing alphabetical import order.

**Contract:** Add `import { eventRouter } from "~/server/api/routers/event"` and `event: eventRouter` in the `createTRPCRouter({...})` call.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run ci` passes (biome + tsc + vitest + build)

#### Manual Verification

- In a test file or via `drizzle-studio`, manually insert one row into `event_log` and confirm `api.event.list` returns it (can be verified in Phase 4 once the page exists; defer if needed)

---

## Phase 3: Inline Event Hooks

### Overview

Adds fire-and-forget `eventLog` inserts at four locations in three existing files. Each insert is wrapped in `try { ... } catch { /* swallow */ }`. No existing logic is modified — inserts are appended after the primary operation succeeds.

### Changes Required

#### 1. toggleHeat hook

**File:** `src/server/api/routers/room.ts`

**Intent:** After the `roomHeatState` upsert (lines 358–374), insert a `toggle_heat` event. The `input.roomId` and `input.pinnedOff` are in scope at this point.

**Contract:**
- Insert after the upsert, before the `Promise.allSettled` fan-out to valve commands
- `eventType: "toggle_heat"`, `roomId: input.roomId`, `deviceId: null` (implicit), `payload: JSON.stringify({ pinnedOff: input.pinnedOff })`
- `db` is available as `ctx.db`
- `eventLog` imported from `~/server/db/schema`

#### 2. Connectivity change hook

**File:** `src/server/workers/tuya-poller.ts`

**Intent:** Inside the per-device loop at lines 76–84, capture the previous state before overwriting it. After `deviceStateStore.set(...)`, compare old vs new `isOnline`. If different AND a previous state existed, insert a `connectivity_change` event.

**Contract:**
```ts
// Inside the per-device reading loop, BEFORE deviceStateStore.set:
const prevState = deviceStateStore.get(tuyaDeviceId);

// Existing: deviceStateStore.set(tuyaDeviceId, { isOnline, ... });

// AFTER deviceStateStore.set:
if (prevState !== undefined && prevState.isOnline !== isOnline) {
  try {
    await db.insert(eventLog).values({
      eventType: "connectivity_change",
      deviceId: tuyaDeviceId,
      payload: JSON.stringify({ isOnline }),
    });
  } catch { /* swallow */ }
}
```
`prevState !== undefined` is the cold-start guard — do not remove.

#### 3. Threshold breach hooks (two locations)

**File:** `src/server/lib/alert-control.ts`

**Intent (new episode — lines 116–134):** After the upsert that sets `enteredAt = new Date()` on a new alert episode, insert a `threshold_breach` event. This is the leading-edge write.

**Intent (badge flip — lines 138–141):** After the update that changes `lastBadge` from one violation type to another (e.g., Too Cold → Too Hot), insert a second `threshold_breach` event for the flip.

**Contract (both locations):** Same insert shape:
- `eventType: "threshold_breach"`, `roomId: <current room id>`, `payload: JSON.stringify({ badge: <currentBadge> })`
- Use `db` (already in scope); import `eventLog` from schema

These are two separate `try/catch` blocks — one per code path. Do not merge into one.

#### 4. alert_sent hook

**File:** `src/server/lib/alert-control.ts`

**Intent:** After `sendAlertEmail({ violations })` returns (indicating the email was sent successfully), insert one `alert_sent` event recording the batch.

**Contract:**
- Hook goes after line 161 (`await getEmailClient().sendAlertEmail(...)`) and before the `notifiedAt` stamp (lines 162–169)
- `eventType: "alert_sent"`, `roomId: null`, `deviceId: null`, `payload: JSON.stringify({ count: violations.length })`

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes (four new inserts must satisfy the schema's column types)
- `npm run ci` passes (all four files pass biome lint + tsc + existing vitest suite)

#### Manual Verification

- Trigger `toggleHeat` on any room via the UI → `/events` page shows a `toggle_heat` row (requires Phase 4 to be complete, or verify directly in the DB with `db:studio`)
- Disconnect a Tuya device or simulate an offline reading → `connectivity_change` row appears
- Wait for a threshold breach (or trigger via test data) → `threshold_breach` row appears
- Confirm dashboard `/` shows no regression (same load time, same data)

---

## Phase 4: /events Page

### Overview

Creates the `/events` route: an RSC page that prefetches `event.list` and a client component `EventFeed` that renders a native table with optional client-side room/device filter.

### Changes Required

#### 1. RSC page

**File:** `src/app/events/page.tsx` (new file)

**Intent:** Server component that prefetches the event list and wraps `EventFeed` in `HydrateClient`. No `auth()` call needed — middleware protects the route.

**Contract:** Follow the pattern in `src/app/page.tsx`:
```ts
import { api, HydrateClient } from "~/trpc/server";
// prefetch:
void api.event.list.prefetch();
// render:
return <CommandCenterShell><HydrateClient><EventFeed /></HydrateClient></CommandCenterShell>;
```

#### 2. EventFeed client component

**File:** `src/app/events/_components/EventFeed.tsx` (new file; co-located under events/)

**Intent:** Client component that consumes `api.event.list.useQuery()`, renders a native table of events, and provides two client-side filter dropdowns (room filter, device filter).

**Contract:**

UI structure:
- Filter bar above the table: two `<Select>` components (rooms derived from fetched events, devices derived from fetched events). Both nullable — "Wszystkie" is the default/reset option. Follows the `items={...}` rule from `lessons.md` (pass `items` prop to avoid blank label on first render).
- Table columns: Czas (formatted `dd.MM HH:mm` via `date-fns`), Typ (`Badge`), Dotyczy (room name or device name), Szczegóły (payload-derived human label)
- Loading state: 5 `Skeleton` rows matching table width
- Empty state: plain text "Brak zdarzeń z ostatnich 24h"

Event type → Badge mapping:
| eventType | Polish label | Badge variant |
|---|---|---|
| `threshold_breach` | `Próg temperatury` | `destructive` |
| `toggle_heat` | `Zmiana ogrzewania` | `secondary` |
| `connectivity_change` | `Łączność` | `outline` |
| `alert_sent` | `Alert e-mail` | `default` |

Szczegóły column derivation:
- `threshold_breach`: parse `payload.badge` → "Zbyt zimno" or "Zbyt gorąco"
- `toggle_heat`: parse `payload.pinnedOff` → "Ogrzewanie wyłączone" or "Ogrzewanie włączone"
- `connectivity_change`: parse `payload.isOnline` → "Urządzenie online" or "Urządzenie offline"
- `alert_sent`: parse `payload.count` → "Alert e-mail (N pokojów)"

Client-side filter logic:
- Room filter: show rows where `row.roomId === selectedRoomId` (exclude null roomId rows when filter active)
- Device filter: show rows where `row.deviceId === selectedDeviceId`
- Both filters can be active simultaneously (AND logic)

`"use client"` directive required at top of file.

### Success Criteria

#### Automated Verification

- `npm run ci` passes (biome + tsc + vitest + next build)
- `npm run typecheck` passes

#### Manual Verification

- Open `/events` — page loads in < 2 s with no console errors
- After Phase 3 hook activation: page shows at least one event row
- Toggle heat on/off → row appears in feed on next page load
- Apply room filter → only matching rows shown; removing filter restores full feed
- Open `/` (main dashboard) → no visible regression in load time or content
- Open `/events` without being logged in (private browser) → redirected to `/login`

---

## Testing Strategy

### Unit Tests

- `src/server/api/routers/event.test.ts`: test `event.list` with a real test DB (Vitest + libsql in-memory). Seed 3 rows: one outside the 24 h window, two inside. Assert the query returns exactly 2, ordered newest first.
- Cover the 200-row limit: seed 201 rows, assert 200 returned.

### Integration Tests

Not applicable at this scale — manual verification covers the cross-component flow.

### Manual Testing Steps

1. Start dev server (`npm run dev`)
2. Log in as the admin user
3. Navigate to `/events` — confirm empty state renders ("Brak zdarzeń z ostatnich 24h")
4. Toggle heat off on any room → navigate to `/events` → confirm `toggle_heat` row appears
5. Toggle heat back on → confirm second `toggle_heat` row appears
6. Open `/events` filter → select the room → confirm only heat toggle rows shown
7. Select a device in the device filter → only connectivity rows shown (if any)
8. Open `/` — confirm dashboard loads normally, no new network requests to `/api/trpc/event.*`
9. Check `network` tab on `/events` — confirm initial load is a single prefetched tRPC call (no waterfall)

## Performance Considerations

The `event_log` table is queried only on the `/events` page — not on the dashboard home. The `created_at` index ensures the 24 h window filter is resolved without a full table scan. With small fleets (1–5 devices), 200 entries/24 h is a conservative upper bound; the indexed query will be sub-millisecond.

## References

- PRD: `context/foundation/prd-v11.md`
- Alert control source: `src/server/lib/alert-control.ts` (lines 107–169)
- Poller source: `src/server/workers/tuya-poller.ts` (lines 35–130)
- toggleHeat source: `src/server/api/routers/room.ts` (lines 335–398)
- Schema reference: `src/server/db/schema.ts` (lines 13–15 for `createTable` pattern)
- UI table pattern: `src/app/_components/setup/device-table.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & Migration

#### Automated

- [x] 1.1 `npm run db:generate` exits 0 and produces `drizzle/0014_*.sql` — 39d3c6f
- [x] 1.2 `npm run db:migrate` exits 0 against local DB — 39d3c6f
- [x] 1.3 `npm run typecheck` passes with new table in scope — 39d3c6f

#### Manual

- [ ] 1.4 Drizzle Studio confirms `.bootstrap-scaffold_event_log` table with correct columns and index

### Phase 2: tRPC Event Router

#### Automated

- [x] 2.1 `npm run typecheck` passes — 1c2890d
- [x] 2.2 `npm run ci` passes (biome + tsc + vitest + build) — 1c2890d

#### Manual

- [ ] 2.3 `event.list` callable and returns typed response (verified in Phase 4 or via studio)

### Phase 3: Inline Event Hooks

#### Automated

- [x] 3.1 `npm run typecheck` passes (four new inserts satisfy schema column types) — c4d0077
- [x] 3.2 `npm run ci` passes (biome + tsc + vitest + existing test suite) — c4d0077

#### Manual

- [ ] 3.3 toggleHeat → event_log row confirmed (via studio or Phase 4 page)
- [ ] 3.4 Connectivity change → `connectivity_change` row confirmed
- [ ] 3.5 Dashboard `/` shows no regression

### Phase 4: /events Page

#### Automated

- [x] 4.1 `npm run ci` passes (biome + tsc + vitest + next build)
- [x] 4.2 `npm run typecheck` passes

#### Manual

- [ ] 4.3 `/events` loads in < 2 s, no console errors
- [ ] 4.4 Heat toggle produces visible row in feed
- [ ] 4.5 Room filter shows only matching rows; reset restores full feed
- [ ] 4.6 Dashboard `/` loads without regression after feature is live
- [ ] 4.7 Unauthenticated access redirects to `/login`
