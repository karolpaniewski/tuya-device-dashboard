# Auth Scaffold — Plan Brief

> Full plan: `context/changes/auth-scaffold/plan.md`

## What & Why

Add email + password authentication to the Tuya Device Dashboard. The PRD requires a hard auth gate on all routes (FR-001, Access Control guardrail) — no unauthenticated access is permitted even from within the company LAN. This foundation must land before any user-facing slice (S-01 through S-05) to avoid retrofitting unprotected endpoints.

## Starting Point

A standard T3 scaffold with zero auth: no auth packages installed, all tRPC procedures are `publicProcedure`, no session on the tRPC context, no middleware protecting routes, and only a starter `posts` table in SQLite. The tech-stack decision declared NextAuth (`has_auth: true`) but it was never scaffolded by create-t3-app.

## Desired End State

Any route without a valid session redirects to `/login?callbackUrl=<path>`. The admin submits email + password credentials, gets a JWT session cookie, and lands on the originally requested page. Running `npm run db:seed` creates the admin account from `.env` credentials. All future slice procedures use `protectedProcedure` instead of `publicProcedure`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Auth library version | Auth.js v5 (next-auth@beta) | T3's direction; better App Router support; less boilerplate than v4 | Plan |
| Session strategy | JWT (stateless) | No sessions table needed; adequate for 2–5 users; simpler than Drizzle adapter | Plan |
| User management scope | Seed only, no registration UI | PRD implies small closed team; adding users via SQL is sufficient for MVP | Plan |
| Seed credentials | From `.env` (AUTH_ADMIN_EMAIL + AUTH_ADMIN_PASSWORD) | No secrets in source code; clean 12-factor approach | Plan |
| Password hashing | bcryptjs (pure-JS) | No native build dependencies — critical for self-hosted LAN deployment | Plan |
| Route protection | All routes except `/login` and `/api/auth/*` | Matches PRD guardrail ("no unauthenticated access"); new routes protected by default | Plan |
| Auth error UX | Redirect to `/login?error=InvalidCredentials` | Standard pattern; keeps the error signal in the URL for the server component to render | Plan |

## Scope

**In scope:**
- Install next-auth@beta and bcryptjs
- `users` table in SQLite (id, email, passwordHash, timestamps)
- Auth.js v5 Credentials provider with bcryptjs comparison
- Edge-safe config split (auth.config.ts vs auth.ts)
- Next.js middleware protecting all routes except /login
- `/login` page with server action
- `npm run db:seed` creating admin from .env
- `protectedProcedure` in tRPC
- `SessionProvider` in layout.tsx

**Out of scope:**
- User registration UI
- Role-based access control
- Removing `posts` table (F-02's job)
- OAuth / email-magic-link providers
- Session invalidation / admin panel

## Architecture / Approach

Auth.js v5 config is split: `auth.config.ts` (edge-safe, no db/bcrypt imports) is imported by middleware to gate routes; `auth.ts` (Node.js, imports Drizzle + bcryptjs) is imported by the API route and server components. JWT stored in an HttpOnly cookie. tRPC context calls `auth()` on every request. Login uses a Next.js Server Action that calls `signIn()` and redirects.

```
Browser → middleware.ts (auth.config.ts) → if no session → /login
/login form → server action (actions.ts) → signIn() → auth.ts → db lookup + bcryptjs → JWT cookie → redirect
tRPC requests → createTRPCContext → auth() → session on ctx → protectedProcedure check
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Install & env | Packages + typed env vars | Weak AUTH_SECRET (caught by min(32) validator) |
| 2. Users schema | `users` table in SQLite | Merge conflict with F-02 on schema.ts (see Migration Notes) |
| 3. Auth.js core | auth.config.ts, auth.ts, /api/auth route, SessionProvider | Edge import bleed — bcryptjs in middleware → runtime crash |
| 4. Middleware + login | Route protection + login form | Middleware matcher typo → public routes accidentally protected |
| 5. Seed + login test | End-to-end login works | Missing .env vars before seeding → descriptive error |
| 6. tRPC procedure | protectedProcedure available | auth() import in trpc.ts pulling edge-incompatible module (use server/auth.ts, not auth.config.ts) |

**Prerequisites:** Node.js dev environment, `.env` with `AUTH_SECRET` (≥32 chars), `AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD` set before Phase 5.
**Estimated effort:** ~1 focused session across 6 phases.

## Open Risks & Assumptions

- F-02 (device-schema) runs in parallel and edits `schema.ts` — merge conflict is expected; resolve by keeping both `users` (F-01) and domain tables (F-02), removing `posts`
- Auth.js v5 is still in beta — if a breaking change lands in a minor release, pin the exact version installed after Phase 1
- Self-hosted LAN deployment target (production) must have Node.js ≥18 for `crypto.randomUUID()` without a polyfill

## Success Criteria (Summary)

- Unauthenticated browser access to `/` redirects to `/login`
- Admin can log in with seeded credentials and navigate freely within the app
- `npm run typecheck` and `npm run dev` pass cleanly after each phase
