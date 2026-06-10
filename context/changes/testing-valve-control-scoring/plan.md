# Valve Control + Threshold Scoring — Phase 3 Test Rollout Plan

## Overview

Phase 3 designs, implements, and tests two features from scratch: the `scoreRoom`
pure function (Risk #5 — badge regression) and the `device.setpoint` command
pipeline (Risk #4 — silent command failure). Both are test-first where the
interface contract is clear; the oracle for every assertion comes from PRD §FR-012,
never from the implementation under test.

## Current State Analysis

Neither feature exists in `src/`:
- `scoreRoom` — no file, no type, no badge logic anywhere.
- `device.setpoint` mutation — `deviceRouter` has only `overview`; no mutations.
- `TuyaGatewayClient` — read-only interface (`types.ts:7-13`); no `sendSetpoint`.
- `DP_CODE_MAP` — no known-codes list anywhere in `src/`.
- `DeviceState` — missing `setpointC` field (`device-state-store.ts:1-7`).
- Test infrastructure is healthy: Vitest configured, `vi.mock` hoisting pattern
  established in Phases 1 & 2 (`crypto.test.ts`, `device.test.ts`, `tuya-poller.test.ts`).

**Lessons in scope (lessons.md):**
- `localKey` columns store AES-256-GCM ciphertext — the setpoint mutation **must**
  call `decryptLocalKey()` before passing the key to tuyapi.
- `tsx` scripts using `process.env` need `--env-file=.env` — not applicable here
  (tRPC procedures run inside Next.js; env loading is handled by the framework).

**Error-swallowing anti-pattern:** `tuya-poller.ts:33-38` swallows errors silently.
FR-012 forbids this for commands. Every failure path in `device.setpoint` must
rethrow as `TRPCError` with a specific code.

## Desired End State

After Phase 3:
- `src/server/lib/scoring.ts` — `scoreRoom` pure function, fully type-exported.
- `src/server/lib/scoring.test.ts` — unit tests covering all PRD badge variants,
  null-threshold suppression, anomaly flag, and boundary values.
- `src/server/lib/tuya/dp-codes.ts` — `DP_CODE_MAP` constant.
- `TuyaGatewayClient` extended with `sendSetpoint()`; both `real-client.ts` and
  `stub-client.ts` implement the updated interface.
- `DeviceState` and `TuyaDeviceReading` extended with `setpointC: number | null`.
- `device.setpoint` protectedProcedure — DP validation + TRPCError propagation.
- `device.setpoint.test.ts` — integration tests for BAD_REQUEST, INTERNAL_SERVER_ERROR,
  UNAUTHORIZED, and success paths.
- `device.overview` returns `badge`, `anomaly`, and `suggestion` per room.
- `device.test.ts` — integration test verifies badge appears in the API response.
- `test-plan.md` §6.4 and §6.5 filled in.

## Key Discoveries

- `devices.productKey` is nullable (`schema.ts:77`) — the mutation must handle
  `null` productKey as a BAD_REQUEST (device not configured for commands).
- `devices.gatewayId` is nullable (`schema.ts:69`) — null means device not paired;
  also BAD_REQUEST.
- `gateways.localKey` stores ciphertext — must pass through `decryptLocalKey()`
  (lessons.md rule confirmed by `schema.ts:38-39`).
- `tuyapi@7.7.1` exposes `.set({ dps, set, shouldWaitForResponse })` — the
  `sendSetpoint` implementation uses this; HTTP-level ACK is NOT physical confirmation.
- `device.overview` builds rooms in a `Map`, then converts to array — scoring can
  be layered in after devices are grouped, before the return statement.
- Adding `leftJoin(roomThresholds, ...)` to the existing query would deepen the
  mock chain in `device.test.ts`. A **separate `db.select().from(roomThresholds)`
  call** inside `device.overview` avoids breaking the existing mock and is simpler
  to test in isolation.
- `stub-client.ts` FIXTURE_READINGS will need `setpointC: null` added to each
  fixture object once `TuyaDeviceReading` gains the field.

## What We're NOT Doing

- Multi-sensor aggregation — deferred. Phase 3 assumes at most one sensor per
  room. `scoreRoom` takes a single `temperatureC: number | null`.
- Hardware smoke test — deferred until S-04 DP codes are documented.
- Real DP code values for production hardware — `DP_CODE_MAP` uses synthetic
  test values; production values are a separate deliverable.
- Polling worker: writing `setpointC` from the real tuyapi response — deferred
  until DP codes are documented. The worker stores `setpointC: null` for now.
- e2e tests — excluded from MVP scope (test-plan §7).
- UI component tests for the badge — backend logic coverage is the priority (§7).

## Implementation Approach

Sub-phases ordered by cost × signal and dependency:

1. **3.1 scoreRoom unit tests** — cheapest signal for Risk #5; pure function with
   no external dependencies; oracle is PRD §FR-012 badge rule.
2. **3.2 Interface extension** — extend `TuyaGatewayClient`, add `dp-codes.ts`,
   update `DeviceState` and `TuyaDeviceReading`; no tests yet (all implementation).
3. **3.3 Command pipeline integration tests** — tests for `device.setpoint` mutation;
   Risk #4 failure paths are the priority.
4. **3.4 Wire scoreRoom** — integrate into `device.overview`; integration test
   verifies the badge propagates through the API.
5. **3.5 Cookbook update** — fill §6.4 and §6.5 in `test-plan.md`.

---

## Phase 3.1 — scoreRoom: pure function + unit tests

### Overview

Create `scoreRoom` as a pure function and cover it with unit tests whose expected
values come exclusively from PRD §FR-012 — not from inspecting the function's
output (implementation mirror anti-pattern). This is the cheapest full-signal
test for Risk #5.

### Changes Required

#### 1. Create scoring module

**File:** `src/server/lib/scoring.ts`

**Intent:** Define `RoomBadge`, `RoomScore`, and `scoreRoom`. The function is
synchronous, has no imports, and takes three arguments: a single sensor temperature
(multi-sensor aggregation deferred), the valve setpoint (may be null when unknown),
and the room threshold object.

**Contract:**

```ts
export type RoomBadge = "OK" | "Too Cold" | "Too Hot";

export interface RoomScore {
  badge: RoomBadge | null;  // null when temperatureC is null OR any threshold is null
  anomaly: boolean;          // true when temp < (setpointC - anomalyGapC); false when setpointC or anomalyGapC is null
  suggestion: string | null; // human-readable suggestion when anomaly is true; null otherwise
}

export function scoreRoom(
  temperatureC: number | null,
  valveSetpointC: number | null,
  thresholds: {
    minTempC: number | null;
    maxTempC: number | null;
    anomalyGapC: number | null;
  },
): RoomScore
```

Badge logic (verbatim from PRD §FR-012 — this is the oracle):
- If `temperatureC` is null OR any threshold is null → `badge: null`, `anomaly: false`.
- `temperatureC < minTempC` → `"Too Cold"`.
- `temperatureC > maxTempC` → `"Too Hot"`.
- Otherwise → `"OK"`.

Anomaly logic:
- If `valveSetpointC` is null OR `anomalyGapC` is null → `anomaly: false`.
- If `temperatureC < (valveSetpointC - anomalyGapC)` → `anomaly: true`.

#### 2. Create unit tests

**File:** `src/server/lib/scoring.test.ts`

**Intent:** Verify `scoreRoom` against all PRD-specified cases. Each `expect` value
is a constant derived from the PRD rule, not from calling the function first and
recording the output.

**Cases to cover (oracle = PRD §FR-012):**

| Description | temperatureC | setpointC | thresholds | Expected badge | Expected anomaly |
|---|---|---|---|---|---|
| Below min | 15 | null | min:18 max:24 gap:3 | `"Too Cold"` | false |
| Above max | 26 | null | min:18 max:24 gap:3 | `"Too Hot"` | false |
| In range | 21 | null | min:18 max:24 gap:3 | `"OK"` | false |
| At min boundary | 18 | null | min:18 max:24 gap:3 | `"OK"` | false |
| At max boundary | 24 | null | min:18 max:24 gap:3 | `"OK"` | false |
| No sensor reading | null | null | min:18 max:24 gap:3 | `null` | false |
| Null thresholds | 21 | null | min:null max:null gap:null | `null` | false |
| Partial null threshold (min null) | 21 | null | min:null max:24 gap:3 | `null` | false |
| Anomaly triggered | 15 | 20 | min:18 max:24 gap:3 | `"Too Cold"` | true (15 < 20-3=17) |
| Anomaly not triggered | 18 | 20 | min:18 max:24 gap:3 | `"OK"` | false (18 ≥ 17) |
| Anomaly suppressed (no setpoint) | 15 | null | min:18 max:24 gap:3 | `"Too Cold"` | false |
| Anomaly suppressed (null gap) | 15 | 20 | min:18 max:24 gap:null | `"Too Cold"` | false |

**Anti-pattern to avoid:** Do not call `scoreRoom(...)` and snapshot its output as
the expected value. Every expected constant must be derivable from reading the PRD
rule, not from running the code.

### Success Criteria

#### Automated Verification

- `npm test` passes — all `scoring.test.ts` cases green.
- `npm run typecheck` passes — `RoomScore`, `RoomBadge` exports are well-typed.

#### Manual Verification

- Inspect the test file: every `expect(result.badge).toBe(...)` value matches the
  corresponding PRD §FR-012 rule by inspection, not by running the function first.

**Pause here for manual confirmation before Phase 3.2.**

---

## Phase 3.2 — TuyaGatewayClient extension + dp-codes.ts

### Overview

Extend the type surface so the command pipeline can be built without TypeScript
errors. No test changes in this phase — all existing tests must still pass after
the interface extension.

### Changes Required

#### 1. Add DP code map module

**File:** `src/server/lib/tuya/dp-codes.ts` *(new)*

**Intent:** Export a `DP_CODE_MAP` constant that maps `productKey` strings to the
tuyapi DPS number for the setpoint write. Follows the `STALE_THRESHOLD_MS` pattern
for named constants (`device.ts:7`).

**Contract:** `export const DP_CODE_MAP: Record<string, number>`. Initially empty
(`{}`) — production values are a separate deliverable pending S-04 DP documentation.
Tests inject a synthetic entry (e.g., `{ "test-product-key": 2 }`) directly into
the import via `vi.mock`.

#### 2. Extend TuyaDeviceReading

**File:** `src/server/lib/tuya/types.ts`

**Intent:** Add `setpointC: number | null` to `TuyaDeviceReading` so the polling
worker can carry the valve setpoint alongside temperature. Returns `null` until DP
codes are documented and the real client is wired.

**Contract:** `TuyaDeviceReading` gains `setpointC: number | null` as a new field.

#### 3. Extend TuyaGatewayClient with sendSetpoint

**File:** `src/server/lib/tuya/types.ts`

**Intent:** Add the `sendSetpoint` method to the `TuyaGatewayClient` interface so
that both implementations must satisfy it.

**Contract:**

```ts
sendSetpoint(
  gateway: { tuyaGatewayId: string; ipAddress: string | null; localKey: string | null },
  command: { dps: number; set: number },
): Promise<void>
```

The `localKey` argument here is the **plaintext** key — callers must decrypt before
calling (lessons.md rule; handled in the mutation, not in the client method).

#### 4. Implement sendSetpoint in real-client.ts

**File:** `src/server/lib/tuya/real-client.ts`

**Intent:** Implement the new method using `tuyapi@7.7.1` `.set({ dps, set, shouldWaitForResponse: true })`. The method must throw (not swallow) any tuyapi error — callers translate to `TRPCError`.

#### 5. Implement sendSetpoint in stub-client.ts + update fixture setpointC

**File:** `src/server/lib/tuya/stub-client.ts`

**Intent:** Add a no-op `sendSetpoint` implementation that resolves immediately.
Also add `setpointC: null` to every entry in `FIXTURE_READINGS` to keep it
compatible with the updated `TuyaDeviceReading` type.

#### 6. Extend DeviceState

**File:** `src/server/lib/device-state-store.ts`

**Intent:** Add `setpointC: number | null` to `DeviceState` so `device.overview`
can read the valve's setpoint for anomaly scoring. The polling worker stores
`null` until DP codes are documented.

### Changes Required (cascading — update existing callers)

#### 7. Update polling worker to pass setpointC: null

**File:** `src/server/workers/tuya-poller.ts`

**Intent:** When mapping `TuyaDeviceReading` to `DeviceState` in the store write,
include `setpointC: reading.setpointC` (which is `null` from the current clients).
No logic change — purely satisfying the updated `DeviceState` type.

#### 8. Update device.test.ts store seeds

**File:** `src/server/api/routers/device.test.ts`

**Intent:** Each `deviceStateStore.set(id, { ... })` call in the existing stale-
detection tests must include `setpointC: null` to satisfy the updated `DeviceState`
type. No test logic changes.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes — no errors across `types.ts`, `real-client.ts`,
  `stub-client.ts`, `device-state-store.ts`, `tuya-poller.ts`, `device.test.ts`.
- `npm test` passes — all existing tests green (no regressions from type extension).

#### Manual Verification

- `real-client.ts` `sendSetpoint` implementation throws errors rather than
  swallowing them (inspect, do not run against hardware).

**Pause here for manual confirmation before Phase 3.3.**

---

## Phase 3.3 — device.setpoint mutation + integration tests (Risk #4)

### Overview

Add the `device.setpoint` protectedProcedure to `deviceRouter` and cover it with
integration tests that prove the three Risk #4 failure paths: unsupported device,
command failure, and unauthenticated access.

**Anti-pattern to avoid:** Do not assert `sendSetpoint` was called and return
success. The useful tests are the failure paths (BAD_REQUEST, INTERNAL_SERVER_ERROR).

### Changes Required

#### 1. Add device.setpoint mutation

**File:** `src/server/api/routers/device.ts`

**Intent:** Add a `protectedProcedure` mutation that validates the device's DP
code, decrypts the gateway localKey, issues the tuyapi command, and propagates
errors as `TRPCError`.

**Contract — input schema:**
```ts
z.object({ deviceId: z.string(), setpointC: z.number() })
```

**Contract — execution steps and error mapping:**

| Step | Failure condition | TRPCError code |
|---|---|---|
| Load device | Not found | `NOT_FOUND` |
| Validate productKey | `null` or not in `DP_CODE_MAP` | `BAD_REQUEST` |
| Validate gatewayId | `null` | `BAD_REQUEST` |
| Load gateway | Not found | `NOT_FOUND` |
| Decrypt localKey | `decryptLocalKey()` throws | `INTERNAL_SERVER_ERROR` |
| Send command | tuyapi rejects / times out | `INTERNAL_SERVER_ERROR` |
| Success | — | `{ success: true, setpointC }` |

`decryptLocalKey` must be called before passing `localKey` to `sendSetpoint`
(lessons.md: localKey columns store AES-256-GCM ciphertext).

#### 2. Add integration tests

**File:** `src/server/api/routers/device.setpoint.test.ts` *(new)*

**Intent:** Integration tests for the command pipeline using the `createCaller`
pattern from `device.test.ts`. Mock `~/server/auth`, `~/server/db`,
`~/server/lib/tuya`, and `~/server/lib/crypto` at the top of the file with
`vi.mock` hoisting.

**Tests to cover:**

| Test name | Setup | Assert |
|---|---|---|
| `throws UNAUTHORIZED when session null` | `session: null` | `rejects.toMatchObject({ code: "UNAUTHORIZED" })` |
| `throws BAD_REQUEST for unknown productKey` | device productKey not in mocked DP_CODE_MAP | `rejects.toMatchObject({ code: "BAD_REQUEST" })` |
| `does not call sendSetpoint on BAD_REQUEST` | same as above | `expect(sendSetpointMock).not.toHaveBeenCalled()` |
| `throws BAD_REQUEST for null productKey` | device productKey is null | `rejects.toMatchObject({ code: "BAD_REQUEST" })` |
| `throws INTERNAL_SERVER_ERROR when tuyapi rejects` | `sendSetpoint` mock `.mockRejectedValue(new Error("timeout"))` | `rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })` |
| `returns { success: true } on success` | `sendSetpoint` mock `.mockResolvedValue(undefined)` | `resolves.toMatchObject({ success: true, setpointC: 22 })` |

**Mock shape note:** `db.select()` is called twice (device lookup, then gateway lookup).
Use `vi.fn().mockReturnValueOnce(...).mockReturnValueOnce(...)` to return different
values for each call. The `~/server/lib/crypto` mock should expose `decryptLocalKey`
as a `vi.fn().mockReturnValue("plaintext-key")` so the test does not exercise crypto
logic (that is covered by Phase 1).

### Success Criteria

#### Automated Verification

- `npm test` passes — all `device.setpoint.test.ts` cases green.
- `npm run typecheck` passes.
- `npm run lint` passes.

#### Manual Verification

- The BAD_REQUEST test asserts `sendSetpoint` was NOT called — verify this assertion
  is present and meaningful (guards against implementation mirror where test only
  checks the final return without verifying the guard fired).

**Pause here for manual confirmation before Phase 3.4.**

---

## Phase 3.4 — Extend DeviceState read path + wire scoreRoom into device.overview

### Overview

Layer `scoreRoom` into the `device.overview` query response so each room object
includes `badge`, `anomaly`, and `suggestion`. Extends the existing integration
test file with one new test proving the badge propagates from the scoring function
through the API response.

### Changes Required

#### 1. Import scoreRoom in device.ts

**File:** `src/server/api/routers/device.ts`

**Intent:** Import `scoreRoom` and `RoomBadge` from `~/server/lib/scoring`.

#### 2. Query roomThresholds inside device.overview

**File:** `src/server/api/routers/device.ts`

**Intent:** After the main devices+rooms query, issue a separate
`db.select().from(roomThresholds)` to fetch all threshold rows. Build a
`Map<roomId, thresholds>` for O(1) lookup during room scoring. A separate query
(rather than a third `leftJoin`) avoids breaking the existing mock chain in
`device.test.ts`.

#### 3. Compute badge per room

**File:** `src/server/api/routers/device.ts`

**Intent:** After devices are grouped into `roomsMap`, compute `scoreRoom` for
each room:
- Find the first sensor device in the room with a non-null `temperatureC` from the
  store (single-sensor assumption — multi-sensor deferred).
- Find the first valve device in the room; read `setpointC` from `deviceStateStore`.
- Look up the room's threshold entry from the threshold map.
- Call `scoreRoom(temperatureC, valveSetpointC, thresholds ?? { minTempC: null, maxTempC: null, anomalyGapC: null })`.
- Attach `{ badge, anomaly, suggestion }` to the room object.

#### 4. Update return type for rooms

**File:** `src/server/api/routers/device.ts`

**Intent:** Add `badge: RoomBadge | null`, `anomaly: boolean`, `suggestion: string | null`
to the room object type returned by `device.overview`. `DeviceItem` also gains
`setpointC: number | null` to reflect the store.

#### 5. Add badge integration test

**File:** `src/server/api/routers/device.test.ts`

**Intent:** Add a new `describe("device.overview — room scoring", ...)` block that
verifies the badge appears in the API response with the correct value derived from
the PRD oracle.

**Contract — test setup:**
- `deviceStateStore` pre-seeded with a sensor at `temperatureC: 15, setpointC: null`
  and `lastPolledAt` fresh.
- `mockDb.select()` returns the main device+room row on the first call; returns
  `[{ roomId: "r1", minTempC: 18, maxTempC: 24, anomalyGapC: 3 }]` on the second
  call (threshold query).
- Session is authenticated.

**Contract — assertion (oracle = PRD §FR-012):**
- `result.rooms[0].badge === "Too Cold"` (15 < 18 → Too Cold).
- `result.rooms[0].anomaly === false` (setpointC null → suppressed).

**Anti-pattern to avoid:** Do not assert `badge === scoreRoom(15, null, { ... })`
— that just re-invokes the function as the oracle. Assert the literal string
`"Too Cold"` derived from the PRD rule.

### Success Criteria

#### Automated Verification

- `npm test` passes — existing stale-detection tests still green; new scoring test green.
- `npm run typecheck` passes — room type now includes `badge`, `anomaly`, `suggestion`.
- `npm run lint` passes.

#### Manual Verification

- Start the dev server; confirm the `device.overview` tRPC response in the browser
  Network tab or tRPC panel includes `badge`, `anomaly`, `suggestion` on room
  objects (may be `null` if no thresholds are configured — correct).

**Pause here for manual confirmation before Phase 3.5.**

---

## Phase 3.5 — §6 cookbook update

### Overview

Fill in the `test-plan.md` §6.4 (command pipeline test pattern) and §6.5 (business
logic unit test pattern) placeholders with the patterns that shipped in Phases 3.1–3.4.

### Changes Required

#### 1. Fill §6.4 — command pipeline test pattern

**File:** `context/foundation/test-plan.md`

**Intent:** Replace the `TBD — see §3 Phase 3` placeholder in §6.4 with the
concrete pattern established by `device.setpoint.test.ts`:
- File location convention.
- Required `vi.mock` declarations (auth, db, tuya, crypto).
- The `mockReturnValueOnce` pattern for multi-call `db.select()`.
- The `sendSetpoint` spy pattern (`vi.fn().mockResolvedValue(undefined)` vs
  `.mockRejectedValue(new Error(...))`).
- Anti-pattern warning: always test the failure paths; BAD_REQUEST test must
  assert `sendSetpoint` was NOT called.

#### 2. Fill §6.5 — business logic unit test pattern

**File:** `context/foundation/test-plan.md`

**Intent:** Replace the `TBD — see §3 Phase 3` placeholder in §6.5 with the
pattern established by `scoring.test.ts`:
- File location: co-located with the module (`src/server/lib/<module>.test.ts`).
- No mocks needed for pure functions.
- Oracle rule: expected values must be derivable from the PRD rule, never from
  inspecting the function's current output (implementation mirror anti-pattern).
- Edge-case checklist: null inputs, boundary values, suppression paths.

### Success Criteria

#### Automated Verification

- `npm test` passes (no regressions from `test-plan.md` edits).

#### Manual Verification

- §6.4 and §6.5 are no longer placeholder stubs — each contains a reference test,
  file location rule, mock pattern, and anti-pattern warning.
- Read the completed §6.4 and §6.5 in isolation; a developer who hasn't seen this
  plan should be able to add a new command pipeline test or business logic test
  from the cookbook alone.

---

## Testing Strategy

### Unit Tests

- `src/server/lib/scoring.test.ts` — 12 cases covering all PRD badge variants,
  null suppression, anomaly flag, and boundaries. Oracle: PRD §FR-012.

### Integration Tests

- `src/server/api/routers/device.setpoint.test.ts` — 6 cases covering UNAUTHORIZED,
  BAD_REQUEST (unknown DP / null productKey), INTERNAL_SERVER_ERROR (tuyapi reject),
  and success. Mocks: auth, db (two-call pattern), tuya client, crypto.
- `src/server/api/routers/device.test.ts` (extended) — 1 new case: room badge
  propagates through `device.overview` API response. Oracle: PRD §FR-012 "Too Cold"
  at `temperatureC: 15, minTempC: 18`.

### Manual Testing

1. Start dev server: `npm run dev`.
2. Navigate to the device overview page; confirm rooms show badge (if thresholds
   are configured) or `null` badge (if no thresholds).
3. Check Network tab for `device.overview` response: rooms should include `badge`,
   `anomaly`, `suggestion` fields.
4. Confirm `device.setpoint` mutation exists in tRPC panel; call with an unknown
   deviceId → should return TRPCError (NOT_FOUND or BAD_REQUEST).

## References

- Research: `context/changes/testing-valve-control-scoring/research.md`
- Risk #4 response guidance: `context/foundation/test-plan.md` §2 row #4
- Risk #5 response guidance: `context/foundation/test-plan.md` §2 row #5
- PRD scoring rule: `context/foundation/prd.md:128-134`
- Error propagation path: `src/server/api/trpc.ts:46-55`
- Error swallow anti-pattern: `src/server/workers/tuya-poller.ts:33-38`
- decryptLocalKey lesson: `context/foundation/lessons.md` — localKey rule
- tuyapi `.set()` type: `node_modules/tuyapi/index.d.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 3.1: scoreRoom pure function + unit tests

#### Automated

- [x] 3.1.1 `npm test` passes — all `scoring.test.ts` cases green — 5600a41
- [x] 3.1.2 `npm run typecheck` passes — `RoomScore`, `RoomBadge` exports well-typed — 5600a41

#### Manual

- [x] 3.1.3 Inspect test file: each `expect` value matches PRD §FR-012 by reading (not by running) — 5600a41

### Phase 3.2: TuyaGatewayClient extension + dp-codes.ts

#### Automated

- [x] 3.2.1 `npm run typecheck` passes across `types.ts`, `real-client.ts`, `stub-client.ts`, `device-state-store.ts`, `tuya-poller.ts`, `device.test.ts`
- [x] 3.2.2 `npm test` passes — all existing tests green (no regressions)

#### Manual

- [x] 3.2.3 `real-client.ts` `sendSetpoint` throws on tuyapi errors (inspect — do not run against hardware)

### Phase 3.3: device.setpoint mutation + integration tests (Risk #4)

#### Automated

- [ ] 3.3.1 `npm test` passes — all `device.setpoint.test.ts` cases green
- [ ] 3.3.2 `npm run typecheck` passes
- [ ] 3.3.3 `npm run lint` passes

#### Manual

- [ ] 3.3.4 BAD_REQUEST test asserts `sendSetpoint` NOT called — verify assertion is present and meaningful

### Phase 3.4: Extend DeviceState read path + wire scoreRoom

#### Automated

- [ ] 3.4.1 `npm test` passes — stale-detection tests still green; new scoring test green
- [ ] 3.4.2 `npm run typecheck` passes — room type includes `badge`, `anomaly`, `suggestion`
- [ ] 3.4.3 `npm run lint` passes

#### Manual

- [ ] 3.4.4 Dev server: `device.overview` response in Network tab includes `badge`, `anomaly`, `suggestion` on room objects

### Phase 3.5: §6 cookbook update

#### Automated

- [ ] 3.5.1 `npm test` passes — no regressions

#### Manual

- [ ] 3.5.2 §6.4 and §6.5 are no longer placeholder stubs — contain reference test, file location, mock pattern, and anti-pattern warning
- [ ] 3.5.3 §6.4 and §6.5 are self-contained: a developer unfamiliar with this plan can add a new test from the cookbook alone
