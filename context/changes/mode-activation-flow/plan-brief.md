# Mode Activation Flow — Plan Brief

> Full plan: `context/changes/mode-activation-flow/plan.md`
> Research: `context/changes/mode-activation-flow/research.md`

## What & Why

The research audit of the mode-trigger chain found three concrete gaps that the compiler and existing tests cannot catch: zero cross-layer integration tests (a same-type argument swap would pass all 5 unit-test files undetected), 5 untested error branches in `sendValveStateCommand`, and a hand-written `ModeSummary` type that drifts silently from the router contract. This plan closes all three with no production code changes.

## Starting Point

Every layer boundary in the chain (`mode.trigger` → `applyModeToRooms` → `sendValveStateCommand`) is mocked in isolation. `sendValveStateCommand` has 8 branches; 3 are covered. `mode-manager.tsx` exports `ModeSummary` as a manual interface, while `cc-modes-widget.tsx` already derives the equivalent type safely from `RouterOutputs`.

## Desired End State

One integration test runs the full mode trigger chain against a real SQLite DB and the stub Tuya client, asserting both the tRPC return value and the persisted log row. `sendValveStateCommand` has 8/8 branches covered. `ModeSummary` in `mode-manager.tsx` is compiler-enforced to match `mode.list`'s return type. All CI checks pass.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Integration test mocking level | Real DB + stub Tuya client (`TUYA_STUB=true`) | Catches argument-swap bugs while staying runnable in CI without hardware | Plan |
| Happy path scenarios | Valve opens (`targetOn: true`) only | Covers the baseline; pinned-off and targetOn=false are lower risk and can be added incrementally | Plan |
| Branch test location | Extend `valve-control.test.ts` | All `sendValveStateCommand` tests in one file; current file is small (3 tests) | Plan |
| DB migration approach | Vitest `globalSetup` (new `src/test/global-setup.ts`) | First real-DB test in the project — `test.db` has no schema on fresh checkout without this | Research |
| ModeSummary fix | `RouterOutputs["mode"]["list"][number]` type alias, keep `export` | Mirrors the existing pattern in `cc-modes-widget.tsx`; `mode-form.tsx` imports this type | Research |

## Scope

**In scope:**
- Vitest `globalSetup` to migrate `test.db` before tests
- `TUYA_STUB=true` added to `src/test/setup.ts`
- 1 integration test: `mode.trigger` → `applyModeToRooms` → `sendValveStateCommand`, happy path
- 5 new unit tests in `valve-control.test.ts` for untested error branches
- 1-line type alias fix in `mode-manager.tsx`

**Out of scope:**
- Scheduler path (`runModeTick`) integration test — shares the same `applyModeToRooms` convergence point
- Tie-break DB ordering assertion (requires concurrent writes, out of scope)
- Playwright / E2E tests for this flow (separate `/10x-e2e` concern)
- Any production logic changes

## Architecture / Approach

The integration test creates a real Drizzle DB connection (libsql → `test.db`) seeded with a minimal fixture chain: site → gateway (AES-256-GCM encrypted `localKey`) → room → device (`productKey: "ogx8u5z6"`, the only key in `VALVE_STATE_DP_CODE_MAP`) → `deviceRoomAssignment` → `automationMode` → `automationModeTarget`. Calling `mode.trigger` via `createCaller` with the real `db` singleton means `ctx.db` and the global `db` (used in `applyModeToRooms`/`sendValveStateCommand`) are the same connection. The stub Tuya client (`TUYA_STUB=true`) resolves the network boundary without hardware.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Test infra | `globalSetup` migrates `test.db`; `TUYA_STUB=true` in setup | `globalSetup` path resolves correctly before workers — verify by deleting `test.db` |
| 2. Integration test | First cross-layer test; argument-swap bug is now detectable | Seed FK ordering must be correct or inserts fail with constraint errors |
| 3. Branch coverage | 8/8 branches covered in `valve-control.test.ts` | Low risk; follows the established mock pattern |
| 4. Type fix | `ModeSummary` is compiler-enforced against `mode.list` | Verify `mode-form.tsx` still compiles (it re-exports the type) |

**Prerequisites:** `npm run db:migrate` must have been run at least once to produce the `drizzle/` migration files (they already exist in the repo).
**Estimated effort:** ~1 session across 4 small phases.

## Open Risks & Assumptions

- `test.db` is a shared file — if Vitest runs integration tests in parallel with others that somehow also hit the real DB, there could be contention. Currently no other test uses the real DB, so this is low risk.
- `RouterOutputs["mode"]["list"][number]` includes all fields returned by `mode.list`. If any usage of `ModeSummary` in `mode-manager.tsx` accesses a field not in the router output, it will become a compile error (this would be a real latent bug, not a regression from the fix).

## Success Criteria (Summary)

- `npx vitest run mode.integration` passes: 1 green test confirming the full chain ran
- `npx vitest run valve-control` shows 8 tests passing (was 3)
- `npm run typecheck` passes with `ModeSummary` replaced by the derived type
