# Bootstrap Vitest + Auth-gate + Crypto Tests — Plan Brief

> Full plan: `context/changes/testing-bootstrap-auth-crypto/plan.md`
> Research: `context/changes/testing-bootstrap-auth-crypto/research.md`

## What & Why

Bootstrap the project's first test runner and write the Phase 1 tests from `context/foundation/test-plan.md`. Phase 1 proves two risks: (1) an unauthenticated caller cannot reach device data via tRPC, (2) `decryptLocalKey` throws on invalid input and never returns wrong plaintext. No tests exist today — this phase also wires the runner so subsequent phases have somewhere to add tests.

## Starting Point

No test runner, no test files. `package.json` has no `vitest` or `jest`. The project is ESM (`"type": "module"`), uses a single path alias (`~/` → `./src/`), and all backend logic is in `src/server/`. The two functions to test are already implemented and stable.

## Desired End State

`npm test` runs four tests and exits 0. The test-plan cookbook (§6.1, §6.2) is filled in with real patterns. Any future developer adding a pure-function unit test or a tRPC integration test has a working reference in this change folder.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test file location | Co-located (`module.test.ts` next to `module.ts`) | Standard Vitest/T3 convention; easy to navigate | Plan |
| Auth-gate test scope | UNAUTHORIZED only (negative case) | Cheapest test that proves the risk per test-plan §1 cost×signal rule | Plan |
| Crypto error cases | Tampered ciphertext + invalid string | Two distinct failure modes: auth-tag rejection and short-buffer rejection | Plan |
| tRPC test entry point | `createCaller` with inline context (not `createTRPCContext`) | Bypasses `auth()` call; tests the `protectedProcedure` layer in isolation | Research |
| Module mocking strategy | `vi.mock('~/server/auth')` + `vi.mock('~/server/db')` | Prevents env.js Zod validation from firing during test imports | Research |
| Dev delay suppression | `NODE_ENV=test` in setup.ts | tRPC `timingMiddleware` adds 100-500 ms in dev; test env skips it | Research |

## Scope

**In scope:**
- Install and configure Vitest (ESM, Node.js env, path alias)
- `src/test/setup.ts` with required env vars
- `src/server/lib/crypto.test.ts` — 3 unit tests
- `src/server/api/routers/device.test.ts` — 1 integration test
- §6.1 and §6.2 cookbook patterns in `test-plan.md`

**Out of scope:**
- Positive auth-gate test (authenticated session succeeds)
- Real SQLite test database setup
- Middleware e2e test (covered by static analysis)
- React/component tests, jsdom
- CI/CD wiring (that is test-plan.md Phase 4)

## Architecture / Approach

Vitest runs in Node.js environment. Crypto tests are pure — only `ENCRYPTION_SECRET` env var needed. The tRPC auth-gate test uses `createCaller` (from `src/server/api/root`) with a hand-crafted `{ session: null }` context; this exercises `enforceUserIsAuthed` without touching HTTP, Next.js, or the real database. `vi.mock` for `~/server/auth` and `~/server/db` prevents their real implementations from loading, bypassing env.js Zod validation for those modules.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest Bootstrap | Runner installed, config + setup file wired, `npm test` script added | `~/env` Zod validation crashing on test import if setup.ts doesn't set all required vars first |
| 2. Crypto Unit Tests | 3 tests green: roundtrip, tampered, invalid string | Oracle problem: expected value must come from the plaintext constant, not from inspecting current function output |
| 3. tRPC Auth-gate | 4 tests green: UNAUTHORIZED on null session | `vi.mock` hoisting — mocks must intercept `~/server/auth` and `~/server/db` before `createCaller` import resolves |
| 4. Cookbook Update | §6.1 and §6.2 in test-plan.md filled in | None — pure documentation |

**Prerequisites:** Application code complete (`src/server/lib/crypto.ts`, `src/server/api/routers/device.ts` both implemented and typecheck-clean).  
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- `vi.mock` hoisting works as expected with this project's ESM setup. If Vitest requires `unstable_mockModule` for true ESM mocking, Phase 3 needs a small adjustment.
- `@t3-oss/env-nextjs` validates env vars at module evaluation time. If any transitive import in the tRPC test graph loads `~/env` before `setup.ts` runs, the test will fail with a Zod error. Mitigation: mocking auth and db prevents their module graphs from loading.

## Success Criteria (Summary)

- `npm test` exits 0 with 4 named tests passing
- `npm run typecheck` passes (test files type-check cleanly)
- §6.1 and §6.2 in `test-plan.md` contain real cookbook patterns, not "TBD"
