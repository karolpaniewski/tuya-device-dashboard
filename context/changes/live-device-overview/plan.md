# Live Device Overview Implementation Plan

## Overview

Add a 30-second polling loop that queries Tuya LAN gateways for device state, stores results in an in-memory singleton, and serves them through a tRPC procedure to a React dashboard page. The home page becomes the device overview: all devices grouped by room (plus an "Unassigned" group), each card showing name, temperature, online/offline badge, device type, and last-polled time.

## Current State Analysis

- Schema ready: `gateways`, `devices`, `rooms`, `deviceRoomAssignments` (F-02)
- tRPC empty router ready; `protectedProcedure` with `{ db, session }` context exists (`src/server/api/trpc.ts`)
- Home page is a placeholder (`src/app/page.tsx`)
- No Tuya library, no polling worker, no device API, no device UI
- `src/server/lib/crypto.ts` provides `encryptLocalKey` / `decryptLocalKey` (must be used when reading `localKey` columns)
- `src/server/db/seed.ts` seeds admin user only; needs fixture gateway + device records for dev

## Desired End State

After logging in, the user sees all devices grouped by room with live data refreshed every 30 seconds. Device cards show name, temperature (or "—" for non-sensor types), online/offline badge, device type label, and "last updated N s ago". Devices without a room assignment appear in an "Unassigned" section at the bottom. In development, a stub Tuya client returns plausible fixture readings; the real tuyapi client is a documented placeholder, ready for production keys.

### Key Discoveries

- `src/trpc/server.ts:28` has `@ts-expect-error` suppressing the empty-router type error — this must be removed when the device router is wired in Phase 3; the compiler will force it
- `src/server/db/index.ts` creates the Drizzle client as a global singleton via `globalThis` — the poller must import from here, not create its own client
- `instrumentation.ts` in a `src/`-based project lives at `src/instrumentation.ts`; Next.js 15 activates it without any `next.config.js` changes
- Module-level singletons are shared across the Next.js Node.js process — the state store `Map` imported by the poller and the tRPC router resolves to the same instance at runtime
- `tuyapi@7.7.1` is available on npm (Node.js Tuya LAN library); not yet installed

## What We're NOT Doing

- Real Tuya gateway communication: the real client is a documented placeholder; production integration requires hardware + local keys (roadmap open question)
- Room assignment UI: devices without a room show in "Unassigned" — assignment is S-02
- Filter/search: S-03
- Valve setpoint control: S-04
- Threshold scoring (OK / Too Cold / Too Hot): S-05
- SSE or WebSocket: plain react-query `refetchInterval` is sufficient for 30s freshness at ≤50 devices
- Gateway provisioning UI: gateways are seeded in dev; UI is out of scope for S-01

## Implementation Approach

Five phases in dependency order:

1. **Client abstraction + state store** — define the `TuyaGatewayClient` interface, stub + real-placeholder implementations, factory function, in-memory state store, `TUYA_STUB` env var
2. **Polling worker + instrumentation** — `tuya-poller.ts` reads gateways from DB every 30s; `instrumentation.ts` starts it on Next.js boot
3. **tRPC device router** — `device.overview` protected procedure merges DB rows with state store into a grouped response; remove `@ts-expect-error`
4. **Seed extension** — add 1 fixture gateway + 5 stub devices to `db:seed`
5. **Frontend overview page** — rewrite `page.tsx` + new `DeviceOverview`, `RoomGroup`, `DeviceCard` components

## Critical Implementation Details

**Process-level singleton**: the in-memory state store (`Map`) and the poller share the same Node.js process in development (`next dev`) and production (`next start`). This is reliable because instrumentation.ts and tRPC procedures both run in the same Node.js worker. Do not try to share state via a database for the polling tick — the in-memory approach is correct and intentional.

**instrumentation.ts NEXT_RUNTIME guard**: dynamic-import the poller inside the `if (process.env.NEXT_RUNTIME === 'nodejs')` guard. Without it, the import is attempted in Edge runtime contexts (middleware), which cannot run Node.js code. Use `await import()` syntax so the module is not bundled into the Edge bundle.

**decryptLocalKey before passing to tuyapi**: the `localKey` column stores AES-256-GCM ciphertext (lessons.md rule). The poller must call `decryptLocalKey(gateway.localKey)` before handing the key to the real Tuya client. The stub client ignores the key entirely.

---

## Phase 1: Tuya Client Abstraction + State Store

### Overview

Define the data contract between the polling loop and the rest of the system. Install `tuyapi`. Create the `TuyaGatewayClient` interface, a stub implementation returning fixture data, a real-client placeholder that logs a warning, a factory that selects between them via `TUYA_STUB` env var, and an in-memory device state store. Add `TUYA_STUB` to `src/env.js` and `.env`.

### Changes Required

#### 1. Install tuyapi

**File**: `package.json` (via npm install)

**Intent**: Add the Node.js Tuya LAN library so the real-client placeholder has the import available and the dev experience matches production.

**Contract**: Run `npm install tuyapi`. No code imports it in this phase — the real client stub is a placeholder only.

#### 2. Tuya client types

**File**: `src/server/lib/tuya/types.ts` (new)

**Intent**: Define the data shapes that flow between the Tuya client, the poller, and the state store. A single canonical interface prevents the real and stub clients from diverging.

**Contract**: Export two types — `TuyaDeviceReading` (tuyaDeviceId, isOnline, temperatureC | null) and `TuyaGatewayClient` (interface with one async method: `fetchGatewayDevices(gateway: { tuyaGatewayId, ipAddress, localKey }) → Promise<TuyaDeviceReading[]>`). The `localKey` parameter is the **plaintext** key — callers are responsible for decrypting before passing.

#### 3. Stub client

**File**: `src/server/lib/tuya/stub-client.ts` (new)

**Intent**: Return plausible fixture readings for the five seeded stub device IDs, simulating 150ms LAN latency. Used in development when real hardware is unavailable.

**Contract**: Implements `TuyaGatewayClient`. Returns a fixed array of `TuyaDeviceReading` for these IDs regardless of which gateway is passed:
- `stub-dev-001` (sensor): online, 21.5°C
- `stub-dev-002` (sensor): online, 19.2°C
- `stub-dev-003` (valve): online, 20.1°C
- `stub-dev-004` (valve): offline, null
- `stub-dev-005` (plug): online, null

Add a 150ms artificial delay (`await new Promise(r => setTimeout(r, 150))`) to simulate network latency. Export as a singleton `stubTuyaClient`.

#### 4. Real client placeholder

**File**: `src/server/lib/tuya/real-client.ts` (new)

**Intent**: Placeholder that logs a warning and returns no readings. Prevents the poller from crashing when `TUYA_STUB` is not set but no hardware is available. Documents the tuyapi call pattern for the implementer who will complete this when keys arrive.

**Contract**: Implements `TuyaGatewayClient`. The method logs `[tuya-poller] Real Tuya client not fully implemented. Set TUYA_STUB=true for development.` and returns `[]`. Include a commented block showing the tuyapi pattern for future reference:

```ts
// When implementing for production, for each device under this gateway:
// const device = new TuyAPI({ id: dev.tuyaDeviceId, key: gateway.localKey, version: '3.3' });
// await device.connect();
// const schema = await device.get({ schema: true });
// await device.disconnect();
```

Export as a singleton `realTuyaClient`.

#### 5. Client factory

**File**: `src/server/lib/tuya/index.ts` (new)

**Intent**: Single import point that routes to stub or real client based on `TUYA_STUB` env var. All consumers import `getTuyaClient()` — none import stub or real directly.

**Contract**: Export `getTuyaClient(): TuyaGatewayClient`. Returns `stubTuyaClient` when `process.env.TUYA_STUB === 'true'`, otherwise `realTuyaClient`. Re-export `TuyaDeviceReading` and `TuyaGatewayClient` types.

#### 6. Device state store

**File**: `src/server/lib/device-state-store.ts` (new)

**Intent**: In-memory singleton that holds the latest polled state for every device. The poller writes to it; the tRPC procedure reads from it. Both share the same instance because they run in the same Node.js process.

**Contract**: Export a module-level `deviceStateStore: Map<string, DeviceState>` (key = `tuyaDeviceId`). Export `DeviceState` type: `{ isOnline: boolean; temperatureC: number | null; lastPolledAt: Date }`. No class, no function — just the exported Map.

#### 7. TUYA_STUB env var

**File**: `src/env.js`

**Intent**: Validate `TUYA_STUB` at startup so a misconfigured value is caught early, not silently ignored.

**Contract**: Add `TUYA_STUB: z.string().optional()` to the `server` block and `TUYA_STUB: process.env.TUYA_STUB` to `runtimeEnv`. Also add `TUYA_STUB=true` to `.env`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run check` (Biome lint) passes
- `ls node_modules/tuyapi` confirms package installed

#### Manual Verification

- None for this phase (infrastructure only — no runtime output yet)

---

## Phase 2: Polling Worker + instrumentation.ts

### Overview

Wire the persistent background worker. `tuya-poller.ts` reads all gateways from the database on each tick, calls `getTuyaClient().fetchGatewayDevices()` for each, and writes results into `deviceStateStore`. `instrumentation.ts` calls `startPollingLoop()` once on Next.js startup, guarded to Node.js runtime only.

### Changes Required

#### 1. Polling worker

**File**: `src/server/workers/tuya-poller.ts` (new)

**Intent**: Implements the 30-second cycle. On each tick: reads all gateway rows from the DB, calls the Tuya client for each, updates `deviceStateStore` with fresh readings, and logs per-gateway errors without crashing the loop.

**Contract**: Export `startPollingLoop(): void`. The function calls `pollOnce()` immediately (don't wait 30s for first data), then calls `setInterval(pollOnce, 30_000)`. `pollOnce` must:
1. Import `db` from `~/server/db` (the Drizzle singleton)
2. `await db.select().from(gateways)` — all gateway rows
3. For each gateway: decrypt `localKey` with `decryptLocalKey()` if non-null (import from `~/server/lib/crypto`), call `client.fetchGatewayDevices({ tuyaGatewayId, ipAddress, localKey: decryptedKey })`
4. For each reading: `deviceStateStore.set(tuyaDeviceId, { isOnline, temperatureC, lastPolledAt: new Date() })`
5. Catch per-gateway errors with `console.error` — never throw from the loop

#### 2. Instrumentation entry point

**File**: `src/instrumentation.ts` (new)

**Intent**: Next.js 15 calls `register()` once on server startup. This is the only place `startPollingLoop()` is called — no other file should start the loop.

**Contract**: Export async `register()`. Inside, guard with `if (process.env.NEXT_RUNTIME === 'nodejs')`, then dynamically import: `const { startPollingLoop } = await import('~/server/workers/tuya-poller')`, then call `startPollingLoop()`. The dynamic import is required to prevent bundling Node.js-only code into the Edge runtime.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run check` passes

#### Manual Verification

- `npm run dev` starts without errors
- After dev server boots, console shows polling log output (confirm stub readings are written) — stub client logs nothing by default, but the poller can log `[tuya-poller] polled N gateways` once per tick

---

## Phase 3: tRPC Device Router

### Overview

Add `device.overview` as a protected tRPC procedure. It joins DB device records with their room assignments, merges with `deviceStateStore`, and returns a grouped response: an array of room groups (each with their devices) and an `unassigned` array. Wire into `appRouter`, remove the `@ts-expect-error` in `src/trpc/server.ts`.

### Changes Required

#### 1. Device router

**File**: `src/server/api/routers/device.ts` (new)

**Intent**: Single procedure `device.overview` that serves the full device overview response. Uses a LEFT JOIN to include devices without room assignments.

**Contract**: `protectedProcedure.query(async ({ ctx }) => { ... })`. Return type (inferred, not explicitly annotated):
```
{
  rooms: Array<{ roomId: string; roomName: string; devices: DeviceItem[] }>;
  unassigned: DeviceItem[];
}
```
where `DeviceItem` has: `id`, `tuyaDeviceId`, `name`, `deviceType` (`'sensor' | 'valve' | 'plug'`), `roomId: string | null`, `roomName: string | null`, `isOnline: boolean`, `temperatureC: number | null`, `lastPolledAt: Date | null`.

Query: `ctx.db.select({ device: devices, room: rooms }).from(devices).leftJoin(deviceRoomAssignments, eq(deviceRoomAssignments.deviceId, devices.id)).leftJoin(rooms, eq(rooms.id, deviceRoomAssignments.roomId))`. Map each row: merge device columns + room columns + state from `deviceStateStore.get(device.tuyaDeviceId)` (default `isOnline: false`, `temperatureC: null`, `lastPolledAt: null` if not present). Then group into `rooms` Map and `unassigned` array.

Import `deviceStateStore` from `~/server/lib/device-state-store`. Import Drizzle table references from `~/server/db/schema`.

#### 2. Wire into root router

**File**: `src/server/api/root.ts`

**Intent**: Register the device router so it's reachable as `api.device.*`.

**Contract**: Import `deviceRouter` from `./routers/device`. Replace `createTRPCRouter({})` with `createTRPCRouter({ device: deviceRouter })`.

#### 3. Remove @ts-expect-error

**File**: `src/trpc/server.ts`

**Intent**: The `@ts-expect-error` was added as a self-correcting marker for the empty-router type quirk. Adding the device router resolves it — if the comment is kept, TypeScript will error with "Unused @ts-expect-error".

**Contract**: Delete the `// @ts-expect-error` line at line 28. TypeScript should now compile the `caller` argument cleanly.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes (critical: verifies the @ts-expect-error is gone and types resolve)
- `npm run check` passes

#### Manual Verification

- None for this phase (no UI yet)

---

## Phase 4: Seed Extension

### Overview

Extend `src/server/db/seed.ts` to insert one fixture gateway and five stub devices. These records give the stub Tuya client meaningful data to return and give S-02's room assignment setup a real device list to work with.

### Changes Required

#### 1. Extend seed script

**File**: `src/server/db/seed.ts`

**Intent**: After seeding the admin user, upsert 1 fixture gateway and 5 fixture devices whose `tuyaDeviceId` values match the stub client's fixture array. Use `onConflictDoUpdate` on `tuyaGatewayId` / `tuyaDeviceId` so re-running `db:seed` is idempotent.

**Contract**: 

Import `gateways`, `devices` from `./schema`. Import `encryptLocalKey` from `../lib/crypto` (path relative to seed.ts location in `src/server/db/`).

Gateway row:
- `tuyaGatewayId: 'stub-gw-001'`
- `name: 'Main Gateway (stub)'`
- `ipAddress: '192.168.1.100'`
- `localKey: encryptLocalKey('stub-local-key-0000000000000000')` (32-char plaintext to match AES-256 input expectations)

Device rows (all with `gatewayId` set to the inserted gateway's `id`):
- `tuyaDeviceId: 'stub-dev-001'`, `name: 'Sensor A (Room 1)'`, `deviceType: 'sensor'`
- `tuyaDeviceId: 'stub-dev-002'`, `name: 'Sensor B (Room 2)'`, `deviceType: 'sensor'`
- `tuyaDeviceId: 'stub-dev-003'`, `name: 'Valve A (Room 1)'`, `deviceType: 'valve'`
- `tuyaDeviceId: 'stub-dev-004'`, `name: 'Valve B (Room 2)'`, `deviceType: 'valve'`
- `tuyaDeviceId: 'stub-dev-005'`, `name: 'Smart Plug 1'`, `deviceType: 'plug'`

Insert gateway first, capture its returned `id`, then insert devices with `gatewayId` set to that id. Use `returning({ id: gateways.id })` to capture the gateway id after upsert.

Log `✓ Seeded fixture gateway + 5 devices` on success.

### Success Criteria

#### Automated Verification

- `npm run db:seed` exits with code 0

#### Manual Verification

- Drizzle Studio (`npm run db:studio`) shows 1 gateway row and 5 device rows

---

## Phase 5: Frontend Overview Page

### Overview

Rewrite `src/app/page.tsx` as the device dashboard. The page server component prefetches `device.overview` and wraps a `DeviceOverview` client component in `HydrateClient`. `DeviceOverview` uses `useQuery` with `refetchInterval: 30_000`. Three new components: `DeviceOverview`, `RoomGroup`, `DeviceCard`.

### Changes Required

#### 1. DeviceCard component

**File**: `src/app/_components/device-card.tsx` (new)

**Intent**: Renders one device's state in a card layout. Accepts a single `DeviceItem` prop (the shape returned by `device.overview`).

**Contract**: Display layout:
- **Top row**: device name (bold), device type badge (`sensor` / `valve` / `plug`) as a small text tag with distinct background colors (e.g. blue/orange/gray in Tailwind)
- **Middle**: temperature — show `{temperatureC}°C` if non-null; show `—` if null
- **Bottom row**: online/offline badge (green dot + "Online" / red dot + "Offline"); "Updated Xs ago" — calculate seconds from `lastPolledAt` to `Date.now()` (show "—" if `lastPolledAt` is null)

The "Xs ago" label should be a simple `Math.round((Date.now() - lastPolledAt.getTime()) / 1000)` calculation rendered inline. It will be slightly stale between refetch cycles — acceptable for S-01.

Props: accept the inferred `RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number]` type (import from `~/trpc/react`).

#### 2. RoomGroup component

**File**: `src/app/_components/room-group.tsx` (new)

**Intent**: Renders a named room section containing its device cards. Used for both real rooms and the "Unassigned" group (which passes `roomName: "Unassigned"` and a slightly different visual style).

**Contract**: Props: `{ roomName: string; devices: DeviceItem[]; isUnassigned?: boolean }`. Renders a room header (room name in `<h2>`) followed by a responsive grid of `DeviceCard` components. `isUnassigned` adds a visual cue (e.g. muted text color on the heading).

#### 3. DeviceOverview client component

**File**: `src/app/_components/device-overview.tsx` (new)

**Intent**: Client component that owns the live-refresh loop and renders all room groups + unassigned section.

**Contract**: `'use client'` directive. Uses `api.device.overview.useQuery(undefined, { refetchInterval: 30_000, refetchIntervalInBackground: false })` (import `api` from `~/trpc/react`). While `isLoading`, render a loading placeholder (simple text "Loading devices…"). On `error`, render an error message. On success: render `<RoomGroup>` for each room, then render an "Unassigned" `<RoomGroup>` if `unassigned.length > 0`.

#### 4. Home page

**File**: `src/app/page.tsx`

**Intent**: Server component that prefetches the device overview and hydrates the client component, so the first paint has data.

**Contract**: Import `api` from `~/trpc/server` and `HydrateClient` from `~/trpc/server`. Call `void api.device.overview.prefetch()` (fire-and-forget — do not await). Wrap `<DeviceOverview />` in `<HydrateClient>`. The page itself needs no auth check — the tRPC procedure is `protectedProcedure` which redirects unauthenticated callers.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run check` passes
- `npm run dev` starts without runtime errors

#### Manual Verification

- After `npm run db:seed` and `npm run dev`, opening `http://localhost:3000` shows the device cards under an "Unassigned" group (no rooms assigned yet)
- Cards show: device name, type badge, temperature for sensors/valves (21.5°C / 19.2°C / 20.1°C / offline / online respectively), online/offline badge, last-polled timestamp
- After 30 seconds, "Updated Xs ago" counter resets (confirming auto-refresh fires)
- No console errors in browser devtools

---

## Testing Strategy

### Automated

- TypeScript compilation (`npm run typecheck`) is the primary gate — state store types, procedure return types, and component prop types are all inferred; if the shape drifts, it fails here
- Biome lint (`npm run check`) catches import protocol issues (e.g. `node:` prefix for built-ins)

### Manual Testing Steps

1. Run `npm run db:seed` — confirm `✓ Seeded fixture gateway + 5 devices`
2. Start dev server: `npm run dev`
3. Open `http://localhost:3000` in incognito — expect redirect to `/login`
4. Log in with `admin@company.local` / `change-me-on-first-login`
5. Confirm device overview renders with 5 cards in "Unassigned" group
6. Confirm temperature values match stub fixtures (21.5, 19.2, 20.1, offline, online-no-temp)
7. Wait 30 seconds — confirm cards refresh (last-polled time resets)
8. Check server console — confirm `[tuya-poller]` logs appear every 30s (add a log line to poller if needed for visibility)

## Performance Considerations

≤50 devices, ≤5 rooms. The LEFT JOIN + Map grouping is O(n) on devices. The state store lookup per device is O(1). No pagination, no virtual scrolling needed at this scale.

## Migration Notes

No schema changes. All new tables (`gateways`, `devices`) were created in F-02. Seed script is additive (upsert).

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-002, FR-003, FR-004, FR-005, US-01)
- Schema: `src/server/db/schema.ts`
- Crypto helpers: `src/server/lib/crypto.ts`
- Lessons: `context/foundation/lessons.md` (localKey encryption rule, tsx --env-file rule)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Tuya Client Abstraction + State Store

#### Automated

- [x] 1.1 `npm run typecheck` passes — bb95a97
- [x] 1.2 `npm run check` passes — bb95a97
- [x] 1.3 `ls node_modules/tuyapi` confirms package installed — bb95a97

#### Manual

- [x] 1.4 No manual verification for this phase (infrastructure only) — bb95a97

### Phase 2: Polling Worker + instrumentation.ts

#### Automated

- [x] 2.1 `npm run typecheck` passes — a67f54f
- [x] 2.2 `npm run check` passes — a67f54f

#### Manual

- [x] 2.3 `npm run dev` starts without errors and console shows polling log — a67f54f

### Phase 3: tRPC Device Router

#### Automated

- [x] 3.1 `npm run typecheck` passes (validates @ts-expect-error removed, types resolve) — b5f285c
- [x] 3.2 `npm run check` passes — b5f285c

#### Manual

- [x] 3.3 No manual verification for this phase (no UI yet) — b5f285c

### Phase 4: Seed Extension

#### Automated

- [x] 4.1 `npm run db:seed` exits with code 0 — 7000533

#### Manual

- [x] 4.2 Drizzle Studio shows 1 gateway + 5 device rows — 7000533

### Phase 5: Frontend Overview Page

#### Automated

- [x] 5.1 `npm run typecheck` passes
- [x] 5.2 `npm run check` passes
- [x] 5.3 `npm run dev` starts without runtime errors

#### Manual

- [x] 5.4 Device overview renders with 5 cards in "Unassigned" group after db:seed
- [x] 5.5 Card temperatures match stub fixtures; online/offline badges correct
- [x] 5.6 Auto-refresh fires after 30 seconds (last-polled time resets)
