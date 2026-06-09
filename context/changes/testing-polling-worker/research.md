---
date: 2026-06-09T00:00:00+00:00
researcher: Claude
git_commit: 9ca6fa6762506d69cd8a55b5a5b878655a1560de
branch: main
repository: tuya-device-dashboard
topic: "Ground Phase 2 rollout: polling worker integrity + stale-state detection (Risk #2)"
tags: [research, polling-worker, stale-state, tuya, vitest, trpc, device-state-store]
status: complete
last_updated: 2026-06-09
last_updated_by: Claude
---

# Research: Phase 2 Rollout — Polling Worker Integrity

**Date**: 2026-06-09  
**Researcher**: Claude  
**Git Commit**: 9ca6fa6762506d69cd8a55b5a5b878655a1560de  
**Branch**: main  
**Repository**: tuya-device-dashboard

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`.

Risk to verify: **Risk #2** — polling worker silently dies → stale device state served as live for >30s.  
Test types: unit/integration (worker lifecycle + stale-state detection).  
Risk response guidance to verify: "tRPC resolver musi wykryć brak odświeżenia >30s; crash/restart cycle musi albo zamrozić dane z flagą stale, albo jawnie sygnalizować brak odświeżenia."

---

## Summary

**The core risk is real and confirmed: no stale-detection logic exists anywhere in the stack.**

The resolver (`device.ts`) returns `lastPolledAt` as a raw timestamp but applies no staleness threshold. If the polling worker stops updating the store (DB failure, process crash, repeated gateway errors), `isOnline: true` persists in `deviceStateStore` indefinitely — the UI shows an increasing "Updated Xs ago" counter, but the server never marks the data as stale or overrides `isOnline`. A manager watching the dashboard would not know the data is dead.

**The risk is currently latent** (stub + placeholder clients never throw), but one real client connection error per gateway would leave all of that gateway's devices showing stale-live state. The test plan's desired protection ("flag stale or signal missing refresh") does not yet exist and must be **added in Phase 2**, not merely tested.

**Key findings for the plan:**

1. `pollOnce` is not exported — testing its error path requires exporting it (small, justified change).
2. `getTuyaClient()` sits outside the per-gateway `try/catch`; if it ever throws (not currently, but possible with future refactors), the rejection is `void`-discarded and potentially unhandled in Node.js 15+ (crash risk).
3. The resolver needs a stale threshold check added (~3 lines) before Phase 2 tests can prove protection.
4. Mocking the Tuya client in tests is straightforward: `vi.mock("~/server/lib/tuya", ...)`.
5. The `device.test.ts` pattern from Phase 1 is the correct template for Phase 2 integration tests.

---

## Detailed Findings

### Area 1: `tuya-poller.ts` — actual error handling structure

**File**: `src/server/workers/tuya-poller.ts`

```typescript
async function pollOnce(): Promise<void> {
  let allGateways: ...[];
  try {
    allGateways = await db.select().from(gateways);   // L9-13: DB wrapped in own try/catch
  } catch (err) {
    console.error("[tuya-poller] DB error fetching gateways:", err);
    return;                                             // early return — store NOT updated
  }

  const client = getTuyaClient();                      // L16: OUTSIDE any try/catch ← gap

  for (const gateway of allGateways) {
    try {
      const decryptedKey = ...                         // per-gateway try/catch L18-38
      const readings = await client.fetchGatewayDevices(...)
      for (const reading of readings) {
        deviceStateStore.set(reading.tuyaDeviceId, { ...lastPolledAt: new Date() });
      }
    } catch (err) {
      console.error(`[tuya-poller] Error polling gateway ${gateway.tuyaGatewayId}:`, err);
    }
  }
}

export function startPollingLoop(): void {
  void pollOnce();                                     // L45: unhandled rejection if pollOnce throws
  setInterval(() => void pollOnce(), 30_000);         // L46: same pattern every 30s
}
```

**Error paths and their behavior:**

| Path | Behavior | Store impact |
|------|----------|--------------|
| `db.select()` throws (DB down) | Caught at L9-13; `pollOnce()` returns early | Old store values **preserved with stale `lastPolledAt`** |
| `getTuyaClient()` throws | NOT caught; `pollOnce()` rejects | `void` discards → unhandled rejection |
| `fetchGatewayDevices()` throws | Caught at L33-38; per-gateway error logged | Only that gateway's devices miss update |
| Normal success | Devices updated with fresh `lastPolledAt: new Date()` | Store is current |

**`getTuyaClient()` currently cannot throw** (`src/server/lib/tuya/index.ts:6-8`):
```typescript
export function getTuyaClient() {
  return process.env.TUYA_STUB === "true" ? stubTuyaClient : realTuyaClient;
}
```
Both `stubTuyaClient` and `realTuyaClient` return their instances without throwing. **Risk is latent** — once the real tuyapi-based client is implemented (S-04), `getTuyaClient()` itself may change, or a module import could throw, making the gap live.

**`void pollOnce()` unhandled rejection risk** (Node.js 15+ context):  
If `pollOnce()` rejects (e.g., due to a future change that makes `getTuyaClient()` throw), the `void` operator discards the Promise. Node.js 15+ emits `unhandledRejection`. Under default settings (`--unhandled-rejections=throw`), this terminates the process. Next.js in production typically has this default. The `setInterval` timer would keep firing until the process dies — creating repeated unhandled rejections on every 30s tick.

**`pollOnce` is NOT exported** — only `startPollingLoop` is exported. This is the most important testability gap. Testing the DB-error path or gateway-error path requires either:
- Exporting `pollOnce` (recommended — minimal, justified change for testability)
- Testing indirectly via `startPollingLoop` with fake timers (more complex, less targeted)

---

### Area 2: `device-state-store.ts` — no stale flag

**File**: `src/server/lib/device-state-store.ts`

```typescript
export interface DeviceState {
  isOnline: boolean;
  temperatureC: number | null;
  lastPolledAt: Date;
}

export const deviceStateStore = new Map<string, DeviceState>();
```

`lastPolledAt` is present — the resolver has the raw timestamp to compute staleness. But:
- No `isStale` flag on the interface
- No per-store-entry TTL or expiry mechanism
- No "last successful poll" timestamp separate from per-device timestamp

If the worker stops, devices polled before the crash retain their `lastPolledAt` from the last successful tick. Devices never polled (new rows added to DB after worker death) get `isOnline: false, lastPolledAt: null` from the resolver default — this is accidentally correct behavior for the never-polled case.

---

### Area 3: `device.ts` resolver — no stale-detection logic

**File**: `src/server/api/routers/device.ts:24-35`

```typescript
const state = deviceStateStore.get(row.device.tuyaDeviceId);
const item: DeviceItem = {
  ...
  isOnline: state?.isOnline ?? false,
  temperatureC: state?.temperatureC ?? null,
  lastPolledAt: state?.lastPolledAt ?? null,   // ← raw timestamp, no threshold check
};
```

**The resolver does NOT check staleness.** A device with `lastPolledAt` from 5 minutes ago still returns `isOnline: true` if that was the last known state.

**What's missing**: A stale threshold check. Three lines would close the gap:

```typescript
const STALE_THRESHOLD_MS = 30_000;
const isStale = state?.lastPolledAt
  ? Date.now() - state.lastPolledAt.getTime() > STALE_THRESHOLD_MS
  : false;
```

Then use `isStale` to either:
- Override `isOnline: isStale ? false : (state?.isOnline ?? false)`, or
- Add `isStale` as a new field on `DeviceItem` (more transparent — preferred)

The `isStale` approach is preferred: it lets the UI surface "data may be outdated" separately from the last-known online status, matching the PRD §NFR ("readings current within 30 seconds").

---

### Area 4: `instrumentation.ts` — no crash recovery

**File**: `src/instrumentation.ts`

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPollingLoop } = await import("~/server/workers/tuya-poller");
    startPollingLoop();
  }
}
```

`startPollingLoop()` is called once. There is no:
- Watchdog or restart logic
- `try/catch` around `startPollingLoop()`
- Health check that the interval is still alive

If the Next.js process stays alive but the `setInterval` callback consistently creates unhandled rejections, the behavior is environment-dependent. In containerized/managed environments (Vercel, Railway, Docker), the process would restart and `register()` would run again. In bare Node.js (`node server.js`), the process might survive with a dead poller — the store frozen at last-tick values.

**For testing purposes**: This means the testable unit is `pollOnce()` error behavior (does the store remain consistent?) and the resolver's stale detection (does it flag data that hasn't been refreshed in >30s?). The restart/watchdog mechanism is infrastructure-level and out of scope for unit/integration tests.

---

### Area 5: `stub-client.ts` — hides all failure modes

**File**: `src/server/lib/tuya/stub-client.ts` (known from plan, not re-read)

The stub client:
- Returns 5 hardcoded fixtures with 150ms artificial delay
- **Never throws**
- **Never returns an error result** for a device

This completely masks the error paths that Risk #2 is about. Any test relying on `TUYA_STUB=true` will see only the happy path. Phase 2 tests must mock `getTuyaClient()` to return a client that throws to exercise the error paths.

---

### Area 6: Existing test baseline (Phase 1 artifacts)

**Files**: `src/server/api/routers/device.test.ts`, `src/server/lib/crypto.test.ts`

The Phase 1 auth-gate test (`device.test.ts`) establishes the correct mock pattern:
```typescript
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
```

Phase 2 worker tests need a different mock shape:
- Mock `~/server/lib/tuya` to return a client that throws
- Mock `~/server/db` to return gateway rows (not `{}`) when testing `pollOnce` directly
- The `deviceStateStore` is a plain `Map` — tests can import and manipulate it directly without mocking

The `vitest.config.ts` from Phase 1 is already configured with:
- `test.environment: 'node'`
- `resolve.alias: { '~/': ... }`
- `test.setupFiles` with `ENCRYPTION_SECRET` set

---

## Code References

- `src/server/workers/tuya-poller.ts:7-47` — full `pollOnce` + `startPollingLoop`; error paths, `void` pattern
- `src/server/workers/tuya-poller.ts:16` — `getTuyaClient()` outside try/catch (latent unhandled rejection gap)
- `src/server/workers/tuya-poller.ts:44-46` — `startPollingLoop`: `void pollOnce()` + `setInterval`
- `src/server/lib/device-state-store.ts:1-7` — `DeviceState` interface; no stale flag
- `src/server/api/routers/device.ts:24-35` — resolver reads store; no staleness threshold check
- `src/server/api/routers/device.ts:33` — `isOnline: state?.isOnline ?? false` — persists stale-live state
- `src/server/api/routers/device.ts:35` — `lastPolledAt: state?.lastPolledAt ?? null` — raw timestamp, no threshold
- `src/server/lib/tuya/index.ts:6-8` — `getTuyaClient()`: currently cannot throw (returns singleton)
- `src/server/lib/tuya/real-client.ts:10-17` — placeholder; logs warning, returns `[]`, never throws
- `src/instrumentation.ts:1-6` — `register()`: no restart/watchdog logic
- `src/server/api/routers/device.test.ts:1-23` — Phase 1 mock pattern (template for Phase 2 tests)

---

## Architecture Insights

**Stale-state is the real failure mode, not crash detection.** The process doesn't need to crash for Risk #2 to manifest — a sustained DB outage or repeated gateway timeouts over 30s is enough. The correct protection is a staleness check in the resolver (cheapest, isolated), not a watchdog/restart mechanism (infrastructure-level, out of scope).

**`deviceStateStore` is the right place to observe test behavior.** It's a plain exported `Map` with no class encapsulation. Tests can:
- Pre-populate it: `deviceStateStore.set(id, { isOnline: true, temperatureC: 20, lastPolledAt: pastDate })`
- Verify it after `pollOnce()` runs
- Clear it between tests: `deviceStateStore.clear()`

This makes the store an ideal integration boundary for both worker tests and resolver tests — no complex mocking needed for the store itself.

**`pollOnce` should be exported for testability.** The function is already a clean, internally-cohesive async unit. Exporting it doesn't change production behavior; it makes error-path tests precise and targeted rather than requiring fake timers and setInterval manipulation.

**Mock shape for Tuya client in tests:**
```typescript
vi.mock("~/server/lib/tuya", () => ({
  getTuyaClient: vi.fn(),
}));

// In beforeEach or each test case:
vi.mocked(getTuyaClient).mockReturnValue({
  fetchGatewayDevices: vi.fn().mockRejectedValue(new Error("LAN timeout")),
});
```

---

## Risk Response Guidance — Corrections and Grounding

| Guidance item | Test plan statement | Correction/grounding from research |
|---|---|---|
| What would prove protection | "state store zamraża dane lub flaguje stale, nie serwuje silently-dead data jako fresh" | **Must be implemented first.** Neither store nor resolver has this today. Add `isStale` to `DeviceItem` in `device.ts`, computed from `lastPolledAt` threshold. Then test it. |
| Must challenge | "Worker działa ze stubem w dev nie implikuje odporności na prawdziwy błąd klienta" | **Confirmed true.** `stubTuyaClient` never throws; real client returns `[]`. Tests must mock `getTuyaClient()` to inject a throwing client. |
| Context needed: singleton lifecycle | "co dzieje się przy unhandled rejection w pętli pollera" | **Confirmed gap**: `void pollOnce()` discards rejections. Currently safe (clients never throw). When real client lands, `getTuyaClient()` error at L16 would be an unhandled rejection. Recommend wrapping L15-16 in the per-gateway try/catch scope, or adding a top-level catch to `pollOnce()`. |
| Context needed: resolver check | "czy resolver sprawdza timestamp ostatniego odświeżenia przed odpowiedzią" | **NO** — confirmed missing. `device.ts:25-35` reads store and returns raw `lastPolledAt` with no threshold. Phase 2 must add the check. |
| Likely cheapest layer | "Unit/integration (worker error path + stale-state detection)" | **Confirmed correct.** `pollOnce` (once exported) is unit-testable with mocked db + tuya client. Stale detection is unit-testable in the resolver by pre-seeding the store. No e2e needed. |
| Anti-pattern to avoid | "Testowanie wyłącznie happy-path startu workera" | **Confirmed risk.** With `TUYA_STUB=true`, every call succeeds. Tests must mock the client to throw. |

---

## Historical Context

- `context/changes/live-device-overview/plan.md` — established `pollOnce`'s structure: DB try/catch, per-gateway try/catch, `void pollOnce()` pattern, no stale detection described. Plan was implemented exactly as written.
- `context/changes/testing-bootstrap-auth-crypto/research.md` — Area 6 noted `deviceStateStore` is a direct Map import (useful for Phase 2 test setup); Area 4 confirmed `decryptLocalKey` is pure (relevant because it's called inside per-gateway try/catch — a decryption error is per-gateway, not a loop-killer).

---

## Open Questions

1. **`isStale` vs. `isOnline` override**: Should stale data be represented as `isStale: true` (new field, transparent) or as `isOnline: false` (overrides last-known state, simpler)? The PRD doesn't specify. Recommendation: `isStale: boolean` field — it's cheaper to add and more honest (the device may actually be online; the data is just old). `/10x-plan` should decide.

2. **Stale threshold**: 30s matches the polling interval, but should the threshold be the interval + a small buffer (e.g., 35s) to avoid false positives on the first tick? The plan's Phase 2 goal cites "30s" (from PRD §NFR). A buffer is reasonable but not mandated. `/10x-plan` should decide and encode the constant.

3. **`pollOnce` export strategy**: Export as a named export directly in `tuya-poller.ts`, or export only in a test-only barrel? Direct export is simpler. Since the function is pure business logic with no side effects other than store updates, exporting it is clean.

4. **`getTuyaClient()` outside try/catch** (`tuya-poller.ts:16`): Should this be moved inside the for-loop's try/catch (would make it per-gateway), or should `pollOnce()` have a top-level try/catch? Moving it inside the loop is the minimal fix — same client returned every iteration, but if it ever throws, it's caught per-gateway rather than blowing up the whole poll. This is a small hardening change that Phase 2 could include.
