# External Notifications (S-10) Implementation Plan

## Overview

Adds email alerting when a room's comfort-threshold badge transitions into a violated state (Too Cold/Too Hot), so the facility team learns about it without watching the dashboard. New: a settings-managed contact list, a poller-driven alert-detection state machine, and an outbound email integration (Resend) — fully additive to the existing S-05 threshold/badge logic.

## Current State Analysis

- Badge computed on-demand (`scoreRoom()`, `src/server/lib/scoring.ts:15`) — no transition tracking, no outbound signal.
- Poller (`tuya-poller.ts`'s `pollOnce()`, every 30s) is the only place that runs independent of dashboard views — the natural hook for transition detection.
- No outbound integration of any kind exists; no `roomAlertState`-like persistence for this purpose.
- `settingsRouter` (`settings.ts`) holds app-wide config (default thresholds) — contacts deserve their own router given the distinct domain.
- Established patterns to reuse exactly: `roomHeatState` (per-room singleton DB row) → model for `roomAlertState`; `site.ts` CRUD router + `site-manager.tsx` UI → model for contacts; `getTuyaClient()` real/stub factory → model for the email client; `mode-control.ts`/`mode-control.test.ts` → model for the alert-control state machine and its tests; `logger.ts`'s `redact.paths` → model for protecting contact emails from logs.

## Desired End State

- Admin manages a list of email contacts in Settings.
- When any room's badge transitions OK→(Too Cold|Too Hot), the room enters a "pending alert" state; the next poll tick (≤30s later) sends one batched email to all contacts listing every room that's newly pending, then marks each as sent.
- A room that's already in a violated state, or that flips directly between Too Cold and Too Hot without passing through OK, does not trigger a second alert for the same episode.
- A failed send leaves the room "pending" so the next tick retries, picking up any newly-violated rooms in the same batch.
- The dashboard badge shows a small "alert sent" icon for any room with an active, already-notified violation.
- Verification: manually cross a demo room's threshold (via Settings, with `TUYA_STUB`), observe an email arrive (or, with `EMAIL_STUB=true`, a structured stub log entry) within ~30s, and the dashboard badge gain the alert-sent icon.

### Key Discoveries

- `src/server/lib/scoring.ts:15` — `scoreRoom()` is pure/stateless; badge is computed fresh on every `device.overview` call, never persisted. This is why detection must live in the poller, not the API layer.
- `src/server/workers/tuya-poller.ts:19-111` (`pollOnce`) — already the single place that runs independent of any dashboard view, every 30s, registered once at server start via `src/instrumentation.ts:1-11`.
- `src/server/db/schema.ts:232-253` (`roomHeatState`) — exact shape to mirror for a new per-room singleton state table.
- `src/server/lib/mode-control.ts` + `src/server/lib/mode-control.test.ts` — exact pattern to mirror for a new business-logic module with full unit-test coverage via mocked `~/server/db`.
- `src/server/lib/tuya/index.ts:6-8` (`getTuyaClient`) — exact env-flag-driven real/stub client factory pattern to mirror for email.
- `src/server/lib/logger.ts:11-21` (`redact.paths`) — exact place to add defensive redaction for contact emails.
- `src/app/_components/room-group.tsx:209-218` — exact badge-render location; icons elsewhere in this file use `<Icon size={14} />` (e.g. `Flame` at line 73/89).
- `src/server/api/routers/device.ts:428-452` — `device.overview`'s per-room scoring loop; `alertSent` joins in here.
- `src/server/auth.ts:19` — `z.string().email()` is this codebase's established Zod email-validation convention.

## What We're NOT Doing

- SMS or push notifications (explicitly deferred — PRD Non-Goals).
- Per-room or per-threshold recipient targeting — one global contact list (PRD Non-Goals).
- An alert history/log screen — the only signals are the email itself and the badge's "alert sent" icon (PRD Non-Goals).
- A time-based reminder/escalation for an ongoing violation — one alert per episode only (PRD Non-Goals, FR-003).
- Multi-user accounts or role changes for contacts — contacts are a flat settings list, not identities (PRD Access Control Changes).
- A custom in-app scroll/anchor system beyond a plain HTML `id` anchor for the "open dashboard at this room" email link — no new client-side routing or query-param deep-linking.
- Migrating or backfilling any existing data — this is purely additive (two new tables, no changes to existing table shapes beyond one new derived field surfaced in an existing query).

## Implementation Approach

Treat alert detection as a new, independently-testable business-logic module (`alert-control.ts`) that mirrors `mode-control.ts`'s shape: an async function taking no external parameters (reads its own dependencies from the DB, exactly like `applyModeToRooms` does), called once per poll tick from `tuya-poller.ts`. Persist per-room alert state in a new table (`roomAlertState`) so episodes survive server restarts and are queryable by the existing `device.overview` procedure for the UI indicator. Build the email-sending capability as a real/stub-swappable client (mirroring the Tuya client factory) so the whole feature is testable and demoable without a live Resend account. Keep contact management as its own small CRUD router + Settings UI section, fully independent of the alerting logic — it can be built, tested, and used (to populate the list) before alerting exists at all.

## Critical Implementation Details

**State machine — episode boundary is OK, not badge equality.** A room's `roomAlertState.lastBadge` only resets (and thus allows a fresh alert) when the *computed* badge is `"OK"` (or `null` — treat null/no-threshold the same as OK for this state machine). A direct transition between `"Too Cold"` and `"Too Hot"` *without* an intervening `"OK"` tick must update `lastBadge` (so a later return-to-OK is still detected correctly) but must **not** create a new episode or trigger a second email — `enteredAt`/`notifiedAt` carry over unchanged. This is a direct, literal reading of FR-003 ("no further alert ... until the room returns to OK and violates again") and is easy to get wrong if an implementer assumes "any badge change re-alerts."

**Batch boundary is one poll tick, not a time window.** "Batched" (the chosen design) means: each call to `detectAndDispatchAlerts()` collects every room currently in `lastBadge != 'OK'` AND `notifiedAt IS NULL` (newly-entered this tick, or still-pending from a previous failed send) and sends exactly one email listing all of them. There is no debounce window beyond the natural 30s poll cadence — two rooms violating 40 seconds apart land in two separate emails (two different ticks), not one.

**Failure handling keeps the episode "pending," not "sent."** If the email client throws, do not set `notifiedAt`. The next poll tick will include the same room(s) again automatically — no separate retry/backoff bookkeeping needed beyond what `roomAlertState.notifiedAt IS NULL` already expresses. Zero contacts configured is handled identically: skip the actual send (nothing to call), leave `notifiedAt` null, and the room becomes part of the batch the moment a contact is added.

## Phase 1: Data model

### Overview

Add the two new tables this feature needs: a contact list and per-room alert-episode state. Purely additive — no existing table changes.

### Changes Required:

#### 1. Drizzle schema

**File**: `src/server/db/schema.ts`

**Intent**: Add `notificationContacts` (flat list of email addresses, admin-managed) and `roomAlertState` (per-room singleton tracking the current/last badge, when the active episode started, and when it was last successfully notified).

**Contract**:
- `notificationContacts`: `id` (uuid PK, `$defaultFn`), `email` (text, `unique()`, validated at the router layer with `z.string().email()`), `createdAt` (timestamp default `unixepoch()`). Mirror `sites` table's column style exactly.
- `roomAlertState`: `id` (uuid PK), `roomId` (text, `unique()`, FK → `rooms.id`, `onDelete: "cascade"` — mirror `roomHeatState` exactly), `lastBadge` (text, `check` constrained to `IN ('OK', 'Too Cold', 'Too Hot')`, default `'OK'`), `enteredAt` (nullable timestamp — when the current non-OK episode started), `notifiedAt` (nullable timestamp — when the email for this episode last succeeded), `createdAt`/`updatedAt` (mirror `roomHeatState`'s timestamp columns exactly, including `$onUpdate`).

#### 2. Migration

**File**: `drizzle/` (generated)

**Intent**: Generate and commit the migration for the two new tables.

**Contract**: Run `npm run db:generate`, inspect the generated SQL for sanity (two `CREATE TABLE` statements, no `ALTER` on existing tables), then `npm run db:migrate` against the local dev DB.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck`
- Migration generates cleanly with no unexpected diffs: `npm run db:generate` (review output, no changes to existing tables)
- Migration applies cleanly: `npm run db:migrate`
- Lint passes: `npm run check`

#### Manual Verification:

- Open `drizzle/meta/` and confirm only the two new tables appear in the new snapshot diff
- Inspect the local `db.sqlite` (e.g. via `npm run db:studio`) and confirm both tables exist with the expected columns

---

## Phase 2: Contact management (backend + UI)

### Overview

A small CRUD surface for the admin-managed contact list — usable and testable independent of the alerting logic that will later read from it.

### Changes Required:

#### 1. tRPC router

**File**: `src/server/api/routers/notification.ts` (new)

**Intent**: `list` / `create` / `delete` procedures for `notificationContacts`, following `site.ts`'s exact shape (no `rename` — an email contact is removed and re-added, not edited, since there's no meaningful "rename" for an email address).

**Contract**: `create` input `z.object({ email: z.string().email() })`; on a unique-constraint violation, surface `TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_CONTACT" })` (mirror `site.ts`'s `INSERT_FAILED`/`NOT_FOUND` error-surfacing style). `delete` input `z.object({ id: z.string() })`. `list` returns `{ id, email, createdAt }[]` ordered by `createdAt` ascending.

#### 2. Router registration

**File**: `src/server/api/root.ts`

**Intent**: Register the new router.

**Contract**: Add `notification: notificationRouter` to `appRouter`'s definition (alphabetical placement among existing entries).

#### 3. Settings UI component

**File**: `src/app/_components/setup/notification-contacts-manager.tsx` (new)

**Intent**: List + add-form + delete, mirroring `site-manager.tsx`'s structure exactly (list with delete buttons, single-input add form, `sonner` toasts on success, `ErrorMessage` banner on mutation error — surface the router's `DUPLICATE_CONTACT` error as "This email is already in the list."). No rename/edit affordance (matches the router).

**Contract**: Props `{ utils: ReturnType<typeof api.useUtils> }` (matches `SiteManager`'s prop shape). Add-form input uses `type="email"` with the same controlled-input pattern as `site-manager.tsx`'s name input — no extra client-side regex needed beyond native `type="email"` plus the server's `z.string().email()` as the source of truth (avoids duplicating the lesson about native input quirks, since this isn't a numeric/time field).

#### 4. Wire into Settings shell

**File**: `src/app/_components/setup/settings-shell.tsx`

**Intent**: Add a new `SettingsCard` for the contacts manager.

**Contract**: New card using `Mail` from `lucide-react`, title "Notification Contacts", description "Email addresses alerted when a room's comfort threshold is violated", placed after the existing "Default Thresholds" card. Needs `api.notification.list.useQuery()` wired in (either prefetched alongside the existing site/room/device queries at the top of `SettingsShell`, or queried directly inside the new manager component — follow whichever existing card already self-queries, e.g. `DisplaySettings`, rather than the prefetch-at-shell-level pattern used for rooms/devices, since contacts aren't needed by any other card).

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck`
- Unit tests pass: `npm run test` (new `src/server/api/routers/notification.test.ts`, mirroring `site.test.ts`: list empty/non-empty, create success, create duplicate-email rejection, delete success, delete non-existent)
- Lint passes: `npm run check`

#### Manual Verification:

- In Settings, add a valid email — it appears in the list and a success toast shows
- Attempt to add a malformed email — rejected with a visible error, nothing added
- Attempt to add a duplicate email — rejected with "already in the list" error
- Delete a contact — it disappears, success toast shows
- Reload the page — the list persists (confirms DB persistence, not local state)

---

## Phase 3: Email client abstraction

### Overview

A real/stub-swappable email-sending capability, mirroring the existing Tuya client factory, so the feature is fully testable and demoable without a live Resend account.

### Changes Required:

#### 1. Client interface + implementations

**Files**: `src/server/lib/email/types.ts`, `src/server/lib/email/real-client.ts`, `src/server/lib/email/stub-client.ts`, `src/server/lib/email/index.ts` (all new)

**Intent**: Define one `sendAlertEmail` capability with a real implementation (Resend SDK) and a stub (structured log only, no network call), selected by an env flag — mirror `src/server/lib/tuya/index.ts`'s `getTuyaClient()` factory exactly.

**Contract**: `EmailClient.sendAlertEmail(params: { violations: { roomId: string; roomName: string; badge: "Too Cold" | "Too Hot" }[] }): Promise<void>`. `getEmailClient()` returns the stub when `process.env.EMAIL_STUB === "true"`, else the real client. The stub logs `{ roomCount: params.violations.length }` via `getLogger()` — never log `params` directly or any contact address (there are none in this payload by design — recipients are resolved by the caller, not passed into the client). The real client calls Resend with `EMAIL_FROM` as sender and the room list rendered into a short HTML/text body, each room's name as a link to `${APP_BASE_URL}/#room-${roomId}`.

#### 2. Environment variables

**Files**: `src/env.js`, `.env.example`

**Intent**: Add the new server env vars the email client and link-building need.

**Contract**: `RESEND_API_KEY: z.string().optional()` (required only when not stubbed — validated at call time in `real-client.ts`, not at the env-schema level, since `EMAIL_STUB` makes it conditionally optional and `t3-env` schemas don't easily express that conditional), `EMAIL_FROM: z.string().email().optional()`, `EMAIL_STUB: z.string().optional()` (mirror `TUYA_STUB`'s pattern exactly — string `"true"`/unset, not boolean), `APP_BASE_URL: z.string().url().optional()` (used to build the room-anchor link; when unset, the real client omits the link rather than emitting a broken one). Add all four to `runtimeEnv` and document them in `.env.example` under a new `# Notifications` section, following the existing `# Observability` section's comment style.

#### 3. Logger redaction

**File**: `src/server/lib/logger.ts`

**Intent**: Defensively redact contact emails if they ever end up in a logged object, matching the existing `localKey`/`passwordHash` defensive posture.

**Contract**: Add `"*.email"` and `"*.contactEmail"` to `redact.paths`.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck`
- Lint passes: `npm run check`
- Full CI gate passes: `npm run ci`

#### Manual Verification:

- With `EMAIL_STUB=true`, calling the client (e.g. via a throwaway script or the next phase's manual test) logs a structured line with `roomCount` and no email addresses, no network call made
- With `RESEND_API_KEY` set to a real (sandbox/test) key and `EMAIL_STUB` unset, a manually-triggered send actually delivers an email

---

## Phase 4: Alert detection & dispatch

### Overview

The state machine: detect badge transitions per poll tick, persist episode state, batch-dispatch one email per tick for every newly-pending room, and wire it into the existing poller.

### Changes Required:

#### 1. Alert control module

**File**: `src/server/lib/alert-control.ts` (new)

**Intent**: `detectAndDispatchAlerts()` — for every room with a sensor and a configured threshold (default or per-room), compute the current badge via the existing `scoreRoom()`, compare against `roomAlertState.lastBadge`, update state per the rules in "Critical Implementation Details" above, collect the set of rooms that are `lastBadge != 'OK'` AND `notifiedAt IS NULL`, and — if non-empty and at least one contact exists — call `getEmailClient().sendAlertEmail()` with that batch, setting `notifiedAt = now()` for all included rooms on success.

**Contract**: Mirror `mode-control.ts`'s structure: a DB-backed async function, no parameters (reads rooms/thresholds/contacts itself, same as `applyModeToRooms` reads `roomHeatState`/`deviceRoomAssignments` itself), wrapped per-room in the same try/catch-and-log-don't-throw style `tuya-poller.ts` already uses elsewhere, so one bad row never aborts the whole tick.

#### 2. Wire into the poller

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: Call the new detection function once per tick, after temperature readings are written.

**Contract**: At the end of `pollOnce()` (after the existing `db.insert(deviceTemperatureReadings)` block, alongside the retention-purge step), add an awaited call to `detectAndDispatchAlerts()` wrapped in try/catch logging on failure — same pattern as the surrounding code. No fire-and-forget needed: this loop issues no device-control commands, so the FR-006 guardrail (notifications must never block device control) isn't implicated by a sequential await here.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck`
- Unit tests pass: `npm run test` (new `src/server/lib/alert-control.test.ts`, mirroring `mode-control.test.ts`'s mocking style, covering: OK→Too Cold creates a pending episode and sends; already-pending room is included in the next tick's batch on retry after a simulated send failure; Too Cold→Too Hot direct transition does NOT re-send; violated→OK resets the row; zero contacts configured leaves the room pending with no client call; two rooms violating in the same tick produce exactly one `sendAlertEmail` call with both)
- `tuya-poller.test.ts` still passes with the new call mocked (extend the existing test file rather than duplicating poller setup)
- Lint passes: `npm run check`
- Full CI gate passes: `npm run ci`

#### Manual Verification:

- With `EMAIL_STUB=true` and `TUYA_STUB=true`, lower a demo room's max threshold below its current stub temperature reading via Settings, wait up to 30s, and confirm a structured stub-send log line appears with the expected room count
- Raise the threshold back above the reading (room returns to OK), then lower it again — confirm a second stub-send log line appears (new episode, not suppressed)
- With a real `RESEND_API_KEY`, repeat the cold-threshold test and confirm an actual email arrives within ~1 minute, naming the room and threshold

---

## Phase 5: Dashboard "alert sent" indicator

### Overview

Surface whether a room's active violation has already been notified, so an admin glancing at the dashboard doesn't duplicate the alert's job.

### Changes Required:

#### 1. Surface `alertSent` from the overview query

**File**: `src/server/api/routers/device.ts`

**Intent**: Join `roomAlertState` into the existing per-room scoring loop and add a boolean field.

**Contract**: Alongside the existing `heatStateMap` query (~line 390), add a `roomAlertState` query and map; in the `scoredRooms` map (~line 428-452), add `alertSent: alertStateMap.get(room.roomId)?.notifiedAt != null` to the returned object (same spread style as `...heatState`).

#### 2. Thread the prop through

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Pass `alertSent` to every `RoomGroup` call site.

**Contract**: Add `alertSent={room.alertSent}` at all three existing `<RoomGroup ... />` invocations (the two inside `SortableRoomGroup` blocks and the plain one), matching the existing prop-passing style (e.g. `badge={room.badge}`).

#### 3. Render the indicator + room anchor

**File**: `src/app/_components/room-group.tsx`

**Intent**: Show a small icon next to the badge when `alertSent` is true; add an HTML anchor id so the email's `#room-<id>` link resolves.

**Contract**: Add `alertSent?: boolean` to `RoomGroupProps`. In the badge row (~line 209-218), render a `<Mail size={14} />` (or similar lucide icon distinct from `Flame`) immediately after the badge when `alertSent` is true, following the existing `<Icon size={14} />` convention. Add `id={`room-${roomId}`}` to the outer `<section>` (~line 191) so the email link's URL hash scrolls there natively — no new JS.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck`
- Unit tests pass: `npm run test` (extend `device.test.ts` to assert `alertSent` is present and correctly derived from a mocked `roomAlertState` row)
- Lint passes: `npm run check`
- Full CI gate passes: `npm run ci`

#### Manual Verification:

- After Phase 4's manual test sends a stub/real alert, reload the dashboard and confirm the affected room's badge now shows the alert-sent icon
- Confirm the icon disappears once the room returns to OK (new episode reset)
- Confirm mobile/375px layout (S-08 guardrail) is not disrupted by the added icon — check via browser devtools responsive mode

---

## Testing Strategy

### Unit Tests:

- `alert-control.test.ts`: the full state-machine matrix (see Phase 4) — this is the highest-value test in the plan, since the episode/batching rules are the easiest part to get subtly wrong.
- `notification.test.ts`: CRUD + duplicate-email + not-found paths, mirroring `site.test.ts`.
- Extend `device.test.ts`: `alertSent` derivation.
- Extend `tuya-poller.test.ts`: the new call is made once per `pollOnce()` and a thrown error from it doesn't abort the rest of the tick.

### Integration Tests:

- None beyond the existing Vitest unit-test layer — no E2E test is in scope for this change (no new browser-only risk; the contact-management UI is a standard form/list pattern already covered by manual verification, and the alerting path has no UI surface to drive in a browser test).

### Manual Testing Steps:

1. Add/remove contacts in Settings; confirm validation and persistence (Phase 2).
2. With `EMAIL_STUB=true`, force a threshold violation via Settings and confirm a stub log line within 30s (Phase 4).
3. Confirm a second violation right after returning to OK re-sends; confirm staying in the same violated state, or flipping Too Cold↔Too Hot without an OK in between, does not re-send (Phase 4).
4. With a real `RESEND_API_KEY`, confirm an actual email arrives, contains the room name/threshold, and its link scrolls to the right room on the dashboard (Phase 4/5).
5. Confirm the dashboard badge shows the alert-sent icon after a real send, and that it clears on the next OK transition (Phase 5).
6. Confirm a sustained check that valve control (setpoint changes, room-heat-toggle) is unaffected in timing or behavior while alerts are firing (guardrail FR-006).

## Performance Considerations

Each poll tick now does one additional pass over rooms-with-thresholds (a handful of rows at this app's scale — PRD `target_scale`: small) plus, only on a state change, one outbound HTTP call to Resend. No impact on the 30s polling cadence is expected; the existing `pollOnce()` already performs multiple sequential DB queries and external calls per tick.

## Migration Notes

Purely additive — two new tables, no changes to existing table shapes. No backfill: `roomAlertState` rows are created lazily on first poll tick after deploy (every room starts at the implicit `lastBadge: 'OK'` default, so no historical violation retroactively fires an alert on first deploy).

## References

- PRD: `context/foundation/prd-v6.md`
- Shape notes: `context/foundation/shape-notes.md`
- Stack assessment: `context/foundation/stack-assessment.md`
- Health check: `context/foundation/health-check.md`
- Pattern reference (state machine + tests): `src/server/lib/mode-control.ts`, `src/server/lib/mode-control.test.ts`
- Pattern reference (real/stub client factory): `src/server/lib/tuya/index.ts`
- Pattern reference (per-room singleton state): `src/server/db/schema.ts:232-253` (`roomHeatState`)
- Pattern reference (settings CRUD): `src/server/api/routers/site.ts`, `src/app/_components/setup/site-manager.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model

#### Automated

- [x] 1.1 Typecheck passes — ab5319d
- [x] 1.2 Migration generates cleanly with no unexpected diffs — ab5319d
- [x] 1.3 Migration applies cleanly — ab5319d
- [x] 1.4 Lint passes — ab5319d

#### Manual

- [x] 1.5 New tables appear in the new snapshot diff — ab5319d
- [x] 1.6 Local db.sqlite shows both tables with expected columns — ab5319d

### Phase 2: Contact management (backend + UI)

#### Automated

- [x] 2.1 Typecheck passes — b5d79b1
- [x] 2.2 Unit tests pass (notification.test.ts) — b5d79b1
- [x] 2.3 Lint passes — b5d79b1

#### Manual

- [x] 2.4 Add valid email — appears in list, success toast — b5d79b1
- [x] 2.5 Malformed email rejected — b5d79b1
- [x] 2.6 Duplicate email rejected — b5d79b1
- [x] 2.7 Delete contact works — b5d79b1
- [x] 2.8 List persists across reload — b5d79b1

### Phase 3: Email client abstraction

#### Automated

- [x] 3.1 Typecheck passes
- [x] 3.2 Lint passes
- [x] 3.3 Full CI gate passes

#### Manual

- [x] 3.4 EMAIL_STUB=true logs structured line, no network call, no PII
- [ ] 3.5 Real RESEND_API_KEY sends an actual email (deferred — needs a real Resend account)

### Phase 4: Alert detection & dispatch

#### Automated

- [ ] 4.1 Typecheck passes
- [ ] 4.2 Unit tests pass (alert-control.test.ts)
- [ ] 4.3 tuya-poller.test.ts still passes with new call mocked
- [ ] 4.4 Lint passes
- [ ] 4.5 Full CI gate passes

#### Manual

- [ ] 4.6 Stub send fires within 30s of crossing threshold
- [ ] 4.7 Second episode after returning to OK re-sends
- [ ] 4.8 Real send delivers an actual email

### Phase 5: Dashboard "alert sent" indicator

#### Automated

- [ ] 5.1 Typecheck passes
- [ ] 5.2 Unit tests pass (device.test.ts alertSent coverage)
- [ ] 5.3 Lint passes
- [ ] 5.4 Full CI gate passes

#### Manual

- [ ] 5.5 Badge shows alert-sent icon after a send
- [ ] 5.6 Icon clears on next OK transition
- [ ] 5.7 Mobile/375px layout unaffected
