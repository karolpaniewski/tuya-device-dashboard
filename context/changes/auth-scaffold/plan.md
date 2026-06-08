# Auth Scaffold Implementation Plan

## Overview

Add Auth.js v5 (NextAuth) with email + password login using bcryptjs and JWT sessions. All routes are gated via Next.js middleware; unauthenticated requests redirect to `/login?callbackUrl=<path>`. A seeded admin user is created via `npm run db:seed`. tRPC gains a `protectedProcedure` requiring a valid session.

## Current State Analysis

- `package.json` — no next-auth, bcryptjs, or any auth packages installed
- `src/server/api/trpc.ts:27–32` — context returns only `{ db, headers }`; no session
- `src/server/api/trpc.ts:106` — only `publicProcedure` defined; no `protectedProcedure`
- `src/server/db/schema.ts` — only `posts` starter table; no `users` table
- `src/env.js:9–13` — no `AUTH_SECRET`, `AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD`
- No `middleware.ts` — all routes are public
- No login page or auth API route

## Desired End State

- Navigating to any route without a session redirects to `/login?callbackUrl=…`
- `/login` renders a form; submitting valid admin credentials issues a JWT session cookie and redirects to callbackUrl
- Submitting invalid credentials shows an inline error on the form — no silent failure
- `npm run db:seed` creates the admin user from env credentials
- tRPC context carries `session`; `protectedProcedure` throws `UNAUTHORIZED` if session is absent

### Key Discoveries

- `src/server/db/index.ts` — Drizzle + libsql already wired; adding a table to `schema.ts` + `npm run db:push` is enough for dev
- `src/env.js` — Zod server schema already in place; adding new fields gives runtime validation for free
- Auth.js v5 requires config split for edge middleware: bcryptjs + libsql cannot run in the Edge runtime, so `auth.config.ts` (edge-safe) and `auth.ts` (Node.js) must be separate files imported separately
- `src/app/layout.tsx` — already wraps with `<TRPCReactProvider>`; `SessionProvider` goes alongside it
- F-02 (device-schema) runs in parallel and also edits `schema.ts` — F-01 only adds `users`, does NOT remove `posts` (F-02 owns that removal)

## What We're NOT Doing

- No user registration UI — only the seeded admin can log in in MVP
- No email/magic-link or OAuth providers — Credentials only
- No role separation — flat model, all authenticated users identical
- No sessions table — JWT is stateless; no DB sessions adapter needed
- Not removing `posts` table — that belongs to F-02 (device-schema)
- No session refresh / remember-me toggle

## Implementation Approach

Auth.js v5 with Credentials provider. Config split into edge-safe `auth.config.ts` (used by middleware) and full `auth.ts` (used by the API route and server components). JWT session stored in a secure HttpOnly cookie. Login page uses a Next.js Server Action to call `signIn()`. tRPC context calls `auth()` on every request to attach the session. bcryptjs (pure-JS) for password hashing — no native build required.

## Critical Implementation Details

**Config split for edge middleware**: `src/middleware.ts` must import ONLY from `src/server/auth.config.ts` — not from `src/server/auth.ts`. Importing `auth.ts` in middleware pulls in bcryptjs and libsql which fail on the Edge runtime. The `authorized` callback in `auth.config.ts` is what middleware uses to decide allow/redirect; credential validation happens only in `authorize()` inside `auth.ts`.

**tRPC context is async**: `auth()` returns a Promise — `createTRPCContext` must `await auth()`. It is already `async` so this is safe.

---

## Phase 1: Install Packages & Configure Environment

### Overview

Install Auth.js v5 and bcryptjs, add auth-related env vars to the Zod schema and .env files. After this phase the dev server still starts and env validation passes.

### Changes Required

#### 1. Install dependencies

**File**: `package.json` (via shell)

**Intent**: Add next-auth@beta, bcryptjs, and @types/bcryptjs as dependencies.

**Contract**: Run `npm install next-auth@beta bcryptjs` and `npm install -D @types/bcryptjs`. Both `package.json` and `package-lock.json` are updated by npm.

#### 2. Extend env schema

**File**: `src/env.js`

**Intent**: Register `AUTH_SECRET`, `AUTH_ADMIN_EMAIL`, and `AUTH_ADMIN_PASSWORD` as required server-side env vars so the app fails fast with a clear message if any is missing.

**Contract**: Inside the `server: z.object({...})` block, add three fields:
- `AUTH_SECRET: z.string().min(32)` — must be at least 32 chars (prevents weak secrets)
- `AUTH_ADMIN_EMAIL: z.string().email()`
- `AUTH_ADMIN_PASSWORD: z.string().min(8)`

These belong in `server`, not `client` — they must never reach the browser.

#### 3. Update .env and .env.example

**Files**: `.env`, `.env.example`

**Intent**: Provide the three new env vars so the app starts locally and developers know what to configure.

**Contract**: Append to both files:
```
AUTH_SECRET="<generate with: openssl rand -hex 32>"
AUTH_ADMIN_EMAIL="admin@company.local"
AUTH_ADMIN_PASSWORD="change-me-on-first-login"
```
In `.env`, replace the placeholder with a real 32-byte hex string. In `.env.example`, keep the placeholder text.

### Success Criteria

#### Automated Verification

- `npm run dev` starts without env validation errors
- `npm run typecheck` passes

#### Manual Verification

- Server console shows no Zod env validation warnings on startup

**Implementation Note**: After automated verification passes, confirm manually that `npm run dev` starts cleanly before proceeding to Phase 2.

---

## Phase 2: Users Table Schema

### Overview

Add the `users` table to the Drizzle schema and push the migration to SQLite. F-01 only adds `users` — the `posts` table is left untouched (F-02 owns its removal).

### Changes Required

#### 1. Add users table to schema

**File**: `src/server/db/schema.ts`

**Intent**: Define a `users` table with fields needed by the Credentials provider: a string UUID primary key, unique email, password hash, and timestamps.

**Contract**: Add a new `createTable("user", ...)` export alongside the existing `posts` table with these columns:

| Column | Type | Constraints |
|---|---|---|
| `id` | `text(255)` | `PRIMARY KEY`, `$defaultFn(() => crypto.randomUUID())` |
| `email` | `text(255)` | `NOT NULL`, `UNIQUE` |
| `passwordHash` | `text(255)` | `NOT NULL` |
| `createdAt` | `integer({ mode: "timestamp" })` | `NOT NULL`, `default sql\`(unixepoch())\`` |
| `updatedAt` | `integer({ mode: "timestamp" })` | `$onUpdate(() => new Date())` |

Also add a named index on `email` (for the `authorize()` lookup): `createIndex("user_email_idx").on(users.email)`.

#### 2. Push schema to database

**File**: (shell command)

**Intent**: Apply the new table to the local SQLite file without creating a migration file.

**Contract**: Run `npm run db:push`. Drizzle Kit reads `schema.ts` and issues `CREATE TABLE IF NOT EXISTS` for the new `users` table.

### Success Criteria

#### Automated Verification

- `npm run db:push` exits 0
- `npm run typecheck` passes

#### Manual Verification

- Open `./db.sqlite` with any SQLite viewer (e.g. `sqlite3 db.sqlite ".tables"`); confirm `tuya_device_dashboard_user` table exists with the correct columns

**Implementation Note**: Pause for manual DB inspection before moving to Phase 3.

---

## Phase 3: Auth.js v5 Core Configuration

### Overview

Create the edge-safe auth config, the full server-side auth config with bcryptjs, and the NextAuth API route handler. Update layout.tsx with SessionProvider.

### Changes Required

#### 1. Edge-safe auth config

**File**: `src/server/auth.config.ts`

**Intent**: Define the minimal `NextAuthConfig` that is safe for the Edge runtime — no imports of bcryptjs, Drizzle, or libsql. Both middleware and `auth.ts` import from this file.

**Contract**: Export `authConfig: NextAuthConfig` with:
- `pages: { signIn: "/login" }` — use custom login page instead of Auth.js default
- `callbacks.authorized({ auth }) { return !!auth?.user }` — unauthenticated requests return false; middleware will redirect
- `providers: []` — intentionally empty; the Credentials provider with db/bcrypt goes in `auth.ts`

#### 2. Full auth configuration

**File**: `src/server/auth.ts`

**Intent**: Extend `authConfig` with the Credentials provider that validates email + password against the database using bcryptjs, and export the Auth.js v5 helpers.

**Contract**: Export `{ auth, handlers, signIn, signOut }` from `NextAuth({ ...authConfig, session: { strategy: "jwt" }, providers: [Credentials({ authorize })] })`.

The `authorize` function must:
1. Validate credentials shape with Zod (email: `z.string().email()`, password: `z.string()`) — return null on invalid shape
2. Query `db.select().from(users).where(eq(users.email, email)).limit(1)`
3. If no user row found, return `null`
4. Call `bcryptjs.compare(password, user.passwordHash)` — return `null` if false
5. Return `{ id: user.id, email: user.email }` on success

Type augmentation: declare `module "next-auth"` extending `Session["user"]` with `id: string` so `session.user.id` is typed.

#### 3. NextAuth API route

**File**: `src/app/api/auth/[...nextauth]/route.ts`

**Intent**: Wire the Auth.js v5 handlers into the Next.js App Router so `/api/auth/*` endpoints are handled by NextAuth.

**Contract**: `export const { GET, POST } = handlers` where `handlers` is imported from `~/server/auth`.

#### 4. Add SessionProvider to layout

**File**: `src/app/layout.tsx`

**Intent**: Wrap the app with `SessionProvider` so future client components can use `useSession()`.

**Contract**: Import `SessionProvider` from `next-auth/react`. Wrap `{children}` inside `<SessionProvider>` nested within the existing `<TRPCReactProvider>`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run dev` starts without runtime errors
- `GET /api/auth/providers` returns JSON containing a `credentials` entry

#### Manual Verification

- Hit `http://localhost:3000/api/auth/providers` in browser — see `{"credentials":{"id":"credentials","name":"Credentials","type":"credentials","signinUrl":...}}` in response

**Implementation Note**: Confirm `/api/auth/providers` response before proceeding.

---

## Phase 4: Middleware + Login Page

### Overview

Create the middleware that protects all routes and the login page with a server action for credential submission.

### Changes Required

#### 1. Route protection middleware

**File**: `src/middleware.ts`

**Intent**: Protect all routes except `/login`, `/api/auth/*`, and Next.js internals. The `authorized` callback in `auth.config.ts` determines allow vs. redirect. Unauthenticated requests redirect to `/login?callbackUrl=<original-path>` automatically (Auth.js v5 behaviour when `authorized` returns false).

**Contract**:
```typescript
import NextAuth from "next-auth"
import { authConfig } from "~/server/auth.config"

export default NextAuth(authConfig).auth

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)"],
}
```
This is the complete file — no additional logic needed; `authorized` in `authConfig` handles all decisions.

#### 2. Login page

**File**: `src/app/login/page.tsx`

**Intent**: Server component rendering an email + password form and an error message slot for failed login attempts.

**Contract**: A `<form action={loginAction}>` with `name="email"` (type="email") and `name="password"` (type="password") inputs and a submit button. Read `searchParams.error` — if present (e.g. `"InvalidCredentials"`), display a visible error message above the form. The page must be a Server Component (no `"use client"`). No redirect here — the server action handles navigation.

#### 3. Login server action

**File**: `src/app/login/actions.ts`

**Intent**: Server action that calls `signIn("credentials", ...)` and redirects to callbackUrl on success, or returns an error signal on failure.

**Contract**: `"use server"` async function `loginAction(formData: FormData)`. Steps:
1. Extract `email` and `password` from `formData`
2. Extract `callbackUrl` from `formData` (hidden input, default `"/"`)
3. Call `await signIn("credentials", { email, password, redirect: false })`
4. On success: call `redirect(callbackUrl)`
5. On `AuthError` (wrong credentials): `redirect("/login?error=InvalidCredentials")`

Wrap the `signIn` call in try/catch — Auth.js v5 throws on failure rather than returning an error value.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes

#### Manual Verification

- `http://localhost:3000/` redirects to `/login`
- `/login` renders a form with email and password fields
- Submitting empty or wrong credentials shows an inline error message — no crash, no redirect to non-login page

**Implementation Note**: Confirm all three manual checks before proceeding to Phase 5.

---

## Phase 5: Admin Seed Script + End-to-End Login

### Overview

Create the seed script that reads admin credentials from env, hashes the password, and upserts the user. Verify the full login flow end-to-end.

### Changes Required

#### 1. Seed script

**File**: `src/server/db/seed.ts`

**Intent**: Read `AUTH_ADMIN_EMAIL` and `AUTH_ADMIN_PASSWORD` from `process.env`, hash the password with bcryptjs (cost factor 12), and upsert the admin user into the `users` table.

**Contract**:
1. Read `email` and `password` from `process.env` — throw a descriptive error if either is missing
2. Call `bcryptjs.hash(password, 12)` → `passwordHash`
3. `db.insert(users).values({ id: crypto.randomUUID(), email, passwordHash }).onConflictDoUpdate({ target: users.email, set: { passwordHash, updatedAt: new Date() } })`
4. Log `"✓ Seeded admin user: <email>"` on success and call `process.exit(0)`

The upsert ensures re-running seed updates the password without creating duplicates.

#### 2. Add db:seed script

**File**: `package.json`

**Intent**: Add a `db:seed` npm script so any developer can create the admin user with one command.

**Contract**: In the `scripts` object, add: `"db:seed": "tsx src/server/db/seed.ts"`.

### Success Criteria

#### Automated Verification

- `npm run db:seed` exits 0 and prints the success log line

#### Manual Verification

- `db.sqlite` contains one row in `tuya_device_dashboard_user` with the configured email
- Navigate to `http://localhost:3000/` — redirected to `/login`
- Submit admin email + password from `.env` — redirected to `/` with active session (no redirect loop)
- Browser DevTools → Application → Cookies — `authjs.session-token` cookie exists (HttpOnly)
- Navigate to `http://localhost:3000/devices` (nonexistent) — redirected to `/login?callbackUrl=%2Fdevices`, then after login redirected back to `/devices` (404 is fine; proves callbackUrl works)

**Implementation Note**: All five manual checks must pass before Phase 6.

---

## Phase 6: tRPC Protected Procedure

### Overview

Add `session` to the tRPC context and introduce `protectedProcedure`. All future slice procedures use `protectedProcedure` instead of `publicProcedure`.

### Changes Required

#### 1. Add session to tRPC context

**File**: `src/server/api/trpc.ts`

**Intent**: Call `auth()` inside `createTRPCContext` so every tRPC handler knows who is calling it.

**Contract**: Add `import { auth } from "~/server/auth"` at the top of the file. Inside `createTRPCContext`, call `const session = await auth()` and include `session` in the returned object. The context type expands to `{ db, session, headers }`.

#### 2. Add protectedProcedure

**File**: `src/server/api/trpc.ts`

**Intent**: Export a `protectedProcedure` that throws `UNAUTHORIZED` if the session or session.user is absent. All subsequent slice procedures use this instead of `publicProcedure`.

**Contract**: After the existing `publicProcedure` definition, add:
```typescript
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { session: { ...ctx.session, user: ctx.session.user } },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);
```
The re-spread of `ctx` in `next()` narrows the session type so `ctx.session.user` is non-nullable inside protected procedures.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run dev` starts without runtime errors

#### Manual Verification

- While logged in: the existing home page (using `post.getLatest`) still loads without errors
- Clear `authjs.session-token` cookie — navigating to home page redirects to `/login`

---

## Testing Strategy

### Manual Testing Steps (end-to-end)

1. Clear all cookies, navigate to `http://localhost:3000/` — should redirect to `/login`
2. Submit wrong credentials — inline error shown, no redirect, no crash
3. Submit correct admin credentials from `.env` — redirect to `/`
4. Confirm `authjs.session-token` cookie in DevTools (HttpOnly)
5. Close and reopen browser tab — session persists (cookie still there)
6. Manually delete `authjs.session-token` cookie — redirect to `/login`
7. Log in again, navigate to `/devices` (any protected nonexistent route) — 404 but no redirect to login (session is valid)

## Migration Notes

F-02 (device-schema) runs in parallel and also modifies `src/server/db/schema.ts`. Merge conflict is confined to that one file. Resolve by keeping both: `users` (F-01) and `rooms`, `devices`, `device_room_assignments`, `room_thresholds` (F-02), removing `posts`. No data migration needed — SQLite is dev-only at this stage.

## References

- Roadmap item: `context/foundation/roadmap.md` — F-01 (auth-scaffold)
- PRD: `context/foundation/prd.md` — FR-001, Access Control section
- Change identity: `context/changes/auth-scaffold/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Install Packages & Configure Environment

#### Automated

- [x] 1.1 `npm run dev` starts without env validation errors — ebdd1cd
- [x] 1.2 `npm run typecheck` passes — ebdd1cd

#### Manual

- [x] 1.3 Server console shows no Zod env validation warnings on startup — ebdd1cd

### Phase 2: Users Table Schema

#### Automated

- [x] 2.1 `npm run db:push` exits 0 — c6bd643
- [x] 2.2 `npm run typecheck` passes — c6bd643

#### Manual

- [x] 2.3 `tuya_device_dashboard_user` table visible in db.sqlite with correct columns — c6bd643

### Phase 3: Auth.js v5 Core Configuration

#### Automated

- [x] 3.1 `npm run typecheck` passes
- [x] 3.2 `npm run dev` starts without runtime errors
- [x] 3.3 `GET /api/auth/providers` returns JSON with credentials provider

#### Manual

- [x] 3.4 `/api/auth/providers` in browser shows credentials provider

### Phase 4: Middleware + Login Page

#### Automated

- [ ] 4.1 `npm run typecheck` passes

#### Manual

- [ ] 4.2 `http://localhost:3000/` redirects to `/login`
- [ ] 4.3 `/login` renders form with email + password fields
- [ ] 4.4 Empty / wrong submit shows inline error, no crash

### Phase 5: Admin Seed Script + End-to-End Login

#### Automated

- [ ] 5.1 `npm run db:seed` exits 0 with success log

#### Manual

- [ ] 5.2 Admin row visible in db.sqlite
- [ ] 5.3 Login with admin credentials succeeds, redirected to `/`
- [ ] 5.4 `authjs.session-token` cookie present in DevTools (HttpOnly)
- [ ] 5.5 callbackUrl redirect works (visit `/devices` → login → back to `/devices`)

### Phase 6: tRPC Protected Procedure

#### Automated

- [ ] 6.1 `npm run typecheck` passes
- [ ] 6.2 `npm run dev` starts without runtime errors

#### Manual

- [ ] 6.3 Logged-in: home page with `post.getLatest` still loads without errors
- [ ] 6.4 No-cookie state: home page redirects to `/login`
