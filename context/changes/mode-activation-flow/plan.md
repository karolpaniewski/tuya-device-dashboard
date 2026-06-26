# Mode Activation Flow — Test Coverage & Type Safety Implementation Plan

## Overview

The research audit of the mode-trigger chain (`mode.trigger` → `applyModeToRooms` → `sendValveStateCommand`) identified three concrete gaps: zero cross-layer integration tests, five untested error branches in `sendValveStateCommand`, and a hand-written `ModeSummary` type in `mode-manager.tsx` that drifts silently from the router contract. This plan closes all three without changing any production logic.

## Current State Analysis

Every layer boundary in the mode trigger chain is mocked in isolation. Five unit-test files exist, each one mocking the layer below it — so a same-type argument swap (e.g. `(deviceId, isOpen)` → `(isOpen, deviceId)`) would pass all tests undetected. `sendValveStateCommand` has 8 branches; 3 are covered, 5 are not. `mode-manager.tsx` exports `ModeSummary` as a hand-written interface rather than deriving it from `RouterOutputs["mode"]["list"][number]` — compiler misses schema drift. None of this affects runtime behaviour today; all three items are latent risk.

## Desired End State

- One integration test runs `mode.trigger` end-to-end through a real SQLite DB and the stub Tuya client, asserting both the tRPC return value and the persisted activation log row.
- `sendValveStateCommand` has 8/8 branches covered in `valve-control.test.ts`.
- `mode-manager.tsx`'s `ModeSummary` export is derived from `RouterOutputs`, so any future schema change to `mode.list` breaks the compiler immediately rather than silently diverging.
- `npm run typecheck`, `npm test`, and `npm run lint` all pass.

### Key Discoveries

- `src/test/setup.ts` sets `DATABASE_URL = "file:test.db"` for all tests, but does NOT run migrations — `test.db` won't have the schema on a fresh checkout. A `globalSetup` step is required.
- `src/test/setup.ts` does NOT set `TUYA_STUB`. The stub client is selected at call-time (`process.env.TUYA_STUB === "true"` inside `getTuyaClient()`), so adding it to `setup.ts` is safe and sufficient.
- `createCaller` (from `~/server/api/root`) accepts `{ db, session, headers }`. Passing the real `db` singleton makes both `ctx.db` (used inside `mode.trigger`) and the global `db` (used inside `applyModeToRooms` and `sendValveStateCommand`) point to the same `test.db` connection.
- `VALVE_STATE_DP_CODE_MAP` in `dp-codes.ts` has one real entry: `ogx8u5z6: 3`. The seed device's `productKey` must be `"ogx8u5z6"` for the happy path to reach `sendValveStateCommand` without UNSUPPORTED_DEVICE.
- `gateway.localKey` must be AES-256-GCM ciphertext produced by `encryptLocalKey` from `~/server/lib/crypto`. `ENCRYPTION_SECRET` is already set to `"0".repeat(64)` in `setup.ts`, so `encryptLocalKey("any-string")` produces a valid ciphertext for the test.
- `roomHeatState` has no row for a freshly-seeded room → `heatState?.pinnedOff` is falsy → room is not skipped (correct for happy path).
- `drizzle-orm` v0.45.2 ships `drizzle-orm/libsql/migrator`. The `migrate(db, { migrationsFolder })` call is idempotent.
- The integration test is this project's first real-DB test. No existing test produces or consumes `test.db` (all current tests mock `~/server/db`).

## What We're NOT Doing

- No production code changes — only tests and one type alias.
- No Playwright / E2E tests for this flow (that is a separate `/10x-e2e` concern).
- No tie-break DB ordering assertion (requires a real multi-row concurrent write, out of scope).
- No test for the scheduler path (`runModeTick`) — the integration test covers the shared convergence point (`applyModeToRooms`), which is identical for both paths.
- No new test file for `sendValveStateCommand` branches — they extend the existing `valve-control.test.ts`.

## Implementation Approach

Four sequential phases: infra first (Phase 1), then the integration test that depends on it (Phase 2), then the independent branch tests (Phase 3), then the type fix (Phase 4). Phases 3 and 4 can be done in any order after Phase 1 is merged.

## Critical Implementation Details

**Seed FK ordering**: the integration test must insert rows in dependency order: `sites` → `gateways` → `rooms` → `devices` → `deviceRoomAssignments` → `automationModes` → `automationModeTargets`. Cleanup in `afterEach` must delete in reverse order (or cascade deletion handles it — `automationModeActivationLogs` has `modeId` FK with `onDelete: cascade`, so deleting `automationModes` clears logs automatically; `deviceRoomAssignments` has `deviceId` FK with `onDelete: cascade`, so deleting `devices` clears assignments).

**globalSetup vs setupFiles**: `vitest.config.ts`'s `globalSetup` runs once in the main process before any workers spawn. `setupFiles` runs inside each worker before each test file. The migration must go in `globalSetup` (not `setupFiles`) so it runs exactly once and completes before any test file's module graph is resolved.

**`TUYA_STUB` timing**: `getTuyaClient()` reads `process.env.TUYA_STUB` at call-time (not at module load time), so setting it in `setupFiles` is sufficient — it will be set before any test body runs.

---

## Phase 1: Test Infrastructure — Migration + TUYA_STUB

### Overview

Wire `test.db` schema migration and set `TUYA_STUB=true` so the integration test in Phase 2 can run against a real SQLite DB with the stub Tuya client.

### Changes Required

#### 1. TUYA_STUB in test environment

**File**: `src/test/setup.ts`

**Intent**: Add `TUYA_STUB=true` so `getTuyaClient()` returns the stub client in all tests that don't override it.

**Contract**: Append `process.env.TUYA_STUB = "true";` to the existing env-var block. Existing tests that mock `getTuyaClient` via `vi.mock("~/server/lib/tuya", ...)` are unaffected — their mock replaces the function entirely.

---

#### 2. Global setup — migrate test.db

**File**: `src/test/global-setup.ts` (new)

**Intent**: Run Drizzle migrations against `test.db` once before the test suite starts. Makes the integration test hermetic on a fresh checkout or CI.

**Contract**: Export a named `setup()` async function (Vitest globalSetup lifecycle hook). Inside: set `process.env.DATABASE_URL` if not already set, create a libsql client pointing at `test.db`, obtain a drizzle instance, and call `migrate(db, { migrationsFolder: "./drizzle" })`. Import `migrate` from `drizzle-orm/libsql/migrator`. This db instance is created locally in this file — do NOT import `~/server/db` (that module depends on `~/env` Zod validation which requires all env vars that are only set in `setupFiles`, not `globalSetup`).

---

#### 3. Register globalSetup in vitest config

**File**: `vitest.config.ts`

**Intent**: Tell Vitest to run the migration before any test workers spawn.

**Contract**: Add `globalSetup: ["./src/test/global-setup.ts"]` to the `test` object alongside the existing `setupFiles`.

### Success Criteria

#### Automated Verification

- `npm test` completes without "SQLITE_ERROR: no such table" errors on a fresh checkout (after running `npm run db:migrate` once manually to create the initial test.db, then deleting it to verify `globalSetup` recreates it correctly)
- `npm run typecheck` passes

#### Manual Verification

- Delete `test.db`, run `npm test` — the file is created and tests pass

**Implementation Note**: After completing this phase and automated verification passes, confirm manually that deleting `test.db` and re-running `npm test` succeeds before proceeding to Phase 2.

---

## Phase 2: Integration Test — mode.trigger Full Chain

### Overview

One integration test exercises the complete chain from `mode.trigger` (tRPC procedure) through `applyModeToRooms` (mode-control.ts) down to `sendValveStateCommand` (valve-control.ts) against a real SQLite DB and the stub Tuya client. No mocks on any of these layers.

### Changes Required

#### 1. Integration test file

**File**: `src/server/api/routers/mode.integration.test.ts` (new)

**Intent**: Verify that a real `mode.trigger` call: (a) returns `{ results: [{ status: "applied" }] }` and (b) writes an `automationModeActivationLogs` row with `status = "applied"` — confirming the full chain ran without a same-type argument swap or layer mismatch.

**Contract**:

- Do NOT use `vi.mock` for `~/server/db`, `~/server/lib/mode-control`, or `~/server/lib/valve-control`.
- Import `db` from `~/server/db` (real singleton, resolves to `test.db` via env set in `setup.ts`).
- Import `createCaller` from `~/server/api/root`.
- Import `encryptLocalKey` from `~/server/lib/crypto` to produce the gateway's `localKey` seed value.
- Import all needed schema tables from `~/server/db/schema` for seeding and assertion queries.
- Use a timestamp-based ID suffix (e.g. `const TS = Date.now()`) on all seeded row IDs to prevent collisions across parallel runs or re-runs without cleanup.
- Seed order in `beforeEach` (or at top of test): `sites` → `gateways` (with `localKey: encryptLocalKey("test-key")`, `tuyaGatewayId: "gw-tuya-" + TS`) → `rooms` → `devices` (with `deviceType: "valve"`, `productKey: "ogx8u5z6"`, `tuyaDeviceId: "dev-tuya-" + TS`, `gatewayId`) → `deviceRoomAssignments` → `automationModes` → `automationModeTargets` (with `targetOn: true`).
- Session fixture: `{ user: { id: "u1", email: "test@test.com" } } as never` — same shape as all other test files.
- `afterEach`: delete seeded rows in reverse FK order. Since `automationModeActivationLogs` has `modeId` FK with `onDelete: cascade` and `deviceRoomAssignments` has `deviceId` FK with `onDelete: cascade`, deleting `automationModes` and `devices` covers their dependents. Explicit order: `automationModeTargets`, `automationModes`, `deviceRoomAssignments`, `devices`, `rooms`, `gateways`, `sites` (or rely on cascades where they exist, but explicit deletes are safer for isolation).
- One test: `"mode.trigger applies mode and writes activation log"`. Assert `result.results` has one entry with `status: "applied"`. Then query `automationModeActivationLogs` directly from `db` (using the known `modeId` and `roomId`) and assert the row exists with `status: "applied"` and `triggeredBy: "manual"`.

### Success Criteria

#### Automated Verification

- `npx vitest run mode.integration` passes (1 test, green)
- `npm test` passes (no regressions in existing tests)

#### Manual Verification

- Run `npx vitest run mode.integration --reporter=verbose` and confirm the test name and assertion detail are visible

**Implementation Note**: After this phase passes, confirm that temporarily swapping the `sendValveStateCommand(d.deviceId, target.targetOn)` arguments to `(target.targetOn as never, d.deviceId as never)` in `mode-control.ts:57` makes the integration test fail — this proves the test catches the argument-swap class of bug. Revert the swap before proceeding.

---

## Phase 3: Branch Coverage — sendValveStateCommand Error Paths

### Overview

Add the 5 untested error branches to the existing `valve-control.test.ts` so `sendValveStateCommand`'s full error surface is covered.

### Changes Required

#### 1. Five new test cases

**File**: `src/server/lib/valve-control.test.ts`

**Intent**: Cover the 5 branches currently not reached by any test: `DEVICE_NOT_PAIRED`, `GATEWAY_NOT_FOUND`, `GATEWAY_KEY_NOT_SET`, `KEY_DECRYPT_FAILED`, `COMMAND_FAILED`.

**Contract**: All five tests follow the existing pattern in the file — use `mockDbSelect()`, assert `rejects.toThrow("BRANCH_NAME")`. Key setups:

- `DEVICE_NOT_PAIRED`: device row has `gatewayId: null` and a `productKey` present in `VALVE_STATE_DP_CODE_MAP` (the file already mocks this map with `"test-product-key": 3`).
- `GATEWAY_NOT_FOUND`: device row has valid productKey and non-null `gatewayId`; second arg to `mockDbSelect` is `[]` (empty gateway list).
- `GATEWAY_KEY_NOT_SET`: gateway row has `localKey: null`.
- `KEY_DECRYPT_FAILED`: gateway row is valid; use `vi.mocked(decryptLocalKey).mockImplementation(() => { throw new Error("bad key"); })` before the call.
- `COMMAND_FAILED`: all rows valid, `decryptLocalKey` returns a string; `vi.mocked(getTuyaClient).mockReturnValue({ sendSwitch: vi.fn().mockRejectedValue(new Error("network")) } as never)`.

All 5 tests live inside the existing `describe("sendValveStateCommand")` block. Ordering: add them between the existing UNSUPPORTED_DEVICE test and the happy path test, in the order they appear in the source (matches the `if` guard sequence at `valve-control.ts:97–119`).

### Success Criteria

#### Automated Verification

- `npx vitest run valve-control` shows 8 passing tests (was 3)
- `npm test` passes

#### Manual Verification

- Read the vitest output and confirm each of the 5 new test names matches the error string it asserts

**Implementation Note**: After this phase passes, cross-check that the branch order in the test file matches the guard order in `valve-control.ts:75–142` — this makes it easy for future readers to trace which line each test covers.

---

## Phase 4: ModeSummary Type Derivation Fix

### Overview

Replace the hand-written `ModeSummary` interface in `mode-manager.tsx` with a type derived from `RouterOutputs`, mirroring the pattern already used in `cc-modes-widget.tsx:7`.

### Changes Required

#### 1. Replace ModeSummary interface with RouterOutputs-derived type

**File**: `src/app/_components/setup/mode-manager.tsx`

**Intent**: Make the compiler enforce that `ModeSummary` stays in sync with `mode.list`'s return type. Currently, `mode-manager.tsx:16-23` defines the shape manually; if `mode.list` adds or changes a field, `mode-manager.tsx` drifts silently.

**Contract**: Add `import { type RouterOutputs } from "~/trpc/react"` (this import already exists in the file for `api`; combine or add alongside). Replace the `export interface ModeSummary { ... }` block with `export type ModeSummary = RouterOutputs["mode"]["list"][number]`. The `export` keyword is retained because `mode-form.tsx:10` imports this type via `import type { ..., ModeSummary } from "./mode-manager"`.

Verify that all existing usages of `ModeSummary` in `mode-manager.tsx` type-check against the new derived type — if `mode.list` returns a superset of the old interface (it should, since the interface was derived from the same router), no call sites need changes.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with no new errors
- `npm test` passes
- `npm run lint` passes

#### Manual Verification

- Confirm `mode-form.tsx` compiles without errors (it imports `ModeSummary` from `mode-manager.tsx`)
- Temporarily add a non-existent field access on a `ModeSummary` variable in `mode-manager.tsx` and verify the compiler flags it — confirms the type is now tight

**Implementation Note**: After this phase, the `ModeSummary` interface is gone from the codebase. Confirm `git grep "export interface ModeSummary"` returns no results.

---

## Testing Strategy

### Unit Tests

- Phase 3 adds 5 unit tests to `valve-control.test.ts` (all 8 branches covered post-plan)

### Integration Tests

- Phase 2 adds 1 integration test (`mode.integration.test.ts`) that is the first real-DB test in the project

### Manual Testing Steps

1. Delete `test.db`, run `npm test` — confirms globalSetup recreates the schema (Phase 1)
2. Run `npx vitest run mode.integration --reporter=verbose` — confirms full chain passes (Phase 2)
3. Temporarily swap `sendValveStateCommand` arguments in `mode-control.ts:57`, re-run — confirms test catches the bug (Phase 2 validation)
4. Run `npx vitest run valve-control` and confirm 8 tests listed by name (Phase 3)
5. Run `npm run typecheck` — confirm zero errors after ModeSummary change (Phase 4)

## References

- Related research: `context/changes/mode-activation-flow/research.md`
- Existing valve-control tests: `src/server/lib/valve-control.test.ts`
- Mode trigger procedure: `src/server/api/routers/mode.ts:291-314`
- Convergence function: `src/server/lib/mode-control.ts:18-85`
- RouterOutputs-derived type pattern: `src/app/_components/cc-modes-widget.tsx:7`
- Drizzle migrator: `drizzle-orm/libsql/migrator` (available in drizzle-orm v0.45.2)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Test Infrastructure — Migration + TUYA_STUB

#### Automated

- [x] 1.1 `npm test` completes without "no such table" errors after globalSetup is wired — 0b37f82
- [x] 1.2 `npm run typecheck` passes — 0b37f82

#### Manual

- [x] 1.3 Delete `test.db`, run `npm test` — file is recreated and tests pass — 0b37f82

### Phase 2: Integration Test — mode.trigger Full Chain

#### Automated

- [x] 2.1 `npx vitest run mode.integration` passes (1 test, green)
- [x] 2.2 `npm test` passes with no regressions

#### Manual

- [x] 2.3 Verbose run confirms test name and assertion detail visible
- [x] 2.4 Argument-swap probe: swap `sendValveStateCommand` args in `mode-control.ts:57`, confirm test fails, revert

### Phase 3: Branch Coverage — sendValveStateCommand Error Paths

#### Automated

- [ ] 3.1 `npx vitest run valve-control` shows 8 passing tests
- [ ] 3.2 `npm test` passes

#### Manual

- [ ] 3.3 Confirm each new test name matches its asserted error string

### Phase 4: ModeSummary Type Derivation Fix

#### Automated

- [ ] 4.1 `npm run typecheck` passes
- [ ] 4.2 `npm test` passes
- [ ] 4.3 `npm run lint` passes

#### Manual

- [ ] 4.4 `mode-form.tsx` compiles without errors (imports `ModeSummary` from `mode-manager.tsx`)
- [ ] 4.5 `git grep "export interface ModeSummary"` returns no results
