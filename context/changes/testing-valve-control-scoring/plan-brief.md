# Valve Control + Threshold Scoring — Plan Brief

> Full plan: `context/changes/testing-valve-control-scoring/plan.md`
> Research: `context/changes/testing-valve-control-scoring/research.md`

## What & Why

Phase 3 builds and tests two features that do not yet exist: `scoreRoom` (room badge
computation) and `device.setpoint` (valve command pipeline). Risk #5 is that the
scoring function ships with wrong boundary logic or a silent null-threshold bug;
Risk #4 is that a failed command swallows the error instead of surfacing it to the
user. Both are test-first: the oracle for every assertion comes from PRD §FR-012.

## Starting Point

`deviceRouter` has only the `overview` read query. `TuyaGatewayClient` is read-only.
`scoreRoom` and `DP_CODE_MAP` do not exist anywhere in `src/`. `DeviceState` has no
`setpointC` field. Vitest + `vi.mock` hoisting patterns are established from Phases 1 & 2.

## Desired End State

After Phase 3: `scoreRoom` is a tested pure function; `device.setpoint` is a tested
tRPC mutation that rejects unsupported devices with `BAD_REQUEST` and command failures
with `INTERNAL_SERVER_ERROR` (never silence); `device.overview` returns a `badge`,
`anomaly`, and `suggestion` per room, verified by an integration test; §6.4 and §6.5
cookbook entries are filled.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Multi-sensor aggregation | Deferred — single sensor per room in Phase 3 | Roadmap requires explicit sign-off; worst-case aggregation is the safe default but can't ship without confirmation | Plan (user decision) |
| Null threshold behavior | Suppress scoring — `badge: null` | Explicit "not configured" state; no magic constants; admin must configure thresholds before feature is active | Plan (user decision) |
| Setpoint source for anomaly | Extend `DeviceState.setpointC`; stub `null` in Phase 3 | Consistent store; real DP read deferred until S-04 codes documented | Plan (user decision) |
| `DP_CODE_MAP` location | `src/server/lib/tuya/dp-codes.ts` constant | Matches `STALE_THRESHOLD_MS` pattern; easily `vi.mock`ed; simpler than env-driven config for v1 | Plan (user decision) |
| Wire scoreRoom into `device.overview` | Yes — ships in Phase 3 | Risk #5 is only end-to-end proven when the badge appears in the API response | Plan (user decision) |
| Threshold query strategy | Separate `db.select().from(roomThresholds)` | Avoids breaking existing two-`leftJoin` mock chain in `device.test.ts` | Research |
| `sendSetpoint` error handling | Rethrow as `TRPCError` — never swallow | FR-012 requirement; explicitly contrasts with error-swallow anti-pattern in `tuya-poller.ts:33-38` | Research |
| `localKey` decryption | Mutation caller decrypts before passing to `sendSetpoint` | lessons.md rule: localKey columns store AES-256-GCM ciphertext | lessons.md |

## Scope

**In scope:**
- `scoreRoom` pure function + unit tests (12 cases from PRD oracle)
- `TuyaGatewayClient.sendSetpoint()` interface + both client implementations
- `dp-codes.ts` module with `DP_CODE_MAP`
- `device.setpoint` protectedProcedure + integration tests (3 error paths + success)
- `DeviceState.setpointC` field + polling worker cascade update
- `device.overview` badge computation + 1 integration test
- §6.4 and §6.5 cookbook patterns filled

**Out of scope:**
- Multi-sensor aggregation
- Real DP code values for production hardware (pending S-04 blocker)
- Hardware smoke test (deferred until DP codes documented)
- Polling worker actually reading `setpointC` from tuyapi (null stub only)
- e2e / UI component tests (§7 exclusions)

## Architecture / Approach

`scoreRoom` is a pure function: `(temperatureC, valveSetpointC, thresholds) → RoomScore`.
`device.setpoint` is a tRPC mutation that: loads the device from DB → looks up `DP_CODE_MAP`
→ decrypts `localKey` → calls `tuyaClient.sendSetpoint()` → translates any error to `TRPCError`.
`device.overview` calls `scoreRoom` after grouping devices by room (data from `deviceStateStore`)
and after a separate threshold query (to avoid breaking the existing mock chain).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 3.1 scoreRoom unit tests | Pure function + 12 PRD-oracle test cases | Implementation mirror: asserting function output instead of PRD constant |
| 3.2 Interface extension | `dp-codes.ts`, `sendSetpoint()` on both clients, `setpointC` in `DeviceState` | TypeScript cascade — existing tests must still pass after type extension |
| 3.3 Command pipeline integration | `device.setpoint` mutation + 6 integration tests | Skipping failure paths; asserting HTTP 200 = valve moved |
| 3.4 Wire scoreRoom | Badge in `device.overview` API response + 1 integration test | Breaking the existing stale-detection mock with a new DB call |
| 3.5 Cookbook update | §6.4 and §6.5 filled | Placeholder text remaining after phase completes |

**Prerequisites:** Phase 3.2 must complete before 3.3 (mutation depends on `DP_CODE_MAP` and `sendSetpoint` types). All other phases are sequential.

**Estimated effort:** ~3–4 sessions across 5 sub-phases.

## Open Risks & Assumptions

- `setpointC` is `null` for all devices in Phase 3 — anomaly detection logic exists
  but will never trigger until DP codes are documented and the real client is wired.
- The `mockReturnValueOnce` chain for the two-call `db.select()` pattern in the
  mutation test assumes the device query always fires before the gateway query —
  this is enforced by the mutation's control flow but is implicit.
- Multi-sensor aggregation is explicitly deferred; a room with two sensors will use
  only the first one's reading until aggregation ships.

## Success Criteria (Summary)

- `npm test` green across all new and existing test files after Phase 3.4.
- `device.overview` returns `badge: "Too Cold"` for a room whose sensor reads below
  `minTempC` (verified by integration test with PRD oracle value, not by calling `scoreRoom`).
- `device.setpoint` with an unknown `productKey` returns `TRPCError.code === "BAD_REQUEST"`
  AND `sendSetpoint` was NOT called.
