# Polling Worker Integrity — Tests + Stale Detection

## Overview

Phase 2 of the test-plan rollout. Risk #2 requires two things: (1) server-side stale detection so managers can see when device data is frozen, and (2) unit tests that prove the worker's error paths do not corrupt the store. Both are absent today. This change adds them together — the protection is written first, then tested.

## Current State Analysis

- `src/server/workers/tuya-poller.ts` — `pollOnce` is a private function; only `startPollingLoop` is exported. The `getTuyaClient()` call at line 16 sits outside any try/catch: if the factory ever throws, `void pollOnce()` discards the rejection (unhandled in Node.js 15+). Both current client implementations never throw, so the gap is latent.
- `src/server/lib/device-state-store.ts` — `DeviceState` has `lastPolledAt: Date` but no stale flag. The Map retains whatever was last written; entries never expire.
- `src/server/api/routers/device.ts:25-35` — the resolver reads from the store and returns `lastPolledAt` as a raw timestamp with no threshold check. `isOnline: true` persists indefinitely if the worker stops. No `isStale` field exists on `DeviceItem`.
- `src/app/_components/device-card.tsx` — renders an "Updated Xs ago" human label from `lastPolledAt`, but no programmatic stale indicator.
- Vitest config, `vi.mock` patterns, and `deviceStateStore` direct-import pattern from Phase 1 all carry over without changes.

## Desired End State

After this change:

- The `device.overview` resolver computes `isStale: boolean` for each device. Threshold: 60 s (two polling cycles). A device last polled >60 s ago, or whose polling failed repeatedly, is marked stale. Devices never polled (`lastPolledAt: null`) are not stale — their absence is already signalled by `isOnline: false`.
- `device-card.tsx` shows a small "Data may be outdated" badge when `isStale` is true.
- `pollOnce` is exported and covered by three test cases: happy path (store updated), DB error (early return, store intact), gateway error (isolated — other gateways still update).
- `device.test.ts` has a `stale detection` suite covering fresh, stale, and never-polled device cases.
- `test-plan.md §6.3` documents the worker test pattern for future contributors.

### Key Discoveries

- `pollOnce` queries `db.select().from(gateways)` — two levels, no joins. The db mock for worker tests is simpler than for `device.overview`.
- `device.overview` uses `db.select(...).from(devices).leftJoin(...).leftJoin(...)` — four levels. The mock chain must match exactly.
- `deviceStateStore` is a plain exported `Map` singleton; tests import it directly and call `.clear()` in `beforeEach` to prevent cross-test pollution.
- The `vi.mock("~/server/lib/tuya", ...)` mock must be declared at the top of the test file (Vitest hoists `vi.mock` calls before imports). After hoisting, each `it` block controls the mock's return value via `vi.mocked(getTuyaClient).mockReturnValue(...)`.

## What We're NOT Doing

- Watchdog / automatic poller restart — infrastructure scope; out of test phase.
- Changing `DeviceState` interface — stale is computed in the resolver, not stored in the Map.
- UI component tests (excluded by `test-plan.md §7`).
- Real tuyapi integration (S-04).
- e2e or browser-level tests — stale detection is proven at the unit/integration level.

## Implementation Approach

Production code first (Phase 1), then worker tests (Phase 2), then resolver tests and cookbook (Phase 3). Tests use store manipulation directly — no e2e infrastructure. The resolver is testable via `createCaller` with an inline mock db, exactly as Phase 1 did for the auth-gate test.

## Critical Implementation Details

**Drizzle mock chain depth**: the `device.overview` query chains four calls. The mock must replicate all four levels:

```typescript
{ select: fn → { from: fn → { leftJoin: fn → { leftJoin: fn → resolves(rows) } } } }
```

Stopping at three levels (missing the second `leftJoin`) causes `leftJoin is not a function` at runtime. This is the only non-obvious mock shape in Phase 3.

**Store singleton isolation**: `deviceStateStore` is module-level. Worker tests (Phase 2) and resolver tests (Phase 3) both import the same singleton. Every `describe` block that touches the store must call `deviceStateStore.clear()` in `beforeEach` (or `afterEach`) to prevent bleed between test cases and between test files if run in the same worker.

**Mock reset ordering**: `vi.resetAllMocks()` clears mock state (call history, implementations) but does NOT clear `deviceStateStore`. Both resets must happen in `beforeEach`: `vi.resetAllMocks()` for mock control, `deviceStateStore.clear()` for store isolation.

---

## Phase 1: Production hardening + stale detection

### Overview

Export `pollOnce`, harden the `getTuyaClient()` error boundary, add `isStale` computation to the resolver, and show it in the device card. This phase produces the protection that Phases 2–3 will prove.

### Changes Required

#### 1. Export `pollOnce`

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: Make `pollOnce` directly callable in tests so each error path can be asserted in isolation, without invoking `startPollingLoop` and managing `setInterval` lifecycle.

**Contract**: Add the `export` keyword to `async function pollOnce(): Promise<void>`. `startPollingLoop` and the `setInterval` callback are unchanged.

#### 2. Harden `getTuyaClient()` error boundary

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: Move `getTuyaClient()` inside the per-gateway `try/catch` so any future factory throw is caught and logged per-gateway rather than escaping to the `void`-discarded Promise rejection.

**Contract**: Remove `const client = getTuyaClient()` from between the DB query block and the `for` loop (current line 16). Add it as the first statement inside the per-gateway `try { }` block, before `decryptLocalKey`. The returned singleton is the same on every iteration; calling it per iteration has no observable cost.

#### 3. Add `isStale` field to `DeviceItem`

**File**: `src/server/api/routers/device.ts`

**Intent**: Give the API response a boolean stale signal so the UI (and tests) can act on freshness independently of `isOnline`.

**Contract**:
- Add module-level constant: `const STALE_THRESHOLD_MS = 60_000`
- Add `isStale: boolean` to the `DeviceItem` interface.
- In the per-row item construction block (currently lines 25–35), compute staleness before building the item:
  ```typescript
  const isStale = state?.lastPolledAt
    ? Date.now() - state.lastPolledAt.getTime() > STALE_THRESHOLD_MS
    : false;
  ```
  Then include `isStale` in the `DeviceItem` object literal. A device absent from the store (`state === undefined`) returns `isStale: false` — `isOnline: false` already signals the absence.

#### 4. Stale indicator in device card

**File**: `src/app/_components/device-card.tsx`

**Intent**: Surface the `isStale` field to the manager so frozen data is visible without inspecting timestamps.

**Contract**: `isStale` propagates to this component automatically via the inferred `RouterOutputs` type — no import change needed. Add a conditional element in the card's bottom row: when `item.isStale` is true, render a small Tailwind-styled inline span (yellow background, e.g. `bg-yellow-100 text-yellow-800 text-xs px-1 rounded`) with the text `"Data may be outdated"`. Place it adjacent to the "Updated Xs ago" label. When `item.isStale` is false the element is absent; no layout change for fresh data.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes — validates `isStale` flows from `DeviceItem` through `RouterOutputs` to `device-card.tsx` props without errors
- `npm run check` (Biome lint) passes

#### Manual Verification

- `npm run dev` starts without errors
- Device overview page renders without regressions for fresh data (no stale badge shown)
- After manually backdating a `lastPolledAt` in the store (or waiting >60 s past the last stub poll tick), the affected device card shows the yellow "Data may be outdated" badge

---

## Phase 2: Polling worker unit tests

### Overview

Create `tuya-poller.test.ts`. Three cases: normal polling writes fresh entries to the store; a DB failure causes early return without touching existing entries; a gateway failure is caught, logged, and isolated.

### Changes Required

#### 1. Worker test file

**File**: `src/server/workers/tuya-poller.test.ts` (new)

**Intent**: Prove the store's integrity under three conditions: normal success, DB outage, and per-gateway LAN error. These are the cases the test-plan identified as the anti-pattern-to-avoid (happy-path-only) and the risk guidance (error path must be explicit).

**Contract**: Three `describe` blocks, each using `pollOnce` (imported from `~/server/workers/tuya-poller`) as the unit under test. All three share:

```typescript
vi.mock("~/server/db", () => ({ db: { select: vi.fn() } }));
vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));

import { db } from "~/server/db";
import { getTuyaClient } from "~/server/lib/tuya";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { pollOnce } from "~/server/workers/tuya-poller";

beforeEach(() => { deviceStateStore.clear(); vi.resetAllMocks(); });
```

**Describe 1 — "pollOnce › happy path":**

Wire `db.select` to resolve one gateway row with a valid `tuyaGatewayId`. Wire `getTuyaClient()` to return a client whose `fetchGatewayDevices` resolves with one `TuyaDeviceReading` (`{ tuyaDeviceId: "d1", isOnline: true, temperatureC: 21 }`). After `await pollOnce()`, assert:
- `deviceStateStore.has("d1")` is true
- `deviceStateStore.get("d1")!.isOnline` is `true`
- `deviceStateStore.get("d1")!.temperatureC` is `21`
- `deviceStateStore.get("d1")!.lastPolledAt` is a `Date` whose `.getTime()` is within 1 000 ms of `Date.now()`

**Describe 2 — "pollOnce › DB error":**

Pre-seed the store with a stale entry: `deviceStateStore.set("d1", { isOnline: true, temperatureC: 20, lastPolledAt: new Date(Date.now() - 90_000) })`. Wire `db.select` so that `from()` rejects with `new Error("SQLITE_ERROR")`. After `await pollOnce()`, assert:
- `pollOnce()` resolved (did not throw)
- `deviceStateStore.get("d1")!.lastPolledAt.getTime()` equals the pre-seeded old timestamp (store was NOT updated)
- `vi.spyOn(console, "error")` was called with a string containing `"DB error"`

**Describe 3 — "pollOnce › gateway fetch error":**

Wire `db.select` to resolve one gateway row. Wire `getTuyaClient()` to return a client whose `fetchGatewayDevices` rejects with `new Error("LAN timeout")`. After `await pollOnce()`, assert:
- `pollOnce()` resolved (did not throw)
- `deviceStateStore.has("d1")` is false (no entry written)
- `console.error` was called with a string containing the gateway's `tuyaGatewayId`

For the db mock in all three describes, the `select` call chain is two levels:

```typescript
vi.mocked(db.select).mockReturnValue({
  from: vi.fn().mockResolvedValue([/* gateway rows */]),
} as never);
```

### Success Criteria

#### Automated Verification

- `npm test` — all three worker test cases pass
- `npm run typecheck` passes
- `npm run check` passes

#### Manual Verification

- None — pure unit tests with mocked I/O

---

## Phase 3: Stale detection tests + §6.3 cookbook

### Overview

Extend `device.test.ts` with a `stale detection` suite covering the three meaningful cases. Then fill in `test-plan.md §6.3` with the worker test pattern so the cookbook is complete.

### Changes Required

#### 1. Stale detection test suite

**File**: `src/server/api/routers/device.test.ts` (extend)

**Intent**: Prove that the resolver computes `isStale` correctly from `deviceStateStore` timestamps. Three cases: fresh data is not stale, data older than the threshold is stale, and a device absent from the store is not stale.

**Contract**: Add `import { deviceStateStore } from "~/server/lib/device-state-store"` to the existing import block (the existing `vi.mock("~/server/auth", ...)` and `vi.mock("~/server/db", ...)` at the top stay unchanged — auth and db are still mocked for this file).

Add a second `describe` block after the existing auth-gate describe:

```
describe("device.overview — stale detection", () => {
  afterEach(() => deviceStateStore.clear());
  ...
});
```

Each `it` inside creates a caller with an authenticated session and a mock `db` whose chain resolves with one synthetic device row (no room):

```typescript
// Synthetic row shape:
{ device: { id: "d1", tuyaDeviceId: "tuya-d1", name: "Dev", deviceType: "sensor" }, room: null }
```

The mock db chain is four levels deep (matching `device.ts:9-16`):

```typescript
const mockDb = {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockResolvedValue([syntheticRow]),
      }),
    }),
  }),
};
const caller = createCaller({
  db: mockDb as never,
  session: { user: { id: "u1", email: "test@test.com" } } as never,
  headers: new Headers(),
});
```

Three test cases:

- `"fresh data: isStale false"` — pre-seed `deviceStateStore.set("tuya-d1", { isOnline: true, temperatureC: 21, lastPolledAt: new Date(Date.now() - 10_000) })`. Call `caller.device.overview()`. Assert the first device in the merged response has `isStale: false`.

- `"stale data: isStale true"` — pre-seed with `lastPolledAt: new Date(Date.now() - 61_000)`. Call `caller.device.overview()`. Assert `isStale: true`.

- `"never polled: isStale false, isOnline false"` — do NOT pre-seed the store (call `deviceStateStore.clear()` explicitly). Call `caller.device.overview()`. Assert `isStale: false`, `isOnline: false`, `lastPolledAt: null`.

The response shape from `device.overview` is `{ rooms: [], unassigned: [DeviceItem] }` since the synthetic row has `room: null`. Access the device via `result.unassigned[0]`.

#### 2. Update `test-plan.md §6.3`

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `§6.3 Adding a worker / polling test` placeholder with the completed cookbook entry so any contributor knows exactly how to add a new polling test.

**Contract**: Replace the current §6.3 body (one TBD line) with:

```markdown
**Reference test**: `src/server/workers/tuya-poller.test.ts`
**Run**: `npm test`

- **File location**: co-located next to the worker — `src/server/workers/<worker>.test.ts`
- **Required mocks** (Vitest hoists these before imports):
  ```ts
  vi.mock("~/server/db", () => ({ db: { select: vi.fn() } }));
  vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));
  ```
- **Store interaction**: import `deviceStateStore` from `~/server/lib/device-state-store` directly. Call `deviceStateStore.clear()` in `beforeEach` to isolate test cases. Pre-seed with `deviceStateStore.set(id, { isOnline, temperatureC, lastPolledAt })` to control starting state.
- **DB mock shape for `pollOnce`**: `db.select()` returns `{ from: vi.fn().mockResolvedValue([gatewayRows]) }` — two levels only (no `leftJoin`; gateway queries are flat).
- **Tuya client mock shape**: `vi.mocked(getTuyaClient).mockReturnValue({ fetchGatewayDevices: vi.fn().mockResolvedValue([readings]) })` for success path; `.mockRejectedValue(new Error("..."))` for the error path.
- **Oracle rule for `lastPolledAt`**: assert `Date.now() - store.get(id)!.lastPolledAt.getTime() < 1000` — do not hardcode a specific timestamp; the oracle is "timestamp is recent", relative to when the test ran.
- **Stale detection (resolver tests)**: see `src/server/api/routers/device.test.ts` `"stale detection"` describe block. Pre-seed the store with a known `lastPolledAt`, call `caller.device.overview()`, assert `isStale`. Threshold constant: `STALE_THRESHOLD_MS = 60_000` in `device.ts`.
```

### Success Criteria

#### Automated Verification

- `npm test` — all three stale detection test cases pass
- `npm run typecheck` passes
- `npm run check` passes

#### Manual Verification

- `test-plan.md §6.3` is filled in and reads as a complete cookbook entry (no TBD lines)

---

## Testing Strategy

### Unit Tests

- `src/server/workers/tuya-poller.test.ts` (new): 3 cases covering happy path + DB error + gateway error
- `src/server/api/routers/device.test.ts` (extended): 3 stale-detection cases (fresh / stale / never-polled)

### Manual Testing Steps

1. `npm run dev` — confirm overview page renders without stale badge for normally-running stub poller
2. Set `lastPolledAt` on a store entry to `new Date(Date.now() - 70_000)` in a browser console or seed script — confirm that device shows the yellow badge
3. `npm test` — all tests pass (6 existing Phase 1 tests + 6 new Phase 2–3 tests)

## Performance Considerations

`getTuyaClient()` is now called once per gateway per poll cycle instead of once per cycle. Both `stubTuyaClient` and `realTuyaClient` are singletons; the factory just returns a reference. No allocations occur — no performance impact.

## Migration Notes

No schema changes. No new tables. `isStale` is a derived field computed from `lastPolledAt` on each request — nothing to migrate.

## References

- Risk #2 and response guidance: `context/foundation/test-plan.md §2`
- Research: `context/changes/testing-polling-worker/research.md`
- Phase 1 Vitest setup and mock patterns: `context/changes/testing-bootstrap-auth-crypto/research.md §Area 6`
- Poller implementation history: `context/changes/live-device-overview/plan.md §Phase 2`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Production hardening + stale detection

#### Automated

- [x] 1.1 `npm run typecheck` passes (isStale through DeviceItem → RouterOutputs → device-card.tsx)
- [x] 1.2 `npm run check` passes

#### Manual

- [ ] 1.3 `npm run dev` starts without errors; overview page renders without stale badge for fresh data
- [ ] 1.4 Stale badge appears on a device card whose lastPolledAt is manually set >60 s ago

### Phase 2: Polling worker unit tests

#### Automated

- [ ] 2.1 `npm test` — all three worker test cases pass (happy path, DB error, gateway error)
- [ ] 2.2 `npm run typecheck` passes
- [ ] 2.3 `npm run check` passes

#### Manual

- [ ] 2.4 No manual verification for this phase

### Phase 3: Stale detection tests + §6.3 cookbook

#### Automated

- [ ] 3.1 `npm test` — all three stale detection test cases pass (fresh, stale, never-polled)
- [ ] 3.2 `npm run typecheck` passes
- [ ] 3.3 `npm run check` passes

#### Manual

- [ ] 3.4 `test-plan.md §6.3` is filled in with no TBD lines
