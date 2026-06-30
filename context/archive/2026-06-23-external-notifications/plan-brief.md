# External Notifications (S-10) — Plan Brief

> Full plan: `context/changes/external-notifications/plan.md`

## What & Why

Admin team currently learns about a room going too cold/too hot only by looking at the dashboard. This change adds an email alert when a room's comfort badge transitions into a violated state, so the team finds out without watching the screen — fixing the gap between "room out of range" and "someone notices."

## Starting Point

The room comfort badge (OK / Too Cold / Too Hot) already exists (S-05) but is computed fresh, on-demand, every time the dashboard is queried — there's no persisted "did this room already violate" state, and no outbound signal exists anywhere in the app yet.

## Desired End State

Admin maintains a list of email contacts in Settings. When a room crosses its threshold, the team gets one email within ~30s naming the room — exactly once per violation episode, not once per fluctuation. The dashboard badge gains a small icon showing "this room's active violation was already emailed."

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Transition detection location | Poller (`tuya-poller.ts`), not the dashboard query | Badge is computed stateless/on-demand today — detection must run independent of anyone looking at the dashboard | Plan |
| Episode persistence | New DB table (`roomAlertState`), mirrors `roomHeatState` | Must survive server restarts and be queryable for the UI indicator | Plan |
| Email provider | Resend | Simplest setup for a 2-5 person team, no SMTP relay needed | User (this session) |
| Multi-room batching | One email per poll tick listing all newly-violated rooms | User preference over PRD's literal per-room wording; still respects "one alert per episode" per room | User (this session) |
| Send failure handling | Room stays "pending," retried next tick | A transient provider outage must not silently swallow the one alert that matters | User (this session) |
| Cold↔Hot direct transition | Does NOT count as a new episode | Literal reading of FR-003 — only a return to OK starts a fresh episode | Plan (PRD-derived) |
| Badge indicator style | Small icon next to existing badge | Minimal layout impact, consistent with existing `<Icon size={14}/>` convention | User (this session) |
| Email→dashboard link | Plain `#room-<id>` HTML anchor | Fulfills FR-004 with zero new JS/routing | Plan |

## Scope

**In scope:** contact list CRUD + Settings UI; poller-driven violation detection with episode tracking; batched email send via Resend (real/stub swappable); dashboard "alert sent" badge icon; room anchor link in the email.

**Out of scope:** SMS/push, per-room recipient targeting, alert history screen, reminder/escalation for ongoing violations, any change to existing threshold/badge calculation logic.

## Architecture / Approach

New `alert-control.ts` (mirrors `mode-control.ts`) runs once per 30s poll tick: computes each room's badge via the existing `scoreRoom()`, compares to persisted state in `roomAlertState`, and batches every newly-pending room into one `getEmailClient().sendAlertEmail()` call. Contacts are a separate, independent CRUD slice (`notification.ts` router + Settings card) that the alert path simply reads from.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Data model | `notificationContacts` + `roomAlertState` tables | Low — purely additive migration |
| 2. Contact management | CRUD router + Settings UI for the contact list | Low — standard list-CRUD pattern already used 3x in this codebase |
| 3. Email client abstraction | Real/stub Resend client, env vars, log redaction | Medium — first outbound integration in this app |
| 4. Alert detection & dispatch | State machine wired into the poller | Highest — episode/batching rules are easy to get subtly wrong |
| 5. Dashboard indicator | "Alert sent" icon + room anchor link | Low — small, isolated UI change |

**Prerequisites:** S-05 (room-health-thresholds) already shipped. A Resend account/API key for real-send testing (stub mode works without one).
**Estimated effort:** ~1 week after-hours, matching the PRD's `delivery_weeks: 1`.

## Open Risks & Assumptions

- Assumes the deployment server has outbound internet access to reach Resend — confirmed as a network-model clarification in the PRD, but not verified against the actual production deployment environment.
- Assumes Resend's free/sandbox tier is sufficient for this app's alert volume (a handful of rooms, infrequent violations) — not a hard blocker, just unverified against a real account.

## Success Criteria (Summary)

- A room crossing its threshold results in exactly one email within ~1 minute, naming the room.
- No duplicate emails for the same ongoing violation; a fresh episode after returning to OK does alert again.
- Notification sending never delays or blocks valve control.
