# Room Assignment Setup — Implementation Plan

## Overview

Add a `/setup` admin route where the facility manager can perform full room CRUD (create, rename, delete) and assign each discovered device to a room via a per-device dropdown. The backend is a new `room` tRPC router; the UI follows the established dark-theme pattern. The NextAuth middleware already protects `/setup` — no extra auth code needed.

## Current State Analysis

- **DB schema**: `rooms`, `deviceRoomAssignments`, `roomThresholds` tables exist with correct structure. `deviceRoomAssignments.deviceId` has a UNIQUE constraint, so reassignment is an upsert (no duplicate rows).
- **Seed state**: 5 stub devices seeded, 0 rooms, 0 assignments — room creation is mandatory (not optional).
- **Existing tRPC**: `device` router with `overview` (query) and `setpoint` (mutation). No room management procedures.
- **`device.overview`**: already returns `rooms[].devices[]` + `unassigned[]` with `roomId`/`roomName` per device — reusable on the setup page without a new device query.
- **UI**: one server-component page (`/`), three client components (`DeviceOverview`, `RoomGroup`, `DeviceCard`), dark theme (`bg-gray-950` / `bg-gray-800`), tRPC hooks pattern established.
- **Auth**: `src/middleware.ts` protects all routes except `/login` and static assets via NextAuth — `/setup` is automatically gated.

## Desired End State

- A `room` tRPC router with 5 protected procedures is registered in `appRouter`.
- `/setup` renders a two-panel admin screen: room management (create/rename/delete) + device assignment grid (all devices with room dropdown).
- Changing a device's dropdown immediately calls `room.setDeviceRoom`; the main dashboard reflects the new assignment.
- Room delete is blocked (BAD_REQUEST) when the room has assigned devices; the button is disabled with a tooltip.
- "Setup" link appears in the top-right of the main dashboard header.
- `room.test.ts` covers auth-gate + happy paths + key error paths following the §6.2 cookbook.

### Key Discoveries

- `deviceRoomAssignments.deviceId` is UNIQUE — reassignment is `onConflictDoUpdate`, not a second insert (`src/server/db/schema.ts:93–115`)
- `device.overview` joins `devices LEFT JOIN deviceRoomAssignments LEFT JOIN rooms` and returns all devices with their current `roomId`/`roomName` — no separate device-list query needed for the setup page (`src/server/api/routers/device.ts:99–185`)
- `db` is initialized via `globalThis` singleton for HMR safety (`src/server/db/index.ts`)
- Middleware matcher excludes `login`, `api/auth`, and `_next/*` — `/setup` is covered automatically (`src/middleware.ts:6–8`)
- Lessons: `localKey` columns use AES-256-GCM helpers (`lessons.md`); not relevant here (no localKey writes in this slice)

## What We're NOT Doing

- Room threshold configuration — that is S-05
- Device rename — not in FR-013
- Gateway management — separate concern
- UI component tests or snapshot tests — excluded per `test-plan.md §7`
- Room reordering / ordering index — not in PRD

## Implementation Approach

Three sequential phases: backend first (room router), then UI (setup page + components + header nav), then tests. Each phase has automated typecheck/lint gates. The room router follows the exact same `protectedProcedure` + Drizzle pattern as the existing `device` router.

---

## Phase 1: Room tRPC Router

### Overview

Create `src/server/api/routers/room.ts` with 5 protected procedures, then register it in `appRouter`. No UI changes in this phase.

### Changes Required

#### 1. Room Router

**File**: `src/server/api/routers/room.ts` (new)

**Intent**: Implement all room-management and device-assignment procedures the setup UI needs. All procedures are protected (require authenticated session).

**Contract**: 5 procedures:

- **`list`** (query, no input) → `{ id: string, name: string, deviceCount: number }[]`
  Uses a LEFT JOIN of `rooms` → `deviceRoomAssignments` grouped by room, or a subquery count. Return all rooms ordered by `createdAt` ascending.

- **`create`** (mutation, `{ name: z.string().min(1).max(255) }`) → `{ id, name, createdAt }`
  Inserts a new room row with a UUID id and returns the inserted row.

- **`rename`** (mutation, `{ id: z.string(), name: z.string().min(1).max(255) }`) → `{ id, name }`
  Updates `rooms.name` where `rooms.id = id`. If 0 rows affected, throw `TRPCError({ code: "NOT_FOUND" })`.

- **`delete`** (mutation, `{ id: z.string() }`) → `{ success: true }`
  Before deleting, count `deviceRoomAssignments` rows where `roomId = id`. If count > 0, throw `TRPCError({ code: "BAD_REQUEST", message: "Room has assigned devices" })`. Otherwise delete the room.

- **`setDeviceRoom`** (mutation, `{ deviceId: z.string(), roomId: z.string().nullable() }`) → `{ success: true }`
  - If `roomId` is non-null: verify room exists (throw `NOT_FOUND` if not); then `db.insert(deviceRoomAssignments).values(...).onConflictDoUpdate({ target: deviceRoomAssignments.deviceId, set: { roomId } })`.
  - If `roomId` is null: `db.delete(deviceRoomAssignments).where(eq(deviceRoomAssignments.deviceId, deviceId))`.

#### 2. App Router

**File**: `src/server/api/root.ts` (modify)

**Intent**: Register the room router under the `room` namespace so frontend can call `api.room.*`.

**Contract**: Import `roomRouter` from `./routers/room`; add `room: roomRouter` to the `createTRPCRouter` call alongside the existing `device: deviceRouter`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with zero errors
- `npm run check` (Biome lint) passes
- `npm run dev` starts and console shows no runtime errors

#### Manual Verification

- (No manual verification for pure backend — correctness is validated in Phase 3 tests)

**Implementation Note**: After all automated verification passes, proceed to Phase 2. Manual verification is deferred to Phase 3.

---

## Phase 2: Setup UI

### Overview

Create the `/setup` route (server component), three client components (setup shell, room manager, device assignment grid), and add a "Setup" navigation link to the main dashboard header.

### Changes Required

#### 1. Setup Page

**File**: `src/app/setup/page.tsx` (new)

**Intent**: Server component entry point for the setup route. Prefetches rooms and device overview data for SSR hydration; delegates rendering to the client shell.

**Contract**: Async server component. Calls `void api.room.list.prefetch()` and `void api.device.overview.prefetch()` (same pattern as `src/app/page.tsx`). Wraps `SetupShell` in `HydrateClient`. Page outer wrapper: `<main className="min-h-screen bg-gray-950 px-6 py-8 text-white">`.

#### 2. Setup Shell (Client Component)

**File**: `src/app/_components/setup/setup-shell.tsx` (new)

**Intent**: Top-level client component. Subscribes to `api.room.list` and `api.device.overview`, flattens device data, and passes it to child components. Handles query-level loading and error states.

**Contract**: `"use client"`. Uses `api.room.list.useQuery()` and `api.device.overview.useQuery()`. Flattens `data.rooms` + `data.unassigned` from `device.overview` into a single `DeviceItem[]`. Renders: page title "Room Setup" with a "← Dashboard" back link, then `RoomManager` and `DeviceAssignmentGrid` side by side or stacked.

#### 3. Room Manager (Client Component)

**File**: `src/app/_components/setup/room-manager.tsx` (new)

**Intent**: Room CRUD panel — lists rooms with device count badge, inline rename, create-new input, and delete button.

**Contract**: Props: `{ rooms: { id: string, name: string, deviceCount: number }[], utils: ReturnType<typeof api.useUtils> }` (utils for query invalidation). Renders:
- Room list: each row shows room name + device count badge + rename icon button + delete button. Delete button is disabled (with `title` tooltip "Room has assigned devices") when `deviceCount > 0`. Rename: clicking the icon turns the name into an `<input>`; pressing Enter or blur calls `api.room.rename` mutation then invalidates `api.room.list`.
- Create section at bottom: `<input placeholder="New room name" />` + "Add" button; calls `api.room.create` mutation, clears input, invalidates `api.room.list`.
- Delete: calls `api.room.delete` mutation; on `BAD_REQUEST` show inline error "Room has assigned devices — reassign them first". On success invalidate `api.room.list`.

#### 4. Device Assignment Grid (Client Component)

**File**: `src/app/_components/setup/device-assignment-grid.tsx` (new)

**Intent**: Grid of all devices (assigned + unassigned), each with a room dropdown. Changing the dropdown calls `room.setDeviceRoom` immediately and shows inline saving/error state.

**Contract**: Props: `{ devices: DeviceItem[], rooms: { id: string, name: string }[], utils: ReturnType<typeof api.useUtils> }`. Renders a responsive grid (same breakpoints as `RoomGroup`: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`). Each device card shows: device name, type badge (reuse color map from `DeviceCard`), and a `<select>` with options: `<option value="">— Unassigned</option>` then one `<option>` per room. Current value = `device.roomId ?? ""`. On change: call `api.room.setDeviceRoom` with `{ deviceId: device.id, roomId: selectedValue || null }`; while pending show `disabled` + opacity; on error show brief inline error message; on success invalidate both `api.room.list` and `api.device.overview`.

#### 5. Dashboard Header Navigation

**File**: `src/app/page.tsx` (modify)

**Intent**: Add a "Setup" link to the main dashboard header so users can reach `/setup`.

**Contract**: Wrap the current `<h1>` in a `<div className="mb-8 flex items-center justify-between">`. Keep `<h1>` on the left; add `<Link href="/setup" className="text-sm text-gray-400 hover:text-white transition-colors">Setup →</Link>` on the right. Import `Link` from `"next/link"`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with zero errors
- `npm run check` (Biome lint) passes
- `npm run dev` starts without errors

#### Manual Verification

- Main dashboard shows "Setup →" link in top-right of header
- Clicking "Setup →" navigates to `/setup`
- Navigating to `/setup` while logged out redirects to `/login`
- `/setup` renders room manager panel + device assignment grid
- Room creation: type a name → "Add" → room appears in list with "0" device badge
- Room rename: click edit icon → type new name → Enter → name updates
- Room delete (0 devices): button active → click → room removed from list
- Room delete (with devices): button is disabled and shows tooltip "Room has assigned devices"
- Device assignment: change dropdown to a room → dropdown saves → main dashboard shows device in that room on next `device.overview` call
- Unassign: change dropdown to "— Unassigned" → device appears in Unassigned section on main dashboard

**Implementation Note**: After manual verification passes, proceed to Phase 3.

---

## Phase 3: Integration Tests

### Overview

Add `room.test.ts` following the §6.2 cookbook exactly: `vi.mock` hoists for `~/server/auth` and `~/server/db` at the top, `createCaller` from `~/server/api/root`, auth-gate tests for all procedures, happy-path tests, and key error-path tests.

### Changes Required

#### 1. Room Router Tests

**File**: `src/server/api/routers/room.test.ts` (new)

**Intent**: Verify auth-gate enforcement, correct happy-path behavior, and the two most important error paths (delete blocked, not-found).

**Contract**: Follows §6.2 cookbook structure. Required mocks at top (Vitest hoists):
```ts
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() } }));
```
Caller creation follows the established pattern:
```ts
const caller = createCaller({ db: {} as never, session: null, headers: new Headers() });
```

Test cases to cover:

**Auth-gate (session: null → UNAUTHORIZED):**
- `room.list` without session
- `room.create` without session
- `room.rename` without session
- `room.delete` without session
- `room.setDeviceRoom` without session

**Happy paths (session: mock user):**
- `room.create` → returns created room with id and name
- `room.list` → returns array of rooms with deviceCount
- `room.rename` with existing room → returns updated name
- `room.delete` with no assignments → returns `{ success: true }`
- `room.setDeviceRoom` with valid roomId → returns `{ success: true }` and upsert was called
- `room.setDeviceRoom` with roomId null → returns `{ success: true }` and delete was called

**Key error paths:**
- `room.rename` when room not found → throws `NOT_FOUND`
- `room.delete` when devices are assigned → throws `BAD_REQUEST` with message containing "assigned"
- `room.setDeviceRoom` with non-existent roomId → throws `NOT_FOUND`

**Anti-pattern to avoid**: Do not assert only the success case for `delete` and `setDeviceRoom`. The highest-signal tests are the blocked-delete and the unassign path — they prove the guards fired before the DB operation.

Add `afterEach(() => vi.resetAllMocks())` to prevent mock state leaking between test cases.

### Success Criteria

#### Automated Verification

- `npm test` passes with all room.test.ts cases green
- `npm run typecheck` passes
- `npm run check` passes

#### Manual Verification

- No regressions in existing `device.test.ts`, `device.setpoint.test.ts`, `crypto.test.ts`, `tuya-poller.test.ts`, `scoring.test.ts`

**Implementation Note**: After all tests are green, this change is complete. The setup screen is ready for production use.

---

## Testing Strategy

### Integration Tests

- `src/server/api/routers/room.test.ts` — 5 auth-gate + 6 happy-path + 3 error-path cases (see Phase 3)
- Follows §6.2 cookbook (`context/foundation/test-plan.md`)

### Manual Testing Steps

1. Start dev server with `npm run dev` (stub mode: `TUYA_STUB=true` in `.env`)
2. Log in as seeded admin user
3. Verify "Setup →" link in main dashboard header
4. Create 2 rooms: "Room 1", "Room 2"
5. Assign stub devices to rooms via dropdowns
6. Return to dashboard — verify devices appear under correct room groups
7. Rename "Room 1" to "Kantyna" — verify update
8. Try to delete "Kantyna" (has devices) — verify button disabled or error shown
9. Unassign all devices from "Room 2" via "— Unassigned" dropdown — then delete "Room 2" — verify success

## References

- Roadmap: S-02 in `context/foundation/roadmap.md`
- PRD: FR-013 in `context/foundation/prd.md`
- Test cookbook: §6.2 in `context/foundation/test-plan.md`
- Device router reference: `src/server/api/routers/device.ts`
- DB schema: `src/server/db/schema.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Room tRPC Router

#### Automated

- [x] 1.1 `npm run typecheck` passes with zero errors — bc85590
- [x] 1.2 `npm run check` (Biome lint) passes — bc85590
- [x] 1.3 `npm run dev` starts without runtime errors — bc85590

#### Manual

- [x] 1.4 (deferred to Phase 3 tests — no manual verification for pure backend) — bc85590

### Phase 2: Setup UI

#### Automated

- [x] 2.1 `npm run typecheck` passes with zero errors — d58e30b
- [x] 2.2 `npm run check` (Biome lint) passes — d58e30b
- [x] 2.3 `npm run dev` starts without errors — d58e30b

#### Manual

- [x] 2.4 Main dashboard shows "Setup →" link in top-right header — d58e30b
- [x] 2.5 `/setup` redirects to `/login` when logged out — d58e30b
- [x] 2.6 Room creation: type name → Add → room appears with 0-device badge — d58e30b
- [x] 2.7 Room rename: edit icon → type → Enter → name updates — d58e30b
- [x] 2.8 Room delete (0 devices): button active → click → room removed — d58e30b
- [x] 2.9 Room delete (with devices): button disabled + tooltip shown — d58e30b
- [x] 2.10 Device assignment: change dropdown → main dashboard reflects assignment — d58e30b
- [x] 2.11 Unassign: select "— Unassigned" → device appears in Unassigned section — d58e30b

### Phase 3: Integration Tests

#### Automated

- [x] 3.1 `npm test` passes — all room.test.ts cases green — 1a9825e
- [x] 3.2 `npm run typecheck` passes — 1a9825e
- [x] 3.3 `npm run check` passes — 1a9825e

#### Manual

- [x] 3.4 No regressions in existing test files (device, crypto, scoring, tuya-poller) — 1a9825e
