---
project: Tuya Device Dashboard
version: 8
status: draft
created: 2026-06-25
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

**System purpose:** A LAN-only web dashboard lets a small facility-management team monitor and control Tuya smart devices; a temperature-history feature lets them view a device's readings over a configurable time range (last hour / 24 hours / 7 days) as a chart.

**Key architecture:** A single Next.js application (frontend + API routes) with a background polling process that reads device state on a fixed ~30-second cycle and persists temperature readings for later retrieval.

**Tech stack:** Next.js 15, Drizzle ORM + libsql (SQLite).

**Current user base:** Facility manager / office administrator, 2–5 person organization, flat single-role access model.

**Core functionality:** Every poll cycle (~30s), a new temperature reading is recorded per device. A retention purge already runs on the same poll cycle (gated to roughly every 30 minutes), deleting readings older than 30 days; the underlying table is already indexed for time-range lookups. The temperature-history feature reads surviving readings and buckets them into the requested time range for the History tab's chart.

## Problem Statement & Motivation

**Correction (2026-06-25):** an earlier pass at this PRD (and the roadmap entry that prompted it) claimed no retention/purge mechanism existed. That was wrong — a 30-day purge shipped in the same commit as the temperature-history feature itself, found via a case-sensitive grep that missed it. The gap below is the corrected, narrower one.

**The gap:** the existing purge has no dedicated success/outcome log line — a run's result (rows deleted, or zero) isn't distinguishable in logs from a normal poll cycle, so there's no way to audit "is the purge actually working" without inspecting the database directly. It also has no test coverage of its own. Separately, the retention window (30 days) was never a deliberate product decision — it was picked when the feature first shipped — and is worth revisiting now that it's correctly understood to already exist.

**Why now:** the false-premise version of this PRD already triggered shaping/planning effort; correcting it now (rather than building a duplicate purge job) avoids wasted work and closes the real, much smaller gap: observability and test coverage for a job that already does its core job correctly.

**Current workaround:** none needed for retention itself (already handled). The workaround for the missing observability is manually querying the database to confirm a purge happened.

## User & Persona

**Role:** Facility manager / office administrator — the same single persona as the rest of the app. No new persona is introduced.
**Pain moment:** None directly — this change has no user-facing surface and is invisible as long as the History tab keeps working within its retention window. The moment it protects against is a future one: degraded performance or unbounded storage growth if usage continues unchecked.

## Success Criteria

### Primary
The smallest end-to-end slice, proving the whole thing works:
1. Every purge run (the existing ~30-minute-gated cycle) produces a dedicated log line stating its outcome — rows deleted, or zero — distinguishable from the generic per-poll log line.
2. The purge's boundary behavior (a row exactly at the 30-day cutoff, rows just inside vs. just outside the window) has test coverage proving it deletes what it should and nothing else.
3. The History tab's existing 1h/24h/7d ranges are unaffected — verified by confirming the purge logic and its test coverage land with zero changes to the temperature-history query itself.

### Secondary
None identified — this is a narrow, single-purpose observability/testing gap-fill with no nice-to-have surface beyond the primary slice.

### Guardrails
- The purge must continue to never delete a row inside the 30-day retention window — this was already true; the new log line and tests must prove it, not change it.
- The purge must continue to not contend with or slow down the device-polling cycle it already runs alongside — no change to its existing ~30-minute gating.
- The existing temperature-history query and its time-range bucketing are completely unchanged — this is a logging + test addition only, not a behavior change.

**Timeline:** a day or two of after-hours work at most — one log line and a handful of unit tests against existing, already-working logic.

## User Stories

### US-01: Operator can confirm from logs alone that the retention purge is working

- **Given** the existing retention purge runs on its normal ~30-minute-gated cycle
- **When** a purge cycle completes (whether or not any rows were actually deleted)
- **Then** a dedicated log line reports the outcome (rows deleted, or zero), distinguishable from the generic per-poll log line, without needing to query the database directly

#### Acceptance Criteria
- The purge's log line appears every time the purge runs, including no-op runs where zero rows were deleted
- A unit test proves a reading exactly at the 30-day boundary is handled consistently (either always kept or always purged — whichever matches the existing `lt()` comparison's actual behavior, made explicit rather than assumed)
- A unit test proves readings just inside the 30-day window survive and readings just outside it are deleted
- No change to the temperature-history query, its bucketing, or the device-polling cycle's existing behavior

## Scope of Change

- [new] The existing retention purge gains a dedicated log line reporting its outcome (rows deleted, or zero) every time it runs, distinguishable from the generic per-poll log line.
  > Socrates: Counter-argument considered: logging every run, including no-op runs, could be noisy. Resolution: log every run regardless of count — a cheap heartbeat line matching this project's existing periodic-job logging convention; the "job is alive" signal is worth more than the log-volume cost at this app's scale.
- [new] The existing retention purge gains unit test coverage for its boundary behavior (exactly-at-cutoff, just-inside, just-outside).
  > Socrates: Counter-argument considered: this is "just tests," not user-facing scope — is it worth a dedicated PRD item? Resolution: kept explicit — untested deletion logic is exactly the kind of code where a silent off-by-one (deleting one day too many, or too few) would go unnoticed until a user complains about missing chart data; that risk is the entire reason this change exists.
- [preserved] The retention window stays at 30 days, unchanged from its current shipped behavior. An earlier draft of this PRD proposed shrinking it to 7 days, based on the false premise that no purge existed yet; with the purge confirmed already live and stable, shrinking it now would mean actively deleting 23 days of currently-harmless data for no benefit (the History tab's UI never shows past 7 days regardless of how much is retained underneath).
  > Socrates: Counter-argument considered: 7 days would minimize storage more tightly. Resolution: not worth it — the storage saved is marginal at this app's scale, and reducing a stable, already-deployed window is itself a risk this change doesn't need to take on.
- [preserved] The temperature-history query and its existing 1h/24h/7d bucketing behavior are unaffected — this change touches only logging and tests, not the delete logic's behavior or the read path.
  > Socrates: Counter-argument considered: trivially true by construction since nothing here changes the query. Resolution: kept explicit anyway, matching this project's established convention of stating preserved contracts explicitly even when "obviously" true.

## Constraints & Compatibility

- **No other consumer to preserve:** the temperature-history query is the only reader of this data — unaffected either way.
- **No data migration:** no schema change. The relevant indexes (`reading_time_idx`, a composite `tuyaDeviceId`+`recordedAt` index) already exist.
- **No backward-compatibility risk:** no existing external consumers touch this data directly; the change is additive logging plus tests around existing, unchanged delete logic.
- No special deployment window or release-process change — this change goes through the same quality gate as every other change in this project.

## Business Logic Changes

**No domain logic change.** This is an infrastructure/technical change — adding observability and test coverage to an already-correct delete operation. No new decision is made for the user.

## Access Control Changes

No access control changes — current model preserved: email + password login, single flat role, full access for the one effective user type. This is a backend-only infrastructure job with no user-facing access surface.

## Non-Goals

- No change to product type or user base/scale — this is a backend-only infrastructure job, invisible to users.
- No hard deadline; after-hours-only work, matching every other change in this project.
- Avoid: changing the retention window — 30 days stays as-is; see Scope of Change for why shrinking it was rejected.
- Avoid: a configurable retention window — 30 days remains fixed, not exposed as a setting. Making it configurable now would be speculative scope for a need that doesn't exist yet.
- Avoid: changing the purge's trigger mechanism (it stays gated on the existing poll cycle, not moved to a dedicated scheduler) — it already works, and moving it is unrelated risk this change doesn't need to take on.

## Open Questions

No open questions — the retention-window question (keep 30 days vs. shrink to 7) was resolved during planning: keep 30 days, since it's already shipped and stable, and shrinking it now would only delete currently-harmless data for marginal storage savings.
