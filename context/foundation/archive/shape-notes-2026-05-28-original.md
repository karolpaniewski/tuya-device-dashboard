---
project: Tuya Device Dashboard
updated: 2026-05-28
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  soft_target: "2026-06-10"
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 13
  quality_check_status: accepted
---

> Seed idea: "I would like to create web app / dashboard for tuya devices in my company. I want to have a place where I can find all czujniki temperatury, głowice grzewcze and read temperatures, automations etc."

## Vision & Problem Statement

A small team of facility managers (2–5 people) needs to monitor and control all Tuya smart devices across company office rooms — temperature sensors (czujniki temperatury) and heating valves (głowice grzewcze) — from a single web dashboard, without relying on the Tuya cloud or requiring internet access.

Today they manage devices one by one in the Tuya mobile app. There is no fleet view, no cross-room temperature comparison, and no way to act quickly across multiple devices. Tuya's own web portal requires an internet connection, which the company cannot or will not provide for this use case.

**Insight:** The gap is not just UX — it is architectural. Tuya's cloud portal is categorically unavailable in a LAN-only environment. This is not a convenience improvement over an existing tool; it replaces a dependency that does not work in the company's network model.

**Pain category:** Missing capability (no fleet view) + workflow friction (one-by-one mobile app management)

## User & Persona

**Primary persona:** Facility manager (or small admin team, 2–5 people, flat permissions — no role separation needed for MVP)

- Needs to glance at current temperatures across all rooms without switching between devices
- Needs to adjust heating valve settings without picking up a phone or navigating device-by-device
- Works on a company LAN; no expectation of remote/internet access for this tool
- Under 50 devices total across a few rooms

## Access Control

Authentication: Login required — individual or shared credentials (email + password). Prevents accidental access from anyone on the LAN.

Role model: Flat — all authenticated users have identical access (view and control). No role separation in MVP.

LAN-only: The dashboard is not exposed to the internet; access is restricted to the company network.

## Success Criteria

### Primary
The facility manager can open the dashboard on the company LAN, log in, see all Tuya devices (temperature sensors and heating valves) with their current temperature and online/offline status, drill into any device, and adjust its temperature setpoint — with the change confirmed in the UI immediately.

MVP flow:
1. Manager opens browser on company LAN
2. Logs in with credentials
3. Sees all devices: name, room, current temperature, online/offline status
4. Drills into one device, adjusts temperature setpoint
5. Change reflects in the dashboard immediately (or error shown on failure)

Scoped out of v1 (deferred to v2): historical temperature data, automation history, automation creation.

### Secondary
Devices grouped by room/floor in the dashboard UI.

### Guardrails
- **Command feedback**: if a control command fails, the user sees a clear error — never silent failure, never unknown device state.
- **LAN-only**: zero outbound calls to Tuya cloud or any external service. No data leaves the company network.
- **Auth required**: dashboard is inaccessible without valid login credentials, even from within the LAN.

## Functional Requirements

### Authentication
- FR-001: User can log in with credentials (email + password). Priority: must-have
  > Socrates: No counter-argument; login is the access gate for a shared internal tool.

### Device Discovery
- FR-002: System automatically discovers all Tuya Zigbee gateway hubs (centralki) on the LAN. Priority: must-have
  > Socrates: Counter-argument considered: "auto-discovery requires knowing each device's local encryption key — this can't be fully automated." Resolution: acceptable. Admin inputs local keys once during initial setup (standard tinytuya workflow); discovery is automatic after that. One-time manual key setup is an accepted cost.
- FR-003: System enumerates all devices attached to each discovered hub (temperature sensors, heating valves, smart plugs). Priority: must-have
  > Socrates: No counter-argument; enumerating hub devices is prerequisite to any other feature.

### Device Overview
- FR-004: User can see all devices in one view showing name, assigned room, current temperature (where applicable), and online/offline status. Priority: must-have
  > Socrates: No counter-argument; this is the primary success criterion.
- FR-005: User can browse devices grouped by room/floor. Priority: must-have
  > Socrates: Counter-argument considered: "filtering alone covers the same navigation need; grouping adds complexity." Resolution: kept as must-have. Spatial grouping is the core UX — a flat filtered list doesn't replace the at-a-glance room overview.
- FR-006: User can filter the device list by room/zone. Priority: must-have
  > Socrates: No counter-argument; complements grouping for quick isolation.
- FR-007: User can filter the device list by device type (sensor / valve / plug). Priority: must-have
  > Socrates: Counter-argument considered: "room grouping covers navigation; type filter is redundant." Resolution: kept. "Show only valves" is a distinct diagnostic use case from room browsing.
- FR-008: User can filter the device list by status (online / offline). Priority: must-have
  > Socrates: Kept; offline/online filter is the primary diagnostic tool for infrastructure problems.
- FR-009: User can search devices by name. Priority: must-have
  > Socrates: Counter-argument considered: "50 devices + room filter is enough; search may never be used." Resolution: kept. Searching by name is faster when the device name is known; small implementation cost.

### Device Detail & Control
- FR-010: User can view the current state of a single device (temperature reading, setpoint, online/offline status). Priority: must-have
  > Socrates: No counter-argument; prerequisite to control.
- FR-011: User can adjust the temperature setpoint of a heating valve from the device detail view. Priority: must-have. **Caveat:** control is implemented for confirmed device models with known Tuya DP mappings; devices with unrecognised DP codes display status but are flagged as "unsupported" for control.
  > Socrates: Counter-argument considered: "Tuya local protocol DP codes vary by manufacturer — control may silently fail on some valves." Resolution: added unsupported-device caveat. Control works for known models; unknown devices surface status only and are explicitly flagged.
- FR-012: User sees immediate confirmation or a clear error message after every control command — no silent failures. Priority: must-have
  > Socrates: No counter-argument; this is a named guardrail.

### Setup & Configuration
- FR-013: Admin can assign each discovered device to a named room individually (one-time setup after initial discovery; persisted). Priority: must-have
  > Socrates: Counter-argument considered: "bulk per-hub assignment would save time." Resolution: per-device assignment kept because one hub can span multiple rooms — bulk hub-to-room mapping doesn't hold.

## User Stories

### US-01: Live device overview
**Given** I am logged into the dashboard on the company LAN,  
**When** I open the main view,  
**Then** I see all discovered devices grouped by room, each showing current temperature and online/offline status — with no internet connection required.

## Business Logic

**Domain rule (one sentence):** The app evaluates each room's current temperature against configurable per-room thresholds, scores the room as OK / too cold / too hot, flags threshold violations, detects when a room's temperature is significantly below its heating valve's setpoint, and suggests specific valve adjustments.

**Inputs the rule consumes (as the user sees them):**
- Current temperature reading from sensors in each room
- Current setpoint configured on each heating valve
- Per-room comfort thresholds set by admin (min and max acceptable temperature)

**Output the user encounters:**
- A status badge per room: OK / Too Cold / Too Hot
- Alert flags on devices violating thresholds
- Suggested action: "Room X is Y°C below setpoint — consider raising valve to Z°C"
- Anomaly flag: current temperature is significantly below the valve's current setpoint (threshold-based, no historical tracking in v1)

**Rule simplification for v1:** Anomaly detection uses live data only — if current temp < (setpoint − configured threshold), the room is flagged. No time-based drift tracking (deferred to v2).

**Rule configuration:** All thresholds (comfort band min/max, anomaly gap threshold) are configurable per room by an admin through the dashboard UI. A global default applies to rooms with no override.

**Data polling:** Dashboard polls all Tuya hubs every 30 seconds to refresh device state. Rules are evaluated on each poll cycle.

## Non-Functional Requirements

- **Persistence:** Configuration data (room assignments, per-room thresholds, user credentials) survives server restarts — stored to disk, not held in memory only.
- **Performance:** Dashboard loads within 3 seconds on the company LAN with up to 50 devices present.
- **Privacy:** No third-party analytics, tracking scripts, or external service calls of any kind. The app makes zero outbound network requests.
- **Offline operation:** Full functionality when there is no internet connection (LAN-only by design).
- **Browser support:** Works in current versions of Chrome, Firefox, and Edge on desktop. No mobile browser optimisation required for v1.

## Quality Cross-Check

All elements present. One resolved tension:
- **Timeline:** June 10 confirmed as a soft target, not a hard deadline. No gap remains.

## Non-Goals

- **No historical temperature data** — no charts, graphs, or time-series views in v1. Temperature history deferred to v2. *(Scoped out in Phase 3.)*
- **No automation creation or scheduling** — users cannot create time-based rules (e.g. "heat room at 7am") in v1. Automation features deferred to v2. *(Scoped out in Phase 3.)*
- **No automation execution history** — no log of past automation runs. Deferred to v2. *(Scoped out in Phase 3.)*
- **No external notifications** — threshold alerts and anomaly flags appear in the dashboard UI only. No email, SMS, or push notifications in v1. *(Explicitly confirmed.)*
- **No multi-site support** — single office location only. No multi-tenant or multi-building architecture.

### US-02: Adjust heating valve
**Given** I am on the device list and I identify a heating valve,  
**When** I open its detail view and submit a new temperature setpoint,  
**Then** the command is sent locally, and I see either a success confirmation or a specific error — the device is never left in an ambiguous state.

## Open Questions

- **Timeline:** MVP estimated at 3 weeks after-hours; soft target is 2026-06-10 (13 days from shape session). June 10 is not a hard gate — scope is fixed, deadline is flexible.
- **Device model list:** Control (FR-011) is scoped to confirmed device models with known Tuya DP mappings. The specific models in use need to be documented before implementation begins.
- **Local key provisioning:** Device local encryption keys must be obtained from the Tuya IoT Platform or extracted via tinytuya's key-scanning tool. This is a prerequisite for discovery (FR-002/003) and must be done before development of the discovery feature.
