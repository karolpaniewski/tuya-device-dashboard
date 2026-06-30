# Bootstrap Vitest + Auth-gate + Crypto Tests — Implementation Plan

## Overview

Bootstrap the project's first test runner (Vitest) and write the two test types that prove Phase 1 of `context/foundation/test-plan.md`: (1) unit tests for `decryptLocalKey` / `encryptLocalKey` proving AES-256-GCM correctness and safe error behaviour on bad input, (2) a tRPC integration test proving that `device.overview` rejects unauthenticated callers with UNAUTHORIZED before any device data is read.

## Current State Analysis

- No test runner is installed. `package.json` has no `vitest`, `jest`, or similar dependency. No `vitest.config.*` file exists. No `*.test.*` files anywhere.
- The project is ESM (`"type": "module"` in package.json). `tsconfig.json` uses `moduleResolution: "Bundler"` and defines a single path alias `~/* → ./src/*`.
- `src/server/lib/crypto.ts` is a pure module: imports only from `node:crypto`, reads `process.env.ENCRYPTION_SECRET` directly (not via `~/env`). Zero mocks needed for unit tests — only the env var.
- `src/server/api/trpc.ts` imports `{ auth }` from `~/server/auth` and `{ db }` from `~/server/db`. Both transitively touch `~/env` (Zod validation at module load). For the integration test, both modules must be mocked with `vi.mock` to avoid loading their real implementations and triggering env validation for auth / db vars.
- `src/server/api/root.ts` exports `createCaller` (from `createCallerFactory`). This is the entry point for test callers — it accepts an inline context object, bypassing `createTRPCContext` and `auth()` entirely.
- `protectedProcedure` throws `TRPCError({ code: "UNAUTHORIZED" })` at `src/server/api/trpc.ts:117–118` when `!ctx.session?.user`. This fires before any `ctx.db` access, so the UNAUTHORIZED test needs only `session: null` in context; `db` can be an empty stub object.
- The `timingMiddleware` in `src/server/api/trpc.ts:84–91` adds a 100–500 ms artificial delay when `t._config.isDev` (determined by `NODE_ENV`). Setting `NODE_ENV=test` in the setup file disables this delay.
- `src/env.js` uses `@t3-oss/env-nextjs` with Zod and validates env vars at module evaluation time. The setup file must set all required vars before any test-module import triggers it.
- Do NOT import from `src/trpc/server.ts` in tests — it imports `server-only` and `next/headers` (Next.js App Router primitives that fail outside Next.js). Import from `~/server/api/root` and `~/server/api/trpc` directly.

## Desired End State

`npm test` runs all tests with `vitest run` and exits 0. Four tests pass:
- Three crypto unit tests: valid roundtrip, tampered ciphertext throws, invalid string throws.
- One tRPC integration test: `device.overview` with a null session throws UNAUTHORIZED.

`npm run typecheck` also passes (test files are type-checked cleanly). `context/foundation/test-plan.md` §6.1 and §6.2 are filled in with the concrete patterns this phase shipped.

### Key Discoveries

- `src/server/lib/crypto.ts:26–34` — `decryptLocalKey` has no try/catch; errors propagate from `decipher.final()` (GCM auth-tag check). Any tampered or short ciphertext throws `Error: Unsupported state or unable to authenticate data`. There is no path that returns incorrect plaintext.
- Ciphertext format (binary before base64): `[IV: 12 bytes][AuthTag: 16 bytes][Ciphertext: N bytes]`. Minimum valid length: 28 bytes. Flip any byte at offset ≥ 28 to force an auth-tag failure.
- `src/server/api/root.ts:10` — `createCaller = createCallerFactory(appRouter)`. Accepts a raw context object; does not call `createTRPCContext`. This is the test entry point.
- Middleware matcher (`src/middleware.ts:7`) excludes `/api/auth/*` but not `/api/trpc/*`. tRPC is protected at the HTTP layer. The tRPC integration test exercises the procedure-layer guard only — middleware is an HTTP concern and is verified by static matcher analysis, not a separate test.
- `vi.mock` calls in Vitest are automatically hoisted above imports. Placing them before or after import statements in source is equivalent; Vitest executes them first.

## What We're NOT Doing

- No positive-case auth test (authenticated session → successful response). Phase 1 proves the failure boundary; a happy-path test can be added in a later phase when the procedure body is exercised.
- No middleware e2e test. The matcher pattern analysis in research.md is sufficient evidence for Phase 1.
- No database integration (real SQLite in tests). Phase 1 uses mocks for `~/server/db`; a real test DB setup is deferred.
- No React component tests or jsdom setup. All Phase 1 tests target Node.js backend logic.
- No hardware or end-to-end Tuya client tests.

## Implementation Approach

Four phases in dependency order. Phase 1 bootstraps the runner; Phases 2–3 write the tests; Phase 4 closes the loop by filling in the cookbook. Each phase's automated success criteria build on the previous.

## Critical Implementation Details

**vi.mock hoisting in device.test.ts**: `vi.mock('~/server/auth', ...)` and `vi.mock('~/server/db', ...)` must appear in the test file. Vitest hoists them automatically, so they intercept the module imports in `~/server/api/trpc.ts` before those modules load. Without these two mocks, loading `createCaller` from `~/server/api/root` will trigger real auth and db module loading, which in turn fires `~/env` Zod validation.

**Alias format in vitest.config.ts**: the trailing `/` in the alias key (`"~/"`) is significant — it ensures `~/server/foo` matches but a standalone `~` does not. Use `path.join(__dirname, "src") + "/"` for the value, matching exactly how the T3 tsconfig alias is defined.

**setup.ts runs before module evaluation**: Vitest `setupFiles` execute before each test file's module graph is resolved. Setting env vars there is safe and sufficient — `~/env` Zod validation will see them when first triggered.

---

## Phase 1: Vitest Bootstrap

### Overview

Install Vitest, write the configuration and test setup file, add npm scripts. After this phase the test runner loads without errors and `typecheck` passes; no test files exist yet.

### Changes Required

#### 1. Install vitest

**File**: `package.json` (via npm install)

**Intent**: Add Vitest as a dev dependency so the test runner and type definitions are available.

**Contract**: Run `npm install -D vitest`. No other packages needed for Phase 1 (no `@vitest/coverage-v8`, no `jsdom` — backend tests only).

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, at repo root)

**Intent**: Configure the test runner environment, setup file, and path alias so tests can import `~/server/...` the same way application code does.

**Contract**: Export a `defineConfig` object with:
- `test.environment: "node"` — Node.js runtime, no browser globals
- `test.setupFiles: ["./src/test/setup.ts"]` — runs the env-var setup before every test file
- `resolve.alias` entry mapping `"~/"` to the absolute path of `./src/` with a trailing `/`, using `node:path` to resolve. Use ESM-compatible `__dirname` derivation (e.g. `fileURLToPath(new URL(".", import.meta.url))`).

#### 3. Test setup file

**File**: `src/test/setup.ts` (new)

**Intent**: Set all environment variables required by modules that tests import — before those modules are loaded. Prevents `~/env` Zod validation from failing and disables the tRPC timing delay.

**Contract**: Set the following on `process.env` before any imports:
- `ENCRYPTION_SECRET`: 64 zero hex chars (`"0".repeat(64)`) — valid 32-byte AES key for test use
- `DATABASE_URL`: `"file:test.db"` — satisfies Zod schema, never used (db is mocked)
- `AUTH_SECRET`: any string ≥ 32 chars
- `AUTH_ADMIN_EMAIL`: any valid email
- `AUTH_ADMIN_PASSWORD`: any string ≥ 8 chars
- `NODE_ENV`: `"test"` — disables the tRPC timing middleware delay

No imports in this file — pure `process.env` assignments only.

#### 4. npm scripts

**File**: `package.json`

**Intent**: Expose `test` and `test:watch` scripts so the runner is invocable via `npm test`.

**Contract**: In the `"scripts"` object, add:
- `"test": "vitest run"` — single-pass run for CI and manual verification
- `"test:watch": "vitest"` — interactive watch mode for development

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes — `vitest.config.ts` and `src/test/setup.ts` type-check without errors

#### Manual Verification

- `npx vitest run --passWithNoTests` exits 0 and prints no configuration errors (confirms config loads cleanly before any tests exist)

---

## Phase 2: Crypto Unit Tests

### Overview

Write co-located unit tests for `encryptLocalKey` / `decryptLocalKey`. Three tests: valid roundtrip, tampered ciphertext throws, invalid (non-ciphertext) string throws. No mocks — only the `ENCRYPTION_SECRET` env var from setup.ts.

### Changes Required

#### 1. Crypto unit test file

**File**: `src/server/lib/crypto.test.ts` (new)

**Intent**: Prove that (a) roundtrip encryption/decryption is correct, (b) any tampered ciphertext is rejected with an error, not silently decoded to garbage.

**Contract**: Three tests in a `describe("crypto helpers")` block:

**Test 1 — roundtrip**: Call `encryptLocalKey` on a known plaintext string (use the fixture key `"stub-local-key-0000000000000000"`). Pass the result to `decryptLocalKey`. Assert the output strictly equals the original plaintext. This is the oracle: the expected value comes from the plaintext constant, not from inspecting what the function currently returns.

**Test 2 — tampered ciphertext**: Decode the ciphertext from Test 1 into a `Buffer`. Flip any single byte at offset ≥ 28 (past the IV+tag prefix) using `XOR 0xff`. Re-encode to base64. Assert that calling `decryptLocalKey` on the modified string throws. The thrown error must not contain the plaintext key — assert `error.message` does not include the original plaintext string.

**Test 3 — invalid string**: Pass a string that is not a valid AES-256-GCM ciphertext to `decryptLocalKey` (e.g., a short base64 string that decodes to fewer than 28 bytes). Assert it throws.

All three tests import only from `~/server/lib/crypto`. No `vi.mock`, no db, no Next.js.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with exactly 3 passing tests and 0 failures
- `npm run typecheck` still passes

---

## Phase 3: tRPC Auth-gate Integration Test

### Overview

Write an integration test that calls `device.overview` with a null session context and asserts it throws UNAUTHORIZED. Mock `~/server/auth` and `~/server/db` to prevent their real module loading.

### Changes Required

#### 1. Device router integration test file

**File**: `src/server/api/routers/device.test.ts` (new)

**Intent**: Prove that `device.overview` — the only tRPC procedure serving device data — cannot be reached without a valid session. The test exercises the `protectedProcedure` middleware layer directly, independently of the HTTP middleware.

**Contract**: The file must:

1. Call `vi.mock('~/server/auth', ...)` with a factory returning `{ auth: vi.fn() }`. This prevents the real `~/server/auth` module (bcryptjs, libsql, env.js) from loading.
2. Call `vi.mock('~/server/db', ...)` with a factory returning `{ db: {} }`. This prevents the real Drizzle client from loading.
3. Import `createCaller` from `~/server/api/root` (after the mocks are declared).
4. One test: create a caller with context `{ db: {} as never, session: null, headers: new Headers() }`. Call `caller.device.overview()`. Assert the returned promise rejects with an object matching `{ code: "UNAUTHORIZED" }`.

The `db` stub is an empty object cast to `never` — it is never accessed because `enforceUserIsAuthed` throws before the procedure body runs.

Do not import from `~/trpc/server` (Next.js App Router only). Do not import `auth` from `~/server/auth` (mocked; no re-export needed).

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with 4 passing tests (3 crypto + 1 auth-gate) and 0 failures
- `npm run typecheck` passes

#### Manual Verification

- Run `npm test -- --reporter=verbose` and confirm the test names printed match the three crypto tests and the one UNAUTHORIZED test exactly as described above

---

## Phase 4: Cookbook Update

### Overview

Fill in §6.1 and §6.2 of `context/foundation/test-plan.md` with the concrete patterns this phase shipped. This closes the rollout loop and turns the guide from a strategy doc into a usable cookbook.

### Changes Required

#### 1. Update §6.1 (unit test pattern)

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 1" placeholder in §6.1 with the actual unit-test pattern so a future developer adding a new pure-function test knows the conventions.

**Contract**: Replace the placeholder under `### 6.1 Adding a unit test (pure function)` with a short cookbook entry covering:
- File location: co-located at `src/path/to/module.test.ts`
- Import: from the module under test, no mocks needed for pure functions
- Env setup: `process.env.ENCRYPTION_SECRET` is set in `src/test/setup.ts` — no per-test setup needed for crypto functions
- Reference test: `src/server/lib/crypto.test.ts` (roundtrip + invalid-input pattern)
- Run command: `npm test`

#### 2. Update §6.2 (tRPC integration test pattern)

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 1" placeholder in §6.2 with the auth-gate integration test pattern.

**Contract**: Replace the placeholder under `### 6.2 Adding an integration test (tRPC procedure)` with a short cookbook entry covering:
- File location: co-located at `src/server/api/routers/<router>.test.ts`
- Required mocks: `vi.mock('~/server/auth', ...)` and `vi.mock('~/server/db', ...)` at top of file (Vitest hoists these)
- Caller creation: `createCaller` from `~/server/api/root`, passing inline context — not `createTRPCContext`
- Do NOT import from `~/trpc/server` (Next.js only)
- Reference test: `src/server/api/routers/device.test.ts` (null session → UNAUTHORIZED pattern)
- Run command: `npm test`

### Success Criteria

#### Automated Verification

- `npm test` still exits 0 (no tests were changed)
- `npm run typecheck` still passes

#### Manual Verification

- Read `context/foundation/test-plan.md` §6.1 and §6.2 — neither reads "TBD"; both contain location, import pattern, reference test file, and run command

---

## Testing Strategy

### Unit Tests

- `src/server/lib/crypto.test.ts` — three cases: valid roundtrip (oracle from plaintext constant), tampered byte (auth-tag rejection), invalid string (short buffer rejection)

### Integration Tests

- `src/server/api/routers/device.test.ts` — one case: null session → UNAUTHORIZED, verified via `.rejects.toMatchObject({ code: "UNAUTHORIZED" })`

### Manual Testing Steps

1. Run `npm test -- --reporter=verbose` — confirm 4 tests pass with names as described above
2. Temporarily pass `session: { user: { id: "x" } }` in the device test — confirm the test fails (proves the assertion is meaningful, not vacuously green)
3. Revert the temporary change

## Migration Notes

No schema changes. No database interaction. No changes to application code.

## References

- Research: `context/changes/testing-bootstrap-auth-crypto/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (Risk #1, Risk #3), §3 (Phase 1 row), §6.1, §6.2
- Crypto implementation: `src/server/lib/crypto.ts`
- tRPC context + protectedProcedure: `src/server/api/trpc.ts:116–127`
- Caller entry point: `src/server/api/root.ts:10`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm run typecheck` passes with vitest.config.ts and src/test/setup.ts present — db0f112

#### Manual

- [x] 1.2 `npx vitest run --passWithNoTests` exits 0 with no configuration errors — db0f112

### Phase 2: Crypto Unit Tests

#### Automated

- [x] 2.1 `npm test` exits 0 with 3 passing tests and 0 failures — 2ad7364
- [x] 2.2 `npm run typecheck` passes — 2ad7364

### Phase 3: tRPC Auth-gate Integration Test

#### Automated

- [x] 3.1 `npm test` exits 0 with 4 passing tests (3 crypto + 1 auth-gate) and 0 failures — 6c63946
- [x] 3.2 `npm run typecheck` passes — 6c63946

#### Manual

- [x] 3.3 `npm test -- --reporter=verbose` shows 4 named tests matching the plan — 6c63946
- [x] 3.4 Temporarily use valid session in device test → test fails (assertion is non-vacuous) — 6c63946

### Phase 4: Cookbook Update

#### Automated

- [x] 4.1 `npm test` still exits 0 (no tests changed) — 4328232
- [x] 4.2 `npm run typecheck` still passes — 4328232

#### Manual

- [x] 4.3 §6.1 in test-plan.md reads actual pattern (not "TBD") with location, import, reference test, run command — 4328232
- [x] 4.4 §6.2 in test-plan.md reads actual pattern (not "TBD") with location, mock pattern, caller creation, reference test, run command — 4328232
