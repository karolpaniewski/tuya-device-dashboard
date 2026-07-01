# Password Change (Self-Service) — Implementation Plan

## Overview

Add a "Account & Security" card to the Settings page with a three-field
password change form (current / new / confirm). A new `settings.changePassword`
tRPC procedure verifies the current password via bcryptjs, hashes the new one
at 12 rounds (matching seed.ts), and writes it to the `users` table.

## Current State Analysis

The app uses NextAuth v5 with a credentials provider. `auth.ts` imports
`bcryptjs` and calls `bcryptjs.compare()` on every login. The `users` table
has a `passwordHash text().notNull()` column (`schema.ts:41`). The
`settingsRouter` (`settings.ts`) already has two `protectedProcedure` entries
for default thresholds — the new procedure follows the same shape. No UI
surface exists for password changes; the only path today is direct DB access
or re-running `npm run db:seed`.

## Desired End State

The Settings page has a new "Account & Security" card with three password
fields. Submitting with the correct current password and a valid new password
(≥ 8 chars, confirmed) updates `users.passwordHash` and shows a success toast.
Wrong current password shows an inline form error (no toast). Subsequent
logins use the new password.

### Key Discoveries

- `src/server/db/seed.ts:28` — `bcryptjs.hash(password, 12)` — use 12 rounds
  to match seeded hashes
- `src/server/auth.ts:55–58` — `bcryptjs.compare()` is the verify template
- `src/app/_components/setup/default-thresholds-form.tsx` — exact UI pattern:
  controlled state + `setFormError` for inline errors + `toast.success` on
  success + `<ErrorMessage variant="inline">`
- `src/server/api/routers/settings.test.ts` — exact test pattern: `createCaller`
  + mock db + `vi.mock("~/server/auth")` + `vi.mock("~/server/db")`
- `src/app/_components/setup/settings-shell.tsx:56–131` — 8 existing SettingsCards
  in a CSS grid; the new card goes last

## What We're NOT Doing

- No password reset / recovery flow (no email link, no admin override)
- No JWT invalidation after password change (acceptable for single-admin LAN
  deployment — noted in frame brief)
- No password complexity rules beyond min 8 characters
- No user management for other accounts (flat single-admin model per S-19)
- No migration — `users.passwordHash` column already exists

## Implementation Approach

Backend first, then UI. Add `changePassword` to `settingsRouter` — it reads
`ctx.session.user.id` from the JWT, fetches the user row, verifies
`currentPassword` via `bcryptjs.compare`, hashes `newPassword` via
`bcryptjs.hash(newPassword, 12)`, and writes via Drizzle UPDATE. The UI
component follows `DefaultThresholdsForm` exactly: three controlled `<Input
type="password">` fields, client-side `confirm === new` check before submit,
`<ErrorMessage>` for inline errors, `toast.success` on success, fields cleared
on success.

---

## Phase 1: Backend + UI

### Overview

Add the `changePassword` procedure with tests, build the `ChangePasswordForm`
component, and wire a new SettingsCard into `SettingsShell`. All four changes
land in one phase — they are tightly coupled and none is useful without the
others.

### Changes Required

#### 1. Add `changePassword` to settingsRouter

**File**: `src/server/api/routers/settings.ts`

**Intent**: Add a `protectedProcedure` mutation that verifies the current
password and writes a new bcrypt hash. Throw `UNAUTHORIZED` for both
"user not found" and "wrong password" — do not distinguish the two.

**Contract**: Input schema (Zod v3):
```ts
z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})
```
Imports to add: `import bcryptjs from "bcryptjs"` and `users` alongside
`defaultThresholds` in the schema import. Use `ctx.session.user.id` (string)
to query the user. On password mismatch throw
`new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" })`.
On success return `{ success: true as const }`.

#### 2. Add tests for `changePassword`

**File**: `src/server/api/routers/settings.test.ts`

**Intent**: Cover the auth gate, wrong-password path, and happy path for
`settings.changePassword`, following the existing `describe` / `createCaller`
pattern in the file.

**Contract**: Add `vi.mock("bcryptjs", ...)` at the top of the file (hoisted
alongside the existing mocks). Three new test blocks:

1. **Auth gate** — add one `it` to the existing `describe("settings — auth gate")`
   block: `settings.changePassword` throws `UNAUTHORIZED` when session is null.

2. `describe("settings.changePassword — wrong password")` — mock db returns a
   user row; mock `bcryptjs.compare` resolves `false`; assert `UNAUTHORIZED`.

3. `describe("settings.changePassword — success")` — mock db returns a user
   row; mock `bcryptjs.compare` resolves `true`; mock `bcryptjs.hash` resolves
   `"new-hash"`; mock `db.update` chain; assert `{ success: true }` and that
   the update was called with `"new-hash"`.

#### 3. Create `ChangePasswordForm` component

**File**: `src/app/_components/setup/change-password-form.tsx`

**Intent**: Three-field password form (current / new / confirm) with
client-side confirm-match validation, inline error, and success toast.
Mirrors `DefaultThresholdsForm` in structure.

**Contract**: `"use client"` directive. Controlled state: `currentPassword`,
`newPassword`, `confirmPassword` (all `useState("")`), `formError`
(`useState<string | null>(null)`). On submit: check `newPassword !== confirmPassword`
→ `setFormError("Passwords do not match")` and return. Call
`mutation.mutate({ currentPassword, newPassword })`. `onSuccess`: call
`toast.success("Password updated")` and reset all three fields to `""` and
`setFormError(null)`. `onError`: `setFormError(e.message)`. Render three
`<Input type="password">` fields (each with a `<label>` and `htmlFor`),
`<ErrorMessage message={formError} variant="inline">`, and a `<Button
disabled={mutation.isPending}>` ("Update Password" / "Saving…").

#### 4. Wire SettingsCard into SettingsShell

**File**: `src/app/_components/setup/settings-shell.tsx`

**Intent**: Add a new "Account & Security" SettingsCard as the last card in
the grid, housing `<ChangePasswordForm />`.

**Contract**: Import `Lock` from `lucide-react` (alongside existing icons).
Import `ChangePasswordForm` from `./change-password-form`. Append inside the
grid `<div>`:
```tsx
<SettingsCard
  description="Update your admin account password"
  icon={Lock}
  title="Account & Security"
>
  <ChangePasswordForm />
</SettingsCard>
```

### Success Criteria

#### Automated Verification

- `npx vitest run --reporter=verbose src/server/api/routers/settings.test.ts`
  — all tests pass including three new `changePassword` blocks
- `npm run typecheck` — no type errors
- `npx biome check src/server/api/routers/settings.ts src/server/api/routers/settings.test.ts src/app/_components/setup/change-password-form.tsx src/app/_components/setup/settings-shell.tsx`
  — no lint errors

#### Manual Verification

- Navigate to `/setup` — "Account & Security" card appears as the last card
- Submit with wrong current password → inline error "Current password is
  incorrect" appears below the form (no toast)
- Submit with new password < 8 chars → Zod client/server rejects (form error)
- Submit with mismatched confirm → inline error "Passwords do not match"
  appears without hitting the server
- Submit with correct current + valid new + matching confirm → toast "Password
  updated", all fields clear
- Log out (session expires or manual sign-out) and log in with new password → succeeds
- Log in with old password → fails

---

## Testing Strategy

### Unit Tests

All in `settings.test.ts`:
- Auth gate: unauthenticated call → UNAUTHORIZED
- Wrong current password: bcrypt.compare false → UNAUTHORIZED
- Happy path: compare true, hash called with 12 rounds, update called, returns `{ success: true }`

### Manual Testing Steps

1. Settings page shows new card
2. Wrong-password inline error (not toast)
3. Confirm-mismatch client-side error
4. Successful change + toast + field clear
5. Login with new password works; old password fails

## References

- Frame brief: `context/changes/password-change/frame.md`
- bcrypt rounds: `src/server/db/seed.ts:28` (12 rounds)
- Verify pattern: `src/server/auth.ts:55–58`
- Form pattern: `src/app/_components/setup/default-thresholds-form.tsx`
- Test pattern: `src/server/api/routers/settings.test.ts`
- SettingsCard grid: `src/app/_components/setup/settings-shell.tsx:56–131`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend + UI

#### Automated

- [x] 1.1 vitest run settings.test.ts — all tests pass incl. new changePassword blocks — 9d4fb17
- [x] 1.2 npm run typecheck — no type errors — 9d4fb17
- [x] 1.3 biome check on 4 touched files — no lint errors — 9d4fb17

#### Manual

- [x] 1.4 Account & Security card appears last in Settings grid — 9d4fb17
- [x] 1.5 Wrong current password → inline form error (no toast) — 9d4fb17
- [x] 1.6 Mismatched confirm → client-side inline error — 9d4fb17
- [x] 1.7 Valid change → toast success + fields cleared — 9d4fb17
- [x] 1.8 Login with new password succeeds; old password fails — 9d4fb17
