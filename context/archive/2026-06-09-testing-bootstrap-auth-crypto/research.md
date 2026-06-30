---
date: 2026-06-09T00:00:00+00:00
researcher: Claude
git_commit: 88020dc97a28a2606dc926dcd54a3104ec97823a
branch: main
repository: 10xdevs
topic: "Ground Phase 1 rollout: auth-gate regression (Risk #1) + decryptLocalKey correctness (Risk #3) + Vitest bootstrap"
tags: [research, auth, crypto, vitest, trpc, middleware, aes-256-gcm]
status: complete
last_updated: 2026-06-09
last_updated_by: Claude
---

# Research: Phase 1 Rollout — Auth-gate + Crypto + Vitest Bootstrap

**Date**: 2026-06-09
**Researcher**: Claude
**Git Commit**: 88020dc97a28a2606dc926dcd54a3104ec97823a
**Branch**: main
**Repository**: 10xdevs

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`.

Risks to verify: Risk #1 (unauthenticated user reaches device data), Risk #3 (decryptLocalKey produces wrong key or leaks to logs).  
Test types: unit (crypto), integration (tRPC auth protection).  
Vitest bootstrap: no test runner exists yet — establish what must be installed and configured.

---

## Summary

Both risks are well-grounded and testable. The auth-gate has **two independent protection layers** — middleware and `protectedProcedure` — that the tests should prove function independently. `decryptLocalKey` is a pure, side-effect-free function with AES-256-GCM auth-tag verification as the only guard against bad input; it throws on any tampered ciphertext, never returns garbage. Vitest bootstrap is straightforward for backend logic: ESM project, single path alias, Node.js environment only.

Key plan correction from research: the cheapest auth-gate test calls the tRPC procedure with a null-session context via `createCallerFactory`, not through HTTP — this tests the `protectedProcedure` layer directly without needing a running server or middleware involvement. Middleware coverage is confirmed by static matcher analysis (not a separate test).

---

## Detailed Findings

### Area 1: Middleware matcher — which paths are protected

**File**: `src/middleware.ts:7`

```typescript
matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)"]
```

The matcher uses a negative lookahead. Paths **excluded** from middleware (not protected):
- `/login` — login page itself
- `/api/auth/*` — Auth.js v5 internal routes (signin, signout, callback, session)
- `/_next/static/*` — static assets
- `/_next/image/*` — image optimization
- `/favicon.ico`

Paths **protected** (middleware fires, `authorized()` callback runs):
- `/` (root)
- `/api/trpc/*` — **tRPC is protected at the HTTP layer**
- `/_next/data/*` — RSC data routes (not explicitly excluded; correct for App Router)
- Everything else not in the exclusion list

**Verification of the "Must Challenge"**: The exclusion list is specific — `api/auth` is excluded but `api/trpc` is NOT. tRPC routes are protected. The batch endpoint `api/trpc/*` is covered. `/_next/static` and `/_next/image` are correctly excluded (static assets need no auth).

**Important nuance**: The middleware exclusion of `_next/static` and `_next/image` but NOT `_next/data` is correct for Next.js 15 App Router — RSC streaming data requests also carry the session cookie and should be gated.

---

### Area 2: protectedProcedure — the tRPC authorization layer

**File**: `src/server/api/trpc.ts:116-127`

```typescript
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { session: { ...ctx.session, user: ctx.session.user } },
  });
});

export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(enforceUserIsAuthed);
```

**Condition** (`src/server/api/trpc.ts:117`): `!ctx.session?.user` — throws if session is null, undefined, or session.user is falsy.

**Context shape** (`src/server/api/trpc.ts:28-35`):
```typescript
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();  // Auth.js v5 auth() called on every request
  return { db, session, ...opts };
};
```

`session` is the Auth.js v5 `Session | null` object. No session → `ctx.session = null` → `!ctx.session?.user` is true → UNAUTHORIZED thrown.

**All device procedures use protectedProcedure** (`src/server/api/routers/device.ts`): `device.overview` is a `protectedProcedure.query(...)`. No `publicProcedure` in the device router.

**Two independent protection layers confirmed**:
1. **HTTP layer** (middleware): unauthenticated HTTP request → redirect to `/login`
2. **tRPC layer** (protectedProcedure): null-session call → UNAUTHORIZED, regardless of how the call arrived

---

### Area 3: How to call the tRPC procedure in tests

**File**: `src/server/api/root.ts:10`, `src/server/api/trpc.ts:62`

```typescript
// root.ts
export const createCaller = createCallerFactory(appRouter);

// trpc.ts
export const createCallerFactory = t.createCallerFactory;
```

**Test approach** (cheapest): create a caller with an inline context object, bypassing `createTRPCContext` (which calls `auth()`) entirely:

```typescript
// In test:
const caller = createCaller({
  db: /* real or mock db */,
  session: null,           // ← unauthenticated
  headers: new Headers(),
});
await expect(caller.device.overview()).rejects.toMatchObject({
  code: "UNAUTHORIZED",
});
```

This is a **direct procedure call** with no HTTP, no middleware, no `auth()` call. It tests the `enforceUserIsAuthed` middleware in isolation.

**What NOT to do**: Do NOT test through Next.js `src/trpc/server.ts` — it imports `server-only` and `next/headers`, which will fail in Vitest. Import directly from `~/server/api/root` and `~/server/api/trpc`.

**For authenticated context** (if needed for positive-case tests):
```typescript
const caller = createCaller({
  db,
  session: { user: { id: "test-user-id", email: "test@example.com" } },
  headers: new Headers(),
});
// device.overview should resolve without throwing
```

---

### Area 4: decryptLocalKey — AES-256-GCM implementation

**File**: `src/server/lib/crypto.ts` (full file, 34 lines)

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET env var is required");
  const key = Buffer.from(secret, "hex");
  if (key.length !== 32)
    throw new Error("ENCRYPTION_SECRET must be 64 hex chars (32 bytes)");
  return key;
}

export function encryptLocalKey(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptLocalKey(ciphertext: string): string {
  const b = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv(ALGORITHM, getKey(), b.subarray(0, IV_LEN));
  decipher.setAuthTag(b.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([
    decipher.update(b.subarray(IV_LEN + TAG_LEN)),
    decipher.final(),
  ]).toString("utf8");
}
```

**Ciphertext format** (binary layout before base64 encoding):
```
[IV: 12 bytes][AuthTag: 16 bytes][Ciphertext: N bytes]
```
Total minimum length: 28 bytes (12 + 16 + 0 for empty plaintext).  
Final output: base64 string (~`ceil((28+N)/3)*4` chars).

**Error behavior — confirmed throws, never garbage**:

1. **Valid roundtrip**: `decryptLocalKey(encryptLocalKey(x)) === x` — always, by GCM design.
2. **Tampered ciphertext** (any byte flipped after the IV): `decipher.final()` at `crypto.ts:32` throws `Error: Unsupported state or unable to authenticate data`. Node.js GCM authentication is cryptographically enforced — there is no path to return incorrect plaintext.
3. **Too-short buffer** (fewer than 28 bytes): The auth tag extracted by `b.subarray(IV_LEN, IV_LEN + TAG_LEN)` will be wrong (it contains bytes from the ciphertext area or zeros). `decipher.final()` will throw auth failure.
4. **Garbage base64 string**: `Buffer.from(garbage, "base64")` will produce a short/empty buffer → same as above → throws.
5. **Empty string `""`**: `Buffer.from("", "base64")` = 0-byte buffer → `createDecipheriv` receives a 0-byte IV (invalid for GCM) → Node.js throws before auth tag check.
6. **Missing `ENCRYPTION_SECRET`**: `getKey()` throws `"ENCRYPTION_SECRET env var is required"` — before decryption begins.

**No explicit edge-case handling**: There is no `try/catch` in `decryptLocalKey`. Errors propagate up. This is correct for a crypto helper — callers must handle thrown errors.

**Key does NOT appear in error messages**: The only logged/thrown messages are:
- Node.js native: `"Unsupported state or unable to authenticate data"` (no key material)
- `getKey()` custom error: `"ENCRYPTION_SECRET env var is required"` or `"must be 64 hex chars"` (no actual key value)

**Seed fixture plaintext key**: `'stub-local-key-0000000000000000'` (32 ASCII chars). Encrypted form stored in DB is a ~60-char base64 string.

---

### Area 5: Key leakage paths (Risk #3 secondary)

`crypto.ts` itself: **no logging at all** — purely functional, no side effects.

`src/server/workers/tuya-poller.ts:33-38` — the only meaningful risk point:
```typescript
} catch (err) {
  console.error(`[tuya-poller] Error polling gateway ${gateway.tuyaGatewayId}:`, err);
}
```
The `decryptedKey` variable is in scope when this catch fires. If `err` is an object thrown by `client.fetchGatewayDevices()` that embeds connection parameters (including the plaintext key), it would be logged. The stub client never throws; the real client is a placeholder that returns `[]`. **Risk is latent, not exercisable until the real client is implemented.** Not a unit-testable concern for Phase 1 — log it as an open question for the real-client phase.

`src/server/api/routers/device.ts`: **no console calls at all**. tRPC errors thrown from `protectedProcedure` contain only `{ code: "UNAUTHORIZED" }` — no user data, no credentials.

`src/server/lib/tuya/real-client.ts:12-14`:
```typescript
console.warn(`[tuya-poller] Real Tuya client not fully implemented. …`, gateway.tuyaGatewayId)
```
Safe — logs only the gateway ID (opaque string), not the key.

---

### Area 6: Vitest bootstrap requirements

**No test runner installed** — `package.json` has no `vitest`, `jest`, or any test dep. Phase 1 bootstraps the runner from scratch.

**Project type**: `"type": "module"` in `package.json` → ESM. Vitest handles this natively.

**Path alias**: `tsconfig.json` defines `~/*` → `./src/*`. Must be mirrored in vitest config `resolve.alias`.

**Environment**: `node` (not `jsdom`) — all Phase 1 tests target Node.js backend code only.

**moduleResolution: `"Bundler"`** — Vitest's default resolution is compatible; no special handling needed.

**What must be installed**:
- `vitest` — the test runner
- No additional adapters needed for Phase 1 (no React testing, no jsdom)

**What must be configured** (`vitest.config.ts`):
1. `test.environment: 'node'`
2. `resolve.alias: { '~/': path.resolve(__dirname, './src/') }`
3. `test.setupFiles` — a setup file that sets `process.env.ENCRYPTION_SECRET` to a valid 64-hex test key

**What does NOT need mocking for crypto unit tests**: `crypto.ts` imports only from `node:crypto` and reads `process.env.ENCRYPTION_SECRET`. Set the env var in setup — no mocks needed.

**What needs mocking for tRPC integration tests**: `~/server/db` — the Drizzle client. The auth-gate test creates the tRPC context manually (bypasses `createTRPCContext`), so `auth()` does NOT need to be mocked for the UNAUTHORIZED test. Only if a positive-case test queries the database does `db` need mocking or a test DB.

**Import path that must NOT appear in tests** (`src/trpc/server.ts`): imports `server-only` and `next/headers` — these will fail in Vitest. The tests import from `~/server/api/root` (createCaller) and `~/server/api/trpc` (createCallerFactory) instead.

**`src/env.js`**: This file is imported transitively by `~/server/db` and `~/server/auth`. It reads `process.env` vars via Zod validation at import time. Tests that import anything from `~/server/` may trigger env validation. Set required env vars in setup:
- `ENCRYPTION_SECRET` (64 hex chars) — required by crypto tests
- `DATABASE_URL` — required if db is imported
- `AUTH_SECRET`, `AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD` — required if auth is imported
- `TUYA_STUB` — optional

The cleanest approach for integration tests: `vi.mock('~/server/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }))` and `vi.mock('~/server/db', ...)` — then env validation for auth and db modules is bypassed.

---

## Code References

- `src/server/lib/crypto.ts:1-34` — full `encryptLocalKey` / `decryptLocalKey` implementation
- `src/middleware.ts:7` — middleware matcher (what is/isn't protected)
- `src/server/api/trpc.ts:28-35` — `createTRPCContext` (session attached via `auth()`)
- `src/server/api/trpc.ts:116-127` — `enforceUserIsAuthed` + `protectedProcedure`
- `src/server/api/root.ts:10` — `createCaller` (entry point for test callers)
- `src/server/api/routers/device.ts` — `device.overview` uses `protectedProcedure`
- `src/server/workers/tuya-poller.ts:33-38` — catch block where decrypted key is in scope
- `src/server/auth.config.ts:10-12` — `authorized()` callback (`!!auth?.user`)
- `src/env.js` — Zod env validation triggered on module import
- `package.json` — `"type": "module"`, no test runner installed
- `tsconfig.json` — `moduleResolution: "Bundler"`, alias `~/*` → `./src/*`

---

## Architecture Insights

**Two-layer auth defence (correct and intentional)**:
- Layer 1: Middleware (HTTP) — redirects browsers/direct HTTP calls to `/login` before they reach tRPC
- Layer 2: `protectedProcedure` (tRPC) — independently throws UNAUTHORIZED regardless of how a call arrives (RSC server-side call, test caller, curl to `/api/trpc`)
- The test proves Layer 2 directly; Layer 1 is verified by static matcher analysis

**AES-256-GCM is self-verifying**: The auth tag in the ciphertext means any tampered input is detected by the cipher itself. No application-level integrity checks are needed. The test does not need to assert specific error types — Node.js will always throw on bad input.

**`decryptLocalKey` is a pure function** (no I/O, no side effects, no logging): ideal for pure unit tests with no mocking. Only `process.env.ENCRYPTION_SECRET` needs to be set.

**Vitest + tRPC + Next.js boundary**: `src/trpc/server.ts` is the only file in the tRPC stack that's Next.js-specific (imports `server-only`, `next/headers`). Tests import from `src/server/api/` only — this boundary is clean and avoids all Next.js server primitives.

---

## Historical Context

- `context/changes/auth-scaffold/plan.md` — Full implementation of Auth.js v5 + `protectedProcedure`. All phases complete (commits ebdd1cd → 9d420e9). Middleware matcher and `enforceUserIsAuthed` were planned and implemented exactly as found in the live code.
- `context/changes/live-device-overview/plan.md` — Established `src/server/lib/crypto.ts` as the canonical crypto module (mentioned in "Current State Analysis"), confirmed `decryptLocalKey` call in poller, seeded fixture key `'stub-local-key-0000000000000000'`. All phases complete (commits bb95a97 → 197fb0f).
- `context/foundation/lessons.md` — Two rules directly relevant: (1) `localKey` columns store AES-256-GCM ciphertext, helpers in `src/server/lib/crypto.ts`; (2) tsx scripts need `--env-file=.env` (relevant for test runner script in package.json).

---

## Open Questions

1. **Real Tuya client + key leakage**: When `real-client.ts` is implemented and begins making actual LAN calls, the catch block in `tuya-poller.ts:33-38` should be audited. If `tuyapi` throws connection errors that include the gateway `localKey` parameter, it will be logged to server console. This is not testable in Phase 1 (real client returns `[]`), but the poller's error handler should be hardened before production.

2. **`src/env.js` import in tests**: If any test transitively imports `~/server/db` or `~/server/auth`, Zod will validate all env vars at import time. Tests either need all env vars set in setup, or those modules mocked. The plan should decide once and encode it in the vitest setup file so all Phase 1 tests share the same setup convention.

3. **Vitest + `next-auth` compatibility**: `next-auth` v5 beta imports may have edge-only code paths. If tests import from `~/server/auth`, verify no edge-runtime-only module is pulled in. If it fails, mock `~/server/auth` wholesale with `vi.mock`.

4. **tRPC `timingMiddleware` in tests** (`src/server/api/trpc.ts:84-99`): In dev mode, this adds a 100–500ms artificial delay. Tests use `protectedProcedure` which chains `timingMiddleware` first. If `t._config.isDev` is true in the test environment, tests will be slow. Set `NODE_ENV=test` (or `production`) in the vitest setup to skip the delay.
