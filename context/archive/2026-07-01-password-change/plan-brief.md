# Password Change (Self-Service) — Plan Brief

> Full plan: `context/changes/password-change/plan.md`
> Frame brief: `context/changes/password-change/frame.md`

## What & Why

The logged-in admin cannot change their password from the UI — the only
path is direct database access or re-running the seed script. Add a
"Account & Security" SettingsCard with a three-field form so the admin
can change their password without touching the database.

## Starting Point

`auth.ts` already imports `bcryptjs` and uses `compare()` on every login.
`schema.ts:41` has `passwordHash text().notNull()` on the `users` table.
The `settingsRouter` has two existing `protectedProcedure` mutations for
default thresholds — the new procedure follows the same shape. No form or
mutation for password change exists anywhere.

## Desired End State

The Settings page has a new "Account & Security" card (last in the grid)
with three password fields. Correct current password + valid new (≥ 8 chars)
+ matching confirm updates `users.passwordHash` and shows a success toast;
wrong current password shows an inline form error. Subsequent logins use
the new password.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | Self-service only (no reset/recovery) | Single admin, LAN-only, no email recovery needed | Frame |
| JWT invalidation | Non-Goal | JWT is stateless; single-admin LAN risk is negligible | Frame |
| New password min length | 8 characters | Web standard, blocks trivial passwords, one simple rule | Plan |
| Confirm field | Yes — 3 fields (current / new / confirm) | Prevents typo in new password | Plan |
| Bcrypt rounds | 12 | Matches `src/server/db/seed.ts:28` — consistency | Plan |
| Error on wrong password | Inline `ErrorMessage` (not toast) | Follows `DefaultThresholdsForm` mutation error pattern | Plan |
| Location in Settings | Last card in grid | Rarely used admin action; doesn't need prominence | Plan |
| Test pattern | `createCaller` + `vi.mock("bcryptjs")` | Mirrors existing `settings.test.ts` structure | Plan |

## Scope

**In scope:** `settings.changePassword` procedure + 3 test blocks + `ChangePasswordForm`
component + new SettingsCard in `SettingsShell`

**Out of scope:** Password reset/recovery, JWT invalidation, password complexity
beyond min-8, multi-user account management

## Architecture / Approach

Four file changes, one phase. Backend: `changePassword` protectedProcedure
reads `ctx.session.user.id`, fetches user, `bcryptjs.compare` for verify,
`bcryptjs.hash(newPassword, 12)` + Drizzle UPDATE on success, `UNAUTHORIZED`
for both "not found" and "wrong password". UI: `ChangePasswordForm` follows
`DefaultThresholdsForm` — controlled state, client-side confirm-match check,
`onSuccess` toasts + clears fields, `onError` sets inline error. Wired into
`SettingsShell` as the 9th card.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend + UI | Procedure + tests + form + SettingsCard wired | None — both backend and UI patterns are established in existing files |

**Prerequisites:** None  
**Estimated effort:** ~1 session, single phase

## Open Risks & Assumptions

- After password change the current JWT remains valid until it expires — by
  design for this deployment, not an oversight

## Success Criteria (Summary)

- Correct current + valid new + matching confirm → toast success + fields clear
- Wrong current password → inline error (no server-side request reaches the DB for hash)
- New login with updated password succeeds; old password fails
