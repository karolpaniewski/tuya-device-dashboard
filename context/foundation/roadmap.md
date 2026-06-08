---
project: Tuya Device Dashboard
version: 1
status: draft
created: 2026-06-08
updated: 2026-06-08
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
| F-01  | auth-scaffold          | (foundation) log in with email + password; all routes gated behind auth                         | —                        | FR-001, Access Control            | ready    |
| F-02  | device-schema          | (foundation) rooms, devices, assignments, thresholds schema in SQLite; Drizzle migrations wired | —                        | FR-013, NFR persistence           | ready    |
| S-01  | live-device-overview   | see all discovered devices grouped by room, current temperature, online/offline status           | F-01, F-02               | FR-002, FR-003, FR-004, FR-005, US-01 | proposed |
| S-02  | room-assignment-setup  | assign any discovered device to a named room (one-time setup, persisted)                        | F-01, F-02, S-01         | FR-013                            | proposed |
| S-03  | device-filter-search   | filter devices by room, type, or status; search by name                                         | F-01, S-01               | FR-006, FR-007, FR-008, FR-009    | proposed |
| S-04  | valve-setpoint-control | open device detail, adjust heating valve setpoint, see confirmation or specific error            | F-01, S-01               | FR-010, FR-011, FR-012, US-02     | blocked  |
| S-05  | room-health-thresholds | configure per-room comfort thresholds; see OK/Too Cold/Too Hot badge + anomaly flags per room    | F-01, F-02, S-01, S-02   | FR-004, Business Logic            | proposed |

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
- **Status:** ready

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
- **Status:** ready

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
- **Status:** proposed

### S-02: Room assignment setup

- **Outcome:** user can view all discovered devices in an admin setup screen and assign each device to a named room individually; assignments persist across server restarts.
- **Change ID:** room-assignment-setup
- **PRD refs:** FR-013
- **Prerequisites:** F-01, F-02, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Per-device assignment (not per-hub) is explicitly required — FR-013 Socrates resolution: "one hub can span multiple rooms, so bulk hub-to-room mapping doesn't hold." Any shortcut to bulk assignment would violate this constraint.
- **Status:** proposed

### S-03: Device filter and search

- **Outcome:** user can filter the device list by room, device type (sensor / valve / plug), or online/offline status, and search devices by name; filters can be combined.
- **Change ID:** device-filter-search
- **PRD refs:** FR-006, FR-007, FR-008, FR-009
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** All filtering operates on the in-memory device list (≤50 devices per PRD scale); no server-side query complexity needed. Scope is small.
- **Status:** proposed

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
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                                             | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ---------------------- | ----------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| F-01       | auth-scaffold          | Auth: email/password login, session gate on all routes            | yes                   | Run `/10x-plan auth-scaffold`                                         |
| F-02       | device-schema          | Schema: rooms, devices, assignments, thresholds (Drizzle + SQLite)| yes                   | Run `/10x-plan device-schema`; can run in parallel with auth-scaffold |
| S-01       | live-device-overview   | Feature: live device overview grouped by room (Tuya LAN polling)  | yes (mock-first)      | Implement with stubbed Tuya client; swap for real keys when obtained  |
| S-02       | room-assignment-setup  | Feature: admin room assignment setup                              | no                    | Needs S-01 first                                                      |
| S-03       | device-filter-search   | Feature: device list filter by room / type / status + name search | no                    | Needs S-01 first; can run in parallel with S-02                       |
| S-04       | valve-setpoint-control | Feature: heating valve setpoint control with confirmation         | no                    | Blocked — resolve DP code unknown first                               |
| S-05       | room-health-thresholds | Feature: per-room threshold config + OK/Too Cold/Too Hot status   | no                    | Needs S-01 + S-02 first                                               |

## Open Roadmap Questions

1. **Local encryption keys** — Local device encryption keys (one per hub/device) must be obtained from the Tuya IoT Platform or extracted via tinytuya's key-scanning tool before S-01 can be tested against real hardware. Owner: user. Block: S-01 (production testing only; development with a stub can proceed).
2. **Supported DP code mappings** — The Tuya local protocol control codes (DP codes) for the specific heating valve models in use must be documented before S-04 (valve setpoint control) can be implemented. Owner: user. Block: S-04.
3. **Multi-sensor room aggregation** — When a room has more than one temperature sensor, the Business Logic rule in S-05 needs a defined aggregation strategy (minimum reading, average, or worst-case). PRD does not specify. Owner: user. Block: no (safe default is minimum/worst-case; confirm before S-05 ships).

## Parked

- **Historical temperature data** — Why parked: PRD §Non-Goals ("no charts, graphs, or time-series views in v1; deferred to v2").
- **Automation creation and scheduling** — Why parked: PRD §Non-Goals ("no time-based rules in v1; deferred to v2").
- **Automation execution history** — Why parked: PRD §Non-Goals (deferred to v2).
- **External notifications** — Why parked: PRD §Non-Goals ("threshold alerts appear in the dashboard UI only; no email, SMS, or push notifications").
- **Multi-site support** — Why parked: PRD §Non-Goals (single office location, no multi-tenant architecture).
- **CI/CD pipeline** — Why parked: speed goal; self-hosted LAN deployment via `npm run build && npm start` is sufficient for MVP. No shared infrastructure to automate against.
- **Mobile browser optimisation** — Why parked: PRD explicitly excludes mobile browser support for v1.
- **Observability infrastructure** — Why parked: time goal and LAN-only scope; console.log is sufficient for a small internal tool at this scale.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)
