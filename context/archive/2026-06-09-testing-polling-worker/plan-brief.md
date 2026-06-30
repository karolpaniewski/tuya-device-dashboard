# Polling Worker Integrity — Plan Brief

> Full plan: `context/changes/testing-polling-worker/plan.md`
> Research: `context/changes/testing-polling-worker/research.md`

## What & Why

Risk #2 from the test plan: the polling worker can silently stop updating the store, leaving `isOnline: true` frozen in memory indefinitely. Managers watching the dashboard see stale data that looks live. The protection (stale detection) does not exist today and must be built before it can be tested.

## Starting Point

`deviceStateStore` holds `lastPolledAt: Date` per device, but the resolver never checks it against a threshold. `pollOnce` is private, making error-path testing impossible without fake timers. Neither client (stub / real placeholder) currently throws, so the risk is latent but will become live when the real Tuya client ships.

## Desired End State

`device.overview` returns `isStale: boolean` per device (true when `lastPolledAt` > 60 s ago). Device cards show a "Data may be outdated" badge when stale. `pollOnce` is exported and covered by unit tests for its three meaningful paths. The resolver's stale computation is tested with controlled timestamps. `test-plan.md §6.3` is filled in.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Stale representation | `isStale: boolean` new field on DeviceItem | Transparent — keeps last-known `isOnline` truthful; UI can independently badge without overwriting device status | Plan |
| Stale threshold | 60 s (2× poll interval) | Absorbs one slow/late tick; only flags a truly dead worker (2+ missed cycles) | Plan |
| `getTuyaClient()` hardening | Move inside per-gateway try/catch | Closes latent unhandled rejection gap before real client ships; 2-line change | Research |
| UI scope | Field + minimal badge in device-card.tsx | `isStale` is immediately useful to the manager; badge is ~10 lines Tailwind, no new component | Plan |
| Test shape | Happy path + error paths | Happy path is the baseline contract; without it there's no regression signal if `pollOnce` breaks | Plan |
| Export strategy | Direct named export from tuya-poller.ts | Pure business logic; no side effects from exporting; makes tests targeted and minimal | Research |

## Scope

**In scope:**
- Export `pollOnce` from `tuya-poller.ts`
- Move `getTuyaClient()` inside per-gateway try/catch
- Add `isStale: boolean` to `DeviceItem`; constant `STALE_THRESHOLD_MS = 60_000`
- `device-card.tsx` stale badge
- `src/server/workers/tuya-poller.test.ts` (new) — 3 test cases
- Extend `src/server/api/routers/device.test.ts` — 3 stale detection cases
- Fill in `test-plan.md §6.3` cookbook entry

**Out of scope:**
- Watchdog / automatic poller restart (infrastructure)
- Changing `DeviceState` interface (stale computed in resolver, not stored)
- UI component tests (excluded by test-plan §7)
- Real tuyapi integration (S-04)
- e2e tests

## Architecture / Approach

Production code first, then tests. Stale detection is a pure computation in the resolver — no store schema changes needed. Worker tests mock `~/server/db` and `~/server/lib/tuya`, then directly inspect the exported `deviceStateStore` Map. Resolver tests mock the Drizzle query chain, pre-seed the store with known timestamps, and call `device.overview` via `createCaller`. The existing Phase 1 Vitest config carries over unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Production hardening + stale detection | `isStale` in API + badge in UI; poller hardened | TypeScript needs `isStale` to flow cleanly through `RouterOutputs` — `npm run typecheck` is the gate |
| 2. Worker unit tests | `tuya-poller.test.ts` with 3 cases | Drizzle mock chain for `pollOnce` is 2 levels — simpler than the resolver mock, but must match exactly |
| 3. Stale tests + cookbook | `device.test.ts` stale suite + `§6.3` filled in | Resolver mock chain is 4 levels deep — missing one `leftJoin` causes a runtime error |

**Prerequisites:** Phase 1 complete (plan.md verified) before Phase 2 starts.  
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- The 60 s threshold is encoded as a plain constant. If the polling interval changes in a future slice, `STALE_THRESHOLD_MS` must be updated manually — there is no shared config linking the two.
- `device.test.ts` currently has only one `describe` (auth-gate). The Phase 3 stale suite adds a second. Both share the module-level `vi.mock` declarations at the top — confirm the `vi.mock("~/server/db", ...)` mock factory is still compatible with the mock db objects built per-describe. (It is: each describe provides its own `createCaller` with a local `mockDb` object; the top-level mock only initialises the module shape.)

## Success Criteria (Summary)

- `npm test` passes with 6 new tests (3 worker + 3 stale)
- `isStale: true` visible in UI badge when device data is >60 s old
- `test-plan.md §6.3` no longer reads "TBD"
