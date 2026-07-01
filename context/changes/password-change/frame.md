# Frame Brief: Password Change (Self-Service)

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

The logged-in admin cannot change their password from the UI. The only path
to change it is direct database access or re-running the seed script.

## Initial Framing (preserved)

- **User's stated cause or approach**: The feature simply doesn't exist — no UI, no procedure.
- **User's proposed direction**: Add a password change form to the Settings page.
- **Pre-dispatch narrowing**: Self-service only (logged-in admin changes their own password). No reset/recovery flow, no other-user management.

## Dimension Map

The observation could originate at any of these dimensions:

1. **No UI surface** — Settings shell has 8 cards; none addresses account/security. ← confirmed
2. **No tRPC procedure** — no `changePassword` mutation in any router. ← confirmed
3. **bcryptjs not available** — couldn't hash the new password server-side. ← ruled out (already imported)
4. **Schema not updatable** — passwordHash column is read-only or encrypted at rest. ← ruled out

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| No UI surface | `settings-shell.tsx:56–131` — 8 SettingsCards, none for account/password | STRONG |
| No tRPC procedure | `settings.ts`, all routers — zero `changePassword` or auth mutation | STRONG |
| bcryptjs not available | `auth.ts:1` — already imported; `hash()` exists in same package | NONE |
| Schema not updatable | `schema.ts:41` — `passwordHash text().notNull()` — standard Drizzle UPDATE | NONE |

## Narrowing Signals

- User confirmed: self-service only (current password required, no recovery flow).
- Single-admin flat model (`S-19` confirmed) — no per-user management surface needed.
- JWT session (`auth.ts:23`, `strategy: "jwt"`) — password change does NOT auto-invalidate the
  current token. For a single-admin LAN app this is acceptable; worth noting in plan's Non-Goals.

## Cross-System Convention

Credentials-based auth with bcrypt + a verify-then-hash change flow is the
standard pattern for NextAuth v5 credentials providers. The existing
`authorize()` logic at `auth.ts:55–58` is the direct template for the
server-side verify step.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the Settings page has no account
> section and no tRPC mutation to verify the current password and write a new
> hash — the two pieces needed for self-service password change.

The initial framing was correct — proceed with the originally proposed
direction. No reframe needed.

## Confidence

**HIGH** — both missing pieces are confirmed absent, bcrypt and schema are
already in place, scope is tightly bounded (one user, one form, one mutation).

## What Changes for /10x-plan

Add `settings.changePassword` (protectedProcedure: verify current password
via `bcryptjs.compare`, hash new via `bcryptjs.hash`, Drizzle UPDATE on
`users.passwordHash`) + a new SettingsCard in `settings-shell.tsx` with a
three-field form (current / new / confirm). JWT token invalidation is a
Non-Goal — acceptable for single-admin LAN deployment.

## References

- `src/server/auth.ts:1,40–63` — credentials provider + bcryptjs usage
- `src/server/db/schema.ts:41` — `passwordHash` column
- `src/server/api/routers/settings.ts` — home for new procedure
- `src/app/_components/setup/settings-shell.tsx:55–131` — home for new SettingsCard
