---
date: 2026-06-09T14:01:36+00:00
researcher: Claude Sonnet 4.6
git_commit: 52601e49f0a6980613955c642172f7c62a0ee174
branch: main
repository: tuya-device-dashboard
topic: "Phase 3 rollout — valve command pipeline (Risk #4) and room threshold scoring (Risk #5)"
tags: [research, testing, valve-control, scoring, trpc, tuyapi, risk4, risk5]
status: complete
last_updated: 2026-06-09
last_updated_by: Claude Sonnet 4.6
---

# Research: Phase 3 — Valve Control + Threshold Scoring Tests

**Date**: 2026-06-09T14:01:36+00:00
**Researcher**: Claude Sonnet 4.6
**Git Commit**: 52601e49f0a6980613955c642172f7c62a0ee174
**Branch**: main
**Repository**: tuya-device-dashboard

---

## Research Question

Ground rollout Phase 3 of `context/foundation/test-plan.md`.

Risks to verify:
- **Risk #4** — Valve command sent to wrong DP code or without confirmation → valve stuck, user sees no error
- **Risk #5** — Room threshold scoring produces wrong badge or missing alert → manager misses Too Cold / Too Hot

---

## Summary

**Neither the valve command pipeline nor the room scoring function exists yet.**
Both S-04 (valve control) and S-05 (room health) are unimplemented; S-04 is explicitly `blocked`
on DP code documentation; S-05 is `proposed`. Phase 3 must therefore **design + implement + test**
both features together — not test against existing code.

The data model is complete and can be used as the oracle for both sets of tests. The tRPC
infrastructure (auth, error formatting, stale-detection pattern) is solid and provides the
right mounting points. The critical anti-pattern to avoid is the error-swallowing `catch` block
in the polling worker (`tuya-poller.ts:33-38`): that pattern must NOT be copied for commands.

---

## Detailed Findings

### Risk #4 — Command Pipeline: what exists and what does not

#### TuyaGatewayClient interface — read-only, no command method

`src/server/lib/tuya/types.ts:7-13` defines the client contract:

```ts
export interface TuyaGatewayClient {
  fetchGatewayDevices(gateway: {
    tuyaGatewayId: string;
    ipAddress: string | null;
    localKey: string | null;
  }): Promise<TuyaDeviceReading[]>;
}
```

There is **no `sendCommand`, `setDps`, or `setSetpoint` method**. Both
`real-client.ts` (placeholder implementation with `console.warn`) and
`stub-client.ts` (fixture reads only) implement only this interface.

GitHub: https://github.com/karolpaniewski/tuya-device-dashboard/blob/52601e49f0a6980613955c642172f7c62a0ee174/src/server/lib/tuya/types.ts#L7-L13

#### Device router — only one query, no mutations

`src/server/api/routers/device.ts:9-65` contains a single `protectedProcedure`:
`device.overview` — a read query. No mutations exist. The API root
(`src/server/api/root.ts:1-10`) registers only `deviceRouter`; no other routers.

GitHub: https://github.com/karolpaniewski/tuya-device-dashboard/blob/52601e49f0a6980613955c642172f7c62a0ee174/src/server/api/routers/device.ts#L9-L65

#### tuyapi is installed; `.set()` is available but unused

`package.json` has `"tuyapi": "^7.7.1"`. The type definitions expose:

```ts
// node_modules/tuyapi/index.d.ts
interface SingleSetOptions {
  dps: number;                        // DP code (datapoint number)
  set: string | number | boolean;     // Value to set
  shouldWaitForResponse?: boolean;    // true = wait for network ACK
}
set(options: SingleSetOptions | MultipleSetOptions): Promise<DPSObject>;
```

`shouldWaitForResponse: true` waits for a network-level ACK from the device.
**This is NOT physical confirmation.** The valve may ACK the packet and still
fail to move. HTTP 200 from the tRPC call does not mean the setpoint was applied.

#### Error-swallowing anti-pattern — do NOT copy

`src/server/workers/tuya-poller.ts:33-38`:

```ts
} catch (err) {
  console.error(
    `[tuya-poller] Error polling gateway ${gateway.tuyaGatewayId}:`,
    err,
  );
}
```

Errors are consumed; the UI sees nothing. FR-012 forbids this pattern for commands.
The command mutation **must** rethrow as `TRPCError` with a specific code.

GitHub: https://github.com/karolpaniewski/tuya-device-dashboard/blob/52601e49f0a6980613955c642172f7c62a0ee174/src/server/workers/tuya-poller.ts#L33-L38

#### tRPC error formatter — will work for commands

`src/server/api/trpc.ts:46-55` formats errors and passes them to the client.
Any `TRPCError` thrown from a `protectedProcedure` will reach the UI with its
`code` and `message`. No new infrastructure is needed for error propagation —
only the mutation that throws correctly.

GitHub: https://github.com/karolpaniewski/tuya-device-dashboard/blob/52601e49f0a6980613955c642172f7c62a0ee174/src/server/api/trpc.ts#L46-L55

#### S-04 roadmap status: `blocked`

The roadmap marks S-04 (`valve-setpoint-control`) as `blocked` on DP code
documentation: *"Supported Tuya DP code mappings for the specific heating valve
models in use must be documented before control can be implemented."*

**Plan implication:** Phase 3 can implement and test the command pipeline
using a configurable DP code map (keyed by `productKey`); the actual DP code
values for production hardware are supplied as configuration, not hardcoded.
Tests use test-double DP values. Hardware smoke is explicitly deferred until
S-04's blocker is resolved (test plan §3 Phase 3 already notes "smoke z hardware").

#### DP code validation: does not exist anywhere

A search across `src/` for `dp`, `dps`, `unsupported`, `productKey` validation
returns zero results outside of tests and the tuyapi type file. There is no
known-codes list, no guard, no `"unsupported"` flag anywhere in the codebase.
This entire surface must be designed and built in Phase 3.

---

### Risk #5 — Room Scoring: what exists and what does not

#### `scoreRoom` function — does not exist

No file in `src/` contains `scoreRoom`, `roomScore`, `healthScore`, `badge`,
`Too Cold`, or `Too Hot`. The function must be created from scratch.

#### Data model — complete and usable as oracle

`src/server/db/schema.ts` has all the tables needed:

| Table | Key columns | Lines |
|-------|-------------|-------|
| `rooms` | `id`, `name` | 47–58 |
| `devices` | `id`, `deviceType CHECK('sensor','valve','plug')`, `tuyaDeviceId` | 60–91 |
| `deviceRoomAssignments` | `deviceId UNIQUE → rooms.id` (one device, one room max) | 93–115 |
| `roomThresholds` | `roomId UNIQUE`, `minTempC REAL`, `maxTempC REAL`, `anomalyGapC REAL` — all nullable | 117–144 |

DB CHECK constraint on `roomThresholds`:
```sql
minTempC IS NULL OR maxTempC IS NULL OR minTempC < maxTempC
```
This is a DB-level invariant; the scoring function can trust the ordering.

GitHub: https://github.com/karolpaniewski/tuya-device-dashboard/blob/52601e49f0a6980613955c642172f7c62a0ee174/src/server/db/schema.ts#L117-L144

#### DeviceState — the live temperature source

`src/server/lib/device-state-store.ts:1-7`:

```ts
export interface DeviceState {
  isOnline: boolean;
  temperatureC: number | null;
  lastPolledAt: Date;
}
```

Sensors are devices of `deviceType = 'sensor'` assigned to rooms via
`deviceRoomAssignments`. The in-memory `deviceStateStore` holds their live
`temperatureC`. The scoring function receives sensor readings already hydrated —
no DB access required inside `scoreRoom` itself.

#### device.overview — joins rooms+devices but has no scoring

`src/server/api/routers/device.ts:10-64` groups devices by room, includes
`temperatureC` and `isStale`, but performs no threshold comparison, badge
computation, or anomaly detection. This is where scoring can be layered in
during S-05 implementation.

GitHub: https://github.com/karolpaniewski/tuya-device-dashboard/blob/52601e49f0a6980613955c642172f7c62a0ee174/src/server/api/routers/device.ts#L10-L64

#### PRD scoring rule — the test oracle

From `context/foundation/prd.md:128-134` (verbatim):

> The rule consumes three user-visible inputs: the current temperature reading
> from sensors in each room; the current setpoint configured on each heating
> valve; and the per-room comfort thresholds (minimum and maximum acceptable
> temperature) set by an admin through the dashboard.
>
> The rule produces: a status badge per room (OK / Too Cold / Too Hot); alert
> flags on devices whose temperature violates their room's threshold; a suggested
> action when a room falls below its setpoint (e.g. "Room 3 is 2°C below
> setpoint — consider raising valve to 22°C"); and an anomaly flag when the
> current temperature is more than a configured gap below the valve's setpoint.
> In v1, anomaly detection is live-state only — if current temp < (setpoint −
> configured gap threshold), the room is flagged. No time-based drift tracking.

Badge logic (inferred from PRD, not from code — the oracle):
- `temp < minTempC` → `"Too Cold"`
- `temp > maxTempC` → `"Too Hot"`
- `minTempC ≤ temp ≤ maxTempC` → `"OK"`
- No sensors assigned → `null` (no badge, not an error state)
- Anomaly condition: `temp < (setpoint − anomalyGapC)` → anomaly flag

#### Multi-sensor aggregation — explicitly undefined, safe default confirmed

PRD leaves this open. `context/foundation/roadmap.md:151-152`:

> When a room has multiple temperature sensors, the Business Logic rule needs a
> defined aggregation strategy (minimum reading, average, or worst-case).
> PRD does not specify — Owner: user. Block: no (safe default is
> minimum/worst-case; confirm before S-05 ships).

**Plan must include a user confirmation step for this decision before
implementation.** The safe default is the minimum reading (worst-case for
"Too Cold" direction; for "Too Hot" the max reading is worst-case — so strictly
speaking "worst-case" means: min for cold comparison, max for hot comparison).

#### Null threshold behavior — not yet specified

The schema notes that `NULL` means "use app-level fallback constant" (from
`device-schema/plan.md`). However, no such constant is defined anywhere in
`src/`. Phase 3 must either define the fallback or document that scoring is
suppressed when thresholds are null.

---

## Code References

| Symbol | File:Line | Description |
|--------|-----------|-------------|
| `TuyaGatewayClient` | `src/server/lib/tuya/types.ts:7-13` | Interface to extend with a command method |
| `real-client.ts` | `src/server/lib/tuya/real-client.ts:1-17` | Stub placeholder; where `.set()` call will live |
| `device.overview` | `src/server/api/routers/device.ts:9-65` | Only router procedure; command mutation goes here |
| `STALE_THRESHOLD_MS` | `src/server/api/routers/device.ts:7` | Pattern for named constants; follow for DP codes |
| Error swallow | `src/server/workers/tuya-poller.ts:33-38` | **Anti-pattern** — do not copy for commands |
| `errorFormatter` | `src/server/api/trpc.ts:46-55` | Available error propagation — use TRPCError |
| `roomThresholds` | `src/server/db/schema.ts:117-144` | Complete schema; all threshold columns nullable |
| `deviceRoomAssignments` | `src/server/db/schema.ts:93-115` | UNIQUE on deviceId; one device = one room |
| `DeviceState` | `src/server/lib/device-state-store.ts:1-7` | Live temp source for scoring |
| `DeviceItem` | `src/server/api/routers/device.ts:67-78` | Shape of grouped room output to extend |

---

## Architecture Insights

### Minimum viable design for Risk #4 (command pipeline)

```
device.setpoint mutation (protectedProcedure)
  input: { deviceId: z.string(), setpointC: z.number() }
  1. load device from DB → get productKey, gatewayId
  2. look up DP code for productKey in a DP_CODE_MAP constant
     → if not found: throw TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_DEVICE" })
  3. decrypt localKey via decryptLocalKey() (existing helper)
  4. call tuyaClient.sendSetpoint(gateway, { dps: dpCode, set: setpointC })
     → on timeout / nack: throw TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "COMMAND_FAILED" })
  5. return { success: true, setpointC }
```

Test surface for integration tests:
- Mock `getTuyaClient` → return `{ sendSetpoint: vi.fn() }`
- Mock `db` for device lookup
- Test: unknown productKey → `TRPCError.code === "BAD_REQUEST"`
- Test: tuyapi rejects → `TRPCError.code === "INTERNAL_SERVER_ERROR"`
- Test: success path → `{ success: true }` (does NOT assert hardware changed)

### Minimum viable design for Risk #5 (scoreRoom)

```ts
// src/server/lib/scoring.ts — pure function, no DB, no async
export type RoomBadge = "OK" | "Too Cold" | "Too Hot";

export interface RoomScore {
  badge: RoomBadge | null;   // null = no sensors
  anomaly: boolean;
  suggestion: string | null;
}

export function scoreRoom(
  sensorTemps: (number | null)[],   // from deviceStateStore for sensors in room
  valveSetpointC: number | null,    // from valve device state, if any
  thresholds: {
    minTempC: number | null;
    maxTempC: number | null;
    anomalyGapC: number | null;
  },
): RoomScore
```

Multi-sensor aggregation: apply min() for "Too Cold" comparison, max() for
"Too Hot" comparison (worst-case in both directions). **Confirm with user
before coding** — roadmap requires explicit sign-off.

---

## Historical Context (from prior changes)

No archived slices exist (`context/archive/` contains only a README). All slices
live in `context/changes/`. The relevant prior work:

- `context/changes/device-schema/plan.md` — established `roomThresholds` schema,
  the `NULL = use fallback` convention, and the `deviceType CHECK` constraint.
  The missing fallback constant is a known gap from that slice.
- `context/changes/live-device-overview/` — established `deviceStateStore`,
  the polling worker, and the error-swallowing catch pattern. The catch
  pattern was acceptable for polling (state goes stale naturally); it is
  explicitly forbidden for commands (FR-012).
- `context/changes/testing-bootstrap-auth-crypto/` — Vitest config, test setup,
  crypto unit-test oracle pattern, tRPC auth integration test pattern.
- `context/changes/testing-polling-worker/` — worker lifecycle test pattern,
  store isolation via `deviceStateStore.clear()`, stale-detection test.

---

## Risk Validation: Speculative Risk Check

**Risk #4**: Not speculative. The failure mode (silent valve control error) is
real and will occur if the command pipeline is implemented without DP validation
and without error propagation. The feature doesn't exist yet, but the risk is
the design constraint for Phase 3.

**Risk #5**: Not speculative. The failure mode (wrong badge from broken scoring)
is real and will occur if `scoreRoom` is implemented with wrong boundary logic
or wrong multi-sensor aggregation. Implementation mirror is the specific
anti-pattern to avoid — assertions must use PRD oracle values, not the
function's own output.

---

## Open Questions

1. **DP code values for production hardware**: Which `productKey` values are in
   use, and what `dps` number maps to setpoint on those models? This is the S-04
   blocker. Phase 3 can proceed with a configurable `DP_CODE_MAP` and synthetic
   test values; production values are a separate deliverable.

2. **Multi-sensor aggregation confirmation**: Roadmap recommends min/worst-case
   and requires explicit user sign-off before S-05 ships. `/10x-plan` must
   surface this as a decision point with a brief to the user before
   implementation begins.

3. **Null threshold fallback constant**: Schema says `NULL = use app-level
   fallback constant` but no such constant is defined. Phase 3 must define it
   (or decide scoring is suppressed when thresholds are null).

4. **Valve setpoint source for anomaly detection**: The `device.overview`
   procedure returns `temperatureC` from `deviceStateStore` but does not expose
   the valve's current setpoint. The setpoint is a live device state value —
   the polling worker must be extended to store `setpointC` alongside
   `temperatureC`, or the scoring must query the valve separately.

---

## Post-Research Backport Assessment

No §2 edits required. Both risks are validated as written:
- Risk #4 source citations (interview Q1, PRD §FR-011/FR-012) accurately reflect
  the risk origin. The "context to ground" guidance correctly identifies the
  failure path — the research confirms the path must be designed, not just
  located, which is within scope for `/10x-plan`.
- Risk #5 source citations and response guidance are accurate. The multi-sensor
  aggregation open question is confirmed, and the safe default (worst-case) is
  grounded in roadmap text.
