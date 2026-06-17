---
project: Tuya Device Dashboard
version: 1
status: draft
created: 2026-06-08
updated: 2026-06-17
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: Tuya Device Dashboard

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

A small facility management team (2–5 people) cannot monitor or control their Tuya smart devices from a single view — today they manage devices one by one in the Tuya mobile app. The product replaces this workflow with a LAN-only web dashboard that requires no internet connection, providing a fleet view with live temperature readings and direct heating valve control. This is a missing capability, not a UX improvement: Tuya's cloud portal is categorically unavailable on this company's network, so the product substitutes for a dependency that cannot run in this environment.

## North star

**S-01: live device overview** — the smallest end-to-end slice whose successful delivery proves the core product hypothesis — the idea that this product can actually do the thing it was built to do — placed as early as Prerequisites allow because everything else (control, thresholds, room management) only matters once device data is flowing.

> S-01 validates the LAN discovery path: key provisioning → hub enumeration → 30-second polling → live temperature reading in a browser. Without this working, all other slices are decorating an empty shell.

## At a glance

| ID    | Change ID              | Outcome (user can …)                                                                             | Prerequisites            | PRD refs                          | Status   |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ | --------------------------------- | -------- |
| F-01  | auth-scaffold          | (foundation) log in with email + password; all routes gated behind auth                         | —                        | FR-001, Access Control            | done     |
| F-02  | device-schema          | (foundation) rooms, devices, assignments, thresholds schema in SQLite; Drizzle migrations wired | —                        | FR-013, NFR persistence           | done     |
| S-01  | live-device-overview   | see all discovered devices grouped by room, current temperature, online/offline status           | F-01, F-02               | FR-002, FR-003, FR-004, FR-005, US-01 | done     |
| S-02  | room-assignment-setup  | assign any discovered device to a named room (one-time setup, persisted)                        | F-01, F-02, S-01         | FR-013                            | done     |
| S-03  | device-filter-search   | filter devices by room, type, or status; search by name                                         | F-01, S-01               | FR-006, FR-007, FR-008, FR-009    | done     |
| S-04  | valve-setpoint-control | open device detail, adjust heating valve setpoint, see confirmation or specific error            | F-01, S-01               | FR-010, FR-011, FR-012, US-02     | done     |
| S-05  | room-health-thresholds | configure per-room comfort thresholds; see OK/Too Cold/Too Hot badge + anomaly flags per room    | F-01, F-02, S-01, S-02   | FR-004, Business Logic            | done     |
| S-06  | cicd-pipeline          | push to main triggers lint + typecheck + Vitest; passing build produces a deployable artifact   | —                        | PRD §Non-Goals (deferred v1)      | done     |
| S-07  | observability          | structured logging replaces console.log; errors surface with request/user/device context        | —                        | PRD §Non-Goals (deferred v1)      | proposed |
| S-08  | mobile-responsive      | dashboard usable on 375 px viewport (iOS Safari, Android Chrome) without horizontal scroll      | S-01, S-02, S-03, S-05   | PRD §Non-Goals (deferred v1)      | done     |
| S-14  | ux-polish              | every page has loading skeletons, empty states, toast feedback on mutations, and friendly errors; visual consistency lifted (icons, backgrounds, color)  | S-01, S-02, S-03, S-05   | PRD §Non-Goals (deferred v1)      | done     |
| S-09  | temperature-history    | view temperature readings for a device or room over a configurable time range (charts)          | F-02, S-01               | PRD §Non-Goals (deferred v2)      | done     |
| S-10  | external-notifications | receive email/SMS/push alert when a room threshold is violated                                  | S-05                     | PRD §Non-Goals (deferred v2)      | needs-shaping |
| S-11  | automation-rules       | create temperature+time rules linking sensor to valve; system maintains comfort temp in office hours, economy mode outside | S-01, S-04 | PRD §Non-Goals (deferred v2) | done |
| S-12  | automation-history     | view log of automation rule executions (what fired, when, result)                              | S-11                     | PRD §Non-Goals (deferred v2)      | needs-shaping |
| S-13  | multi-site             | dashboard supports multiple office locations, each with their own device/room tree              | F-01, F-02               | PRD §Non-Goals (deferred v2)      | done     |
| S-15  | dashboard-redesign     | KPI summary row, inline sparkline charts per room, sidebar navigation, tabbed setup (Rooms/Devices/Automations/Sites), sortable device table | S-01, S-05, S-09, S-14 | user-requested v2 | done    |
| S-16  | device-dnd-modal       | drag-and-drop devices to reorder within a room or move between rooms (persisted); click any device card to open management modal with setpoint, rename, room, history chart, humidity | S-01, S-09, S-15 | user-requested v2 | done |
| S-17  | visual-ux-redesign     | full dark/light mode toggle (no FOUC), CSS token system replacing glass-morphism dark: variants (Turbopack-safe), device-type icons + watermark on cards, per-room 24h temperature overview panel, donut KPI card for device distribution by room | S-15, S-16 | user-requested v2 | done |
| S-18  | room-site-reassignment | move a room — and its assigned devices and, if exclusive to it, its gateway — to a different site in one atomic operation, via a confirmation-gated picker in Setup → Rooms | S-13 | user-requested v2 | done |
| S-19  | dashboard-personalization | drag-and-drop reorder/hide summary widgets (KPI cards, donut, room temperature panel) and reorder room groups on the dashboard; layout persists across sessions and server restarts (single shared deployment-level layout — no per-account identity boundary exists in this app, confirmed via `/10x-frame`) | S-15, S-16, S-17 | user-requested v2 | done |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme             | Chain                          | Note                                                                      |
| ------ | ----------------- | ------------------------------ | ------------------------------------------------------------------------- |
| A      | Core stack        | `F-01` / `F-02` → `S-01`      | Parallel foundations feed the north star; critical path for speed goal.   |
| B      | Room management   | `S-01` → `S-02` → `S-05`      | Room assignment unlocks meaningful threshold configuration.               |
| C      | Device UX         | `S-01` → `S-03`               | Filter/search enhancement; parallelisable with Stream B after S-01 lands. |
| D      | Valve control     | `S-01` → `S-04`               | Blocked on DP code documentation; unblocks independently of B and C.     |

## Baseline

What's already in place in the codebase as of 2026-06-08 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Next.js 15 + React 19, App Router (src/app/layout.tsx), Tailwind CSS (postcss.config.js, src/styles/globals.css)
- **Backend / API:** present — Next.js API routes + tRPC v11 scaffold (src/app/api/trpc/[trpc]/route.ts, src/server/api/)
- **Data:** partial — Drizzle ORM + libsql wired, only a starter `posts` schema; no domain tables, no migrations (src/server/db/schema.ts)
- **Auth:** absent — no NextAuth or auth provider; all tRPC procedures are publicProcedure; no user/session tables
- **Deploy / infra:** partial — next.config.js only; no Dockerfile, CI/CD, or vercel.json
- **Observability:** absent — console.log only; no logging library or error tracking

## Foundations

### F-01: Auth scaffold

- **Outcome:** (foundation) email + password login is working; authenticated session is issued; all routes are behind the auth gate; a seeded admin user exists for first login.
- **Change ID:** auth-scaffold
- **PRD refs:** FR-001, Access Control section
- **Unlocks:** S-01, S-02, S-03, S-04, S-05 (every slice requires an authenticated session)
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Baseline shows no auth in place; tech-stack.md declares NextAuth (`has_auth: true`) but it was not scaffolded in the T3 starter output. Implementing this first prevents subsequent slices from being built as unprotected endpoints, which would need to be retrofitted later.
- **Status:** done

### F-02: Device data schema

- **Outcome:** (foundation) domain tables exist in SQLite with Drizzle migrations: rooms, devices, device_room_assignments, room_thresholds; the `posts` starter table is removed.
- **Change ID:** device-schema
- **PRD refs:** FR-013, NFR "Configuration data survives server restarts — stored to disk."
- **Unlocks:** S-01 (device state needs a device + room table), S-02 (room assignment requires rooms + device_room_assignments), S-05 (threshold config requires room_thresholds)
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Baseline has only a starter `posts` table; missing schema will block S-01 through S-05 from persisting any state. Doing this before any slice avoids mid-stream migration conflicts on a table that already holds data.
- **Status:** done

## Slices

### S-01: Live device overview

- **Outcome:** user can see all discovered Tuya devices grouped by room, each showing current temperature reading (where applicable) and online/offline status, refreshed every 30 seconds, with no internet connection required.
- **Change ID:** live-device-overview
- **PRD refs:** FR-002, FR-003, FR-004, FR-005, US-01
- **Prerequisites:** F-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Local device encryption keys (local_key per hub/device) must be obtained from the Tuya IoT Platform or extracted via tinytuya's key-scanning tool before production testing against real hardware — Owner: user. Block: no (implementation and mock-based development can proceed; production validation gates on this).
- **Risk:** The Tuya LAN polling loop runs as a persistent side-process alongside the Next.js server — non-standard in the T3 scaffold, which assumes serverless-compatible code. Wiring a persistent background worker requires a custom server entrypoint; tech-stack.md notes this explicitly.
- **Status:** done

### S-02: Room assignment setup

- **Outcome:** user can view all discovered devices in an admin setup screen and assign each device to a named room individually; assignments persist across server restarts.
- **Change ID:** room-assignment-setup
- **PRD refs:** FR-013
- **Prerequisites:** F-01, F-02, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Per-device assignment (not per-hub) is explicitly required — FR-013 Socrates resolution: "one hub can span multiple rooms, so bulk hub-to-room mapping doesn't hold." Any shortcut to bulk assignment would violate this constraint.
- **Status:** done

### S-03: Device filter and search

- **Outcome:** user can filter the device list by room, device type (sensor / valve / plug), or online/offline status, and search devices by name; filters can be combined.
- **Change ID:** device-filter-search
- **PRD refs:** FR-006, FR-007, FR-008, FR-009
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** All filtering operates on the in-memory device list (≤50 devices per PRD scale); no server-side query complexity needed. Scope is small.
- **Status:** done

### S-04: Valve setpoint control

- **Outcome:** user can open a heating valve's detail view, see current temperature and current setpoint, submit a new setpoint, and see either an immediate confirmation or a specific error — the device is never left in an ambiguous state; devices with unrecognised DP codes are flagged as "unsupported" for control.
- **Change ID:** valve-setpoint-control
- **PRD refs:** FR-010, FR-011, FR-012, US-02
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02, S-03 (after S-01 lands; unblocks independently once DP codes are documented)
- **Blockers:** —
- **Unknowns:**
  - Supported Tuya DP code mappings for the specific heating valve models in use must be documented before control can be implemented — Owner: user. Block: yes.
- **Risk:** FR-011 scopes control to "confirmed device models with known local protocol control codes." Sending control commands to unverified DP codes risks silently modifying a wrong device datapoint. DP code documentation is a hard prerequisite for implementation, not just testing.
- **Status:** blocked

### S-05: Room health status and threshold configuration

- **Outcome:** admin can set per-room comfort thresholds (min/max temperature, anomaly gap); dashboard displays a status badge per room (OK / Too Cold / Too Hot), alert flags on devices violating thresholds, and a suggested valve adjustment when a room is below its valve's setpoint.
- **Change ID:** room-health-thresholds
- **PRD refs:** FR-004, Business Logic
- **Prerequisites:** F-01, F-02, S-01, S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - When a room has multiple temperature sensors, the Business Logic rule needs a defined aggregation strategy (minimum reading, average, or worst-case). PRD does not specify — Owner: user. Block: no (safe default is minimum/worst-case; confirm before S-05 ships).
- **Risk:** The room scoring rule evaluates on every 30s poll cycle; it must handle the "no sensors assigned to a room" edge case gracefully (no badge shown, not an error state). Business Logic section specifies live-data-only anomaly detection — no historical drift tracking introduced here.
- **Status:** done

### S-06: CI/CD pipeline

- **Outcome:** pushing to main triggers automated lint, typecheck, and Vitest; a passing build produces a deployable artifact that can be started with `npm start` on the target machine.
- **Change ID:** cicd-pipeline
- **PRD refs:** PRD §Non-Goals (deferred from v1 for speed goal)
- **Prerequisites:** —
- **Parallel with:** S-07 (both are cross-cutting; independent)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** LAN-only deployment means no cloud runner can reach the target host. CI produces a build artifact; actual deploy remains a manual `git pull && npm run build && npm start` unless a self-hosted runner is available. Do not scope automated deploy in this slice.
- **Status:** proposed

### S-07: Observability infrastructure

- **Outcome:** structured logging (Pino or equivalent) replaces all `console.log` calls; every log line carries request id, user id, and device id where applicable; errors are written to a queryable log file on disk; no PII or device keys appear in logs.
- **Change ID:** observability
- **PRD refs:** PRD §Non-Goals (deferred from v1 for time goal)
- **Prerequisites:** —
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Key material (`local_key`) must be explicitly excluded from log serialisation — a structured logger's default deep-serialisation will expose it if the device object is logged naively. This must be enforced via a redaction rule, not convention.
- **Status:** proposed

### S-08: Mobile browser support (done)

- **Outcome:** the full dashboard (device list, room badges, valve control) is usable on a 375 px viewport in iOS Safari and Android Chrome without horizontal scroll; touch targets meet 44 px minimum; no feature is hidden or broken on mobile.
- **Change ID:** mobile-responsive
- **PRD refs:** PRD §Non-Goals (excluded from v1; mobile browser support deferred)
- **Prerequisites:** S-01, S-02, S-03, S-05
- **Parallel with:** S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Tailwind's responsive utilities are present; most risk is in data-dense tables (device list, room grid) that were designed desktop-first. A card-based or stacked layout on small viewports is almost certainly required — not just a breakpoint tweak.
- **Status:** done

### S-14: UX/UI polish

- **Outcome:** every page has loading skeleton states (device list, room grid), dedicated empty states (no devices discovered, no room assignments, no thresholds set), toast notifications on every mutation (assign room, save threshold, delete), user-friendly error messages replacing raw tRPC errors, an error boundary at page level; visual consistency lifted through a coherent icon set (Lucide), subtle backgrounds on cards and sections, and a tightened colour palette.
- **Change ID:** ux-polish
- **PRD refs:** PRD §Non-Goals (UX polish deferred from v1 for speed goal)
- **Prerequisites:** S-01, S-02, S-03, S-05 (stable feature set to polish)
- **Parallel with:** S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Visual changes touch every existing component — screenshot-level regressions are likely undetected until manual review. Mobile breakpoints (S-08) can conflict with layout changes introduced here; doing both simultaneously on the same file risks merge pain. Safest to do S-14 before S-08, or keep them on separate branches.
- **Status:** done

### S-09: Historical temperature data

- **Outcome:** user can select a device or room and view temperature readings over a configurable time range (e.g. last hour, last 24 h, last 7 days) as a line chart; data persists across server restarts.
- **Change ID:** temperature-history
- **PRD refs:** PRD §Non-Goals ("no charts, graphs, or time-series views in v1; deferred to v2")
- **Prerequisites:** F-02, S-01
- **Parallel with:** S-08, S-10
- **Blockers:** —
- **Unknowns:**
  - Storage strategy: append readings to SQLite (simple, bounded by retention policy) vs. a dedicated time-series store. Owner: user. Block: yes — shapes schema migration scope.
  - Retention policy: how many days of readings to keep. Owner: user. Block: yes — determines storage sizing.
  - Chart library choice. Owner: user. Block: no (can default to Recharts; confirm before implementation).
- **Risk:** Writing every 30s poll reading to SQLite for 50 devices = 144 000 rows/day. Without a retention/purge job this will grow unbounded. Must ship with a purge strategy, not as a follow-up.
- **Status:** needs-shaping

### S-10: External notifications

- **Outcome:** when a room threshold violation is detected (Too Cold / Too Hot), the relevant team members receive an alert via at least one external channel (email, SMS, or push); alerts are throttled so a persistent violation does not flood inboxes.
- **Change ID:** external-notifications
- **PRD refs:** PRD §Non-Goals ("threshold alerts appear in the dashboard UI only; no email, SMS, or push notifications in v1")
- **Prerequisites:** S-05
- **Parallel with:** S-09, S-11
- **Blockers:** —
- **Unknowns:**
  - Which channel(s) to support first (email / SMS / push). Owner: user. Block: yes.
  - Provider choice (Resend, Twilio, web push, self-hosted SMTP). Owner: user. Block: yes.
  - Throttling rule: minimum gap between alerts for the same room. Owner: user. Block: yes.
- **Risk:** Notification delivery touches an external network dependency — contradicts the LAN-only NFR unless the notification provider is reachable from within the LAN or alerts are queued for when connectivity is available. This must be resolved in shaping before planning.
- **Status:** needs-shaping

### S-11: Automation rules

- **Outcome:** admin can create time-based automation rules (e.g. "set heating valve in Room A to setpoint 22 °C on weekdays at 07:00"); rules are persisted, listed, and can be individually disabled or deleted; execution is logged (see S-12).
- **Change ID:** automation-rules
- **PRD refs:** PRD §Non-Goals ("no time-based rules in v1; deferred to v2")
- **Prerequisites:** S-01, S-04
- **Parallel with:** S-10
- **Blockers:** — (S-04 unblocked and shipped before this slice started)
- **Unknowns:** — (rule schema, conflict resolution, and the execution model were all resolved during shaping/implementation; see `context/changes/automation-rules/plan.md`)
- **Risk:** Time-based rules interact with the polling worker and valve control pipeline — both had to be stable before this slice landed. Shipped across 6 phases with a scheduler worker, conflict detection, and full unit-test coverage.
- **Status:** done

### S-12: Automation history

- **Outcome:** user can view a paginated log of automation rule executions showing: which rule fired, at what time, the command sent, and whether it succeeded or produced an error.
- **Change ID:** automation-history
- **PRD refs:** PRD §Non-Goals (deferred to v2)
- **Prerequisites:** S-11
- **Parallel with:** —
- **Blockers:** S-11 (must exist before history can be recorded)
- **Unknowns:** Schema and retention policy inherit from S-11 and S-09 decisions.
- **Risk:** Scope is narrow — this is a read-only log view on top of whatever S-11 writes. No independent risk beyond the S-11 dependency.
- **Status:** needs-shaping

### S-13: Multi-site support

- **Outcome:** a single dashboard instance can manage devices and rooms across multiple office locations; each site has its own device/room tree; access control scopes users to one or more sites; existing single-site data migrates without loss.
- **Change ID:** multi-site
- **PRD refs:** PRD §Non-Goals ("single office location; no multi-tenant architecture in v1")
- **Prerequisites:** F-01, F-02
- **Parallel with:** — (architectural; likely best tackled as a standalone effort)
- **Blockers:** —
- **Unknowns:**
  - Tenant isolation model: row-level `site_id` on all tables vs. schema-per-site vs. separate database files. Owner: user. Block: yes.
  - Auth scope: are users global with per-site roles, or is login per-site? Owner: user. Block: yes.
  - Network topology: one LAN-connected server per site, or one central server reaching multiple LANs? Owner: user. Block: yes — fundamentally changes polling architecture.
- **Risk:** Multi-site is the largest scope item in the roadmap. The network topology unknown alone can require a different product architecture (e.g. one agent process per site phoning home to a central server). Shaping must resolve this before any planning begins.
- **Status:** needs-shaping

### S-19: Dashboard personalization

- **Outcome:** user can drag-and-drop reorder or hide/restore the dashboard's summary widgets (KPI cards, "by room" donut, room temperature panel) and drag-and-drop reorder room groups; the resulting layout persists across sessions and server restarts. Persistence is a single shared deployment-level layout, not per-account — `/10x-frame` confirmed this app has exactly one effective identity (one seeded admin row; flat access model), so a `userId`-scoped table would be permanent cardinality-1 complexity with no behavioral payoff.
- **Change ID:** dashboard-personalization
- **PRD refs:** user-requested v2 (no PRD trace — open-ended feature brainstorming, framed via `/10x-frame` before planning)
- **Prerequisites:** S-15 (KPI row + donut + room panel exist to be made reorderable), S-16 (established the `@dnd-kit` drag pattern in this codebase), S-17 (most recent UI layer this builds on)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Widget order/visibility and room order are structurally distinct data shapes (rooms had no `sortOrder` column, unlike `devices.sortOrder`) — shipped as two separate phases rather than one bundled "drag-and-drop" feature to avoid conflating them. A layout-save race condition surfaced after initial implementation and was fixed by serializing writes (see `0bc9ffc`..`9ebb70d`).
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                                             | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ---------------------- | ----------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| F-01       | auth-scaffold          | Auth: email/password login, session gate on all routes            | done                  | —                                                                     |
| F-02       | device-schema          | Schema: rooms, devices, assignments, thresholds (Drizzle + SQLite)| done                  | —                                                                     |
| S-01       | live-device-overview   | Feature: live device overview grouped by room (Tuya LAN polling)  | done                  | —                                                                     |
| S-02       | room-assignment-setup  | Feature: admin room assignment setup                              | done                  | —                                                                     |
| S-03       | device-filter-search   | Feature: device list filter by room / type / status + name search | done                  | —                                                                     |
| S-04       | valve-setpoint-control | Feature: heating valve setpoint control with confirmation         | no                    | Blocked — resolve DP code unknown first                               |
| S-05       | room-health-thresholds | Feature: per-room threshold config + OK/Too Cold/Too Hot status   | done                  | —                                                                     |
| S-06       | cicd-pipeline          | Infra: lint + typecheck + Vitest on push; deployable artifact     | yes                   | Run `/10x-plan cicd-pipeline`                                         |
| S-07       | observability          | Infra: structured logging with redaction; replaces console.log    | yes                   | Run `/10x-plan observability`                                         |
| S-08       | mobile-responsive      | Feature: 375 px viewport support across all dashboard views       | yes                   | Run `/10x-plan mobile-responsive`; best after S-14 (shared components stabilised) |
| S-14       | ux-polish              | Feature: skeleton states, empty states, toast feedback, error UX, visual polish | yes      | Run `/10x-plan ux-polish`                                             |
| S-09       | temperature-history    | Feature: temperature chart per device/room over configurable range| no                    | Run `/10x-shape` first — storage strategy + retention policy needed   |
| S-10       | external-notifications | Feature: email/SMS/push on threshold violation                    | no                    | Run `/10x-shape` first — channel, provider, throttle rule needed      |
| S-11       | automation-rules       | Feature: time-based valve setpoint rules                          | done                  | —                                                                      |
| S-12       | automation-history     | Feature: log of automation rule executions                        | no                    | Needs S-11 first                                                      |
| S-13       | multi-site             | Feature: multiple office locations in one dashboard               | no                    | Run `/10x-shape` first — architecture decision needed                 |
| S-19       | dashboard-personalization | Feature: drag-and-drop widget reorder/hide + room reorder, persisted layout | done | —                                                                      |

## Open Roadmap Questions

1. **Local encryption keys** — Local device encryption keys (one per hub/device) must be obtained from the Tuya IoT Platform or extracted via tinytuya's key-scanning tool before S-01 can be tested against real hardware. Owner: user. Block: S-01 (production testing only; development with a stub can proceed).
2. **Supported DP code mappings** — The Tuya local protocol control codes (DP codes) for the specific heating valve models in use must be documented before S-04 (valve setpoint control) can be implemented. Owner: user. Block: S-04.
3. **Multi-sensor room aggregation** — When a room has more than one temperature sensor, the Business Logic rule in S-05 needs a defined aggregation strategy (minimum reading, average, or worst-case). PRD does not specify. Owner: user. Block: no (safe default is minimum/worst-case; confirm before S-05 ships).

## Parked

(All previously-parked items promoted to roadmap slices S-06 – S-13 on 2026-06-10.)

## Done

| Roadmap ID | Change ID              | Completed   |
| ---------- | ---------------------- | ----------- |
| F-01       | auth-scaffold          | 2026-06-10  |
| F-02       | device-schema          | 2026-06-10  |
| S-01       | live-device-overview   | 2026-06-10  |
| S-02       | room-assignment-setup  | 2026-06-10  |
| S-03       | device-filter-search   | 2026-06-10  |
| S-05       | room-health-thresholds | 2026-06-10  |
| S-14       | ux-polish              | 2026-06-11  |
| S-08       | mobile-responsive      | 2026-06-11  |
| S-13       | multi-site             | 2026-06-11  |
| S-04       | valve-setpoint-control | 2026-06-11  |
| S-09       | temperature-history    | 2026-06-11  |
| S-06       | cicd-pipeline          | 2026-06-12  |
| S-15       | dashboard-redesign     | 2026-06-13  |
| S-16       | device-dnd-modal       | 2026-06-14  |
| S-17       | visual-ux-redesign     | 2026-06-15  |
| S-11       | automation-rules       | 2026-06-16  |
| S-18       | room-site-reassignment | 2026-06-16  |
| S-19       | dashboard-personalization | 2026-06-17 |
