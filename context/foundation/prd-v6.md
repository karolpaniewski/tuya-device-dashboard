---
project: Tuya Device Dashboard
version: 6
status: draft
created: 2026-06-23
context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 1
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

**System purpose:** A LAN-only web dashboard lets a small facility-management team monitor and control Tuya smart devices (temperature sensors, heating valves) from one place; Tuya's own cloud control is unavailable on this network, so device communication stays on the LAN — though the application server itself has normal outbound internet access.

**Key architecture:** A single Next.js application (frontend + API routes), with no separate backend service. Device communication with Tuya hardware happens over the local network, not through any per-device cloud service.

**Tech stack:** Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Tuya LAN polling/control.

**Current user base:** Facility manager / office administrator, 2–5 person organization, flat single-role access model (email + password login, no roles).

**Core functionality (relevant to this change):** The dashboard computes and displays a per-room comfort-threshold badge (OK / Too Cold / Too Hot) from each room's current temperature reading against a configured threshold. Today this badge is visible only when an admin is actively looking at the dashboard — there is no outbound signal of any kind when a room goes out of range.

## Problem Statement & Motivation

A room crossing its comfort threshold (too cold → heating must be turned on; too hot → it must be turned off) is invisible unless the facility manager happens to be looking at the dashboard at that moment. Today the team finds out late — e.g. the next morning, or after returning to the office — by which point the room may have been out of range for hours. The current "workaround" is simply checking the dashboard periodically; its cost is the delay between a violation occurring and someone noticing it.

# TODO: trigger event — what specifically prompted shaping this now (an incident, a recurring complaint, a planned office change)? — see Open Questions

## User & Persona

**Role:** Facility manager / office administrator team (2–5 person org) — same persona as the rest of the app. Unlike the rest of the app's single-effective-user model, this change introduces **multiple recipients** (the whole team, not just one admin) for the first time — "who receives this" becomes a list rather than implicitly "the one logged-in admin."

**Device:** Recipients receive alerts on their own phone/email client — outside the dashboard's desktop/mobile-web surface entirely.

**Pain moment:** A room drifts out of its comfort range while no one is looking at the dashboard (after hours, weekend, away from desk) — the team only finds out once someone happens to check, by which point the room may have been out of range for a long time.

## Success Criteria

### Primary
A room's threshold badge transitions into a violated state (Too Cold / Too Hot) → the system sends one email to the configured contact list stating which room and which threshold was violated. Repeated oscillation around the threshold in a short window produces one alert per violation episode, not one per fluctuation.

### Secondary
The email includes a link that opens the dashboard directly to the affected room, so a recipient can act in one click instead of navigating to find it.

### Guardrails
- Notification sending never blocks, delays, or sits in the path of any device control command (e.g. opening/closing a valve) — the alerting path is strictly observational, and a failure or slowness in the notification channel never affects device control.
- Threshold computation and badge logic (the existing OK / Too Cold / Too Hot calculation) is unchanged by this change — notifications are read-only consumers of existing badge state.
- No SMS/push in this MVP — explicitly deferred (see Non-Goals).
- An alert is delivered within roughly 1 minute of the threshold violation being detected.
- Configured contact addresses (email/phone) are never written to application logs in plaintext or otherwise — no leak of contact PII through logging.
- Existing externally-observable behaviors (dashboard load time, badge accuracy, valve control responsiveness) do not regress — this is a pure addition, not a modification of any existing user-facing guarantee.

## User Stories

### US-01: Room threshold violation triggers an email alert

- **Given** a room has a configured threshold and at least one contact is configured in settings
- **When** the room's badge transitions from OK into a violated state (Too Cold or Too Hot)
- **Then** the system sends one email to the configured contact list naming the room and the violated threshold, with a link to the room on the dashboard, without delaying or blocking any device control command; no further alert is sent for the same episode until the room returns to OK and violates again

#### Acceptance Criteria
- A room with no configured threshold never produces an alert
- Exactly one email is sent per violation episode, regardless of how many times the temperature fluctuates around the threshold within that episode
- The dashboard badge shows an "alert sent" indicator for a room with an active, already-notified violation
- Notification sending never appears in the path of any device control command
- An invalid email format is rejected at the point the admin saves the contact, not silently dropped at send time

## Scope of Change

- [new] Admin can configure a list of email contacts in application settings (add, edit, remove); each contact is validated against a standard email format before being saved. (FR-001)
  > Socrates: Counter-argument considered: validation adds complexity that could be skipped for a 2–5 person team. Resolution: kept — simple format validation prevents a silently-broken alert path from a typo'd address.
- [new] System sends an email to the configured contact list when a room's threshold transitions into a violated state (Too Cold / Too Hot); rooms with no configured threshold never produce an alert — no default/fallback threshold is assumed. (FR-002)
  > Socrates: Counter-argument considered: what happens to rooms with no threshold configured? Resolution: no threshold = no alert, ever — no default range is assumed.
- [new] System throttles repeated threshold violations: one alert is sent when a room enters a violated state; no further alert is sent until the room returns to OK and violates again (a fresh episode). A continuously-violated room does not receive repeat/reminder alerts in v1. (FR-003)
  > Socrates: Counter-argument considered: (a) "episode" needed a concrete definition or the behavior would be ambiguous; (b) a long-running violation might warrant a reminder. Resolution: episode = entry until return-to-OK, no time-based re-alert in v1 — accepted as a deliberate v1 tradeoff to keep scope at one week; reminder / escalation is future work.
- [new] The alert email includes a link that opens the dashboard directly to the affected room. Priority: nice-to-have. (FR-004)
  > Socrates: Counter-argument considered: the link only resolves on the office network (the dashboard is LAN-only), so it's dead when a recipient is off-site; also adds complexity over a plain text alert. Resolution: kept anyway — recipients are typically on-site or on the office network when acting on this, and the link still helps as a one-click shortcut even if not universally reachable.
- [modified] Threshold/badge display gains a small additional visual indicator showing "alert sent" for a currently-violated room — was: badge shows only OK / Too Cold / Too Hot; now: badge also reflects whether an alert has already been sent for the active violation. The underlying threshold calculation itself is unchanged. (FR-005)
  > Socrates: Counter-argument considered: should the badge stay completely unchanged, with no visual indicator at all? Resolution: a small "alert sent" indicator was judged worth the small change — it tells the admin reading the dashboard "this is already being handled," avoiding duplicate/manual notification attempts.
- [preserved] Existing device control commands remain unaffected by notification sending — a slow or unavailable email provider can never delay or block a device command. (FR-006)
  > Socrates: Counter-argument considered: if notification sending were not decoupled from the device-command cycle, a slow or unavailable email provider could indirectly delay device control. Resolution: notification sending must never be in the path of a device control command — confirmed as a hard guardrail.

## Constraints & Compatibility

- **Backward compatibility:** No existing external API consumers or integrations touch room threshold state today, so nothing downstream of the existing badge logic can break from this addition.
- **Data migration:** None required — this is purely additive (new contact configuration, new per-room alert-episode tracking); no existing data's shape changes other than the small "alert sent" indicator added to the existing badge read path.
- **Existing integrations that must continue working:** The device control command path (e.g. opening/closing a valve) must continue to work exactly as it does today — no new step from this change may sit between a threshold read and a device command.
- **Preserved behavior:** Threshold/badge computation logic is unchanged. The product's "LAN-only" guarantee continues to apply specifically to device control — Tuya's cloud portal remains unavailable/unused on this network. This change clarifies (does not alter) that the application server itself has normal outbound internet access, which is what makes sending email possible without violating the existing network constraint.

## Business Logic Changes

**New domain rule (no existing rule is being modified):** A room entering a threshold-violation state fires exactly one alert per violation episode — no further alert is sent for the same ongoing violation, only when the room returns to OK and violates again.

The input is the room's badge state over time (OK / Too Cold / Too Hot) as it already exists; the rule's job is to decide, from that state history, which transitions deserve a notification and which don't. The output is a yes/no decision per transition: a transition into a violated state from OK fires an alert; staying in a violated state, or fluctuating within it, does not.

The user encounters this as: they get exactly one email per real-world episode of a room going out of range, never a flood of repeated emails for the same ongoing problem — and conversely, if the same room drifts out of range again after having recovered, that's treated as a new, distinct episode worth a fresh alert.

## Access Control Changes

No access control changes — current model preserved: single flat role, full access for the one effective user type. No new accounts or roles are introduced by this change.

Notification recipients are **not** modeled as accounts. They are a static list of contacts (email addresses) maintained in application settings by the admin — a plain contact list, not a new identity or role boundary. The same global list applies to every threshold violation; per-room or per-threshold recipient targeting is not part of this change (see Non-Goals).

## Non-Goals

- No change to existing product type (web app) or existing user base (small office/admin, 2–5 person org); the contact list has multiple recipients, but the organization scale itself doesn't change.
- No hard deadline; budget is the already-recorded ~1-week after-hours estimate.
- Avoid: SMS/push notifications in this MVP — email only; SMS/push are explicitly deferred to a later iteration.
- Avoid: recipient targeting per room/threshold — one global contact list applies to every alert, not per-room or per-threshold recipients.
- Avoid: alert history/log UI — no screen listing past notifications; the badge's "alert sent" indicator and the email itself are the only signals in this MVP.
- Avoid: re-alert / reminder for an ongoing violation — one alert per episode, no periodic reminder while a room stays out of range.

## Open Questions

1. **What triggered shaping this change now?** — no specific incident, recurring complaint, or business pressure was captured during shaping beyond the roadmap marking it `needs-shaping`. Owner: user. Block: no (does not block FR/scope work, but useful context for prioritization).
