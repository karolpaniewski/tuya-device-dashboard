---
project: Tuya Device Dashboard
version: 1
status: draft
created: 2026-05-28
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

A small facility management team (2–5 people) cannot monitor or control their company's Tuya smart devices — temperature sensors and heating valves — from a single view. Today they manage devices one by one through the Tuya mobile app. There is no fleet view, no cross-room temperature comparison, and no way to act quickly across multiple devices.

The gap is architectural, not cosmetic. Tuya's own web portal requires an internet connection, which the company does not use for this system. A LAN-only dashboard does not exist in Tuya's product line; it must be built. The product replaces a cloud dependency that is categorically unavailable in this network model — it does not improve on an existing tool, it substitutes for one that cannot run here.

## User & Persona

**Primary persona: Facility Manager**

Role: Facility manager (or small admin team member, 2–5 people).  
Context: Manages building climate control across multiple office rooms, each monitored by one or more Tuya Zigbee gateway hubs with attached sensors and heating valves. Works on the company LAN; no remote or internet access expected for this tool.  
Moment: Needs to check that all rooms are within acceptable temperature ranges and act on a problem — an offline device, a valve not meeting setpoint — without picking up a phone or opening the Tuya mobile app device-by-device.

## Success Criteria

### Primary

The facility manager can open the dashboard on the company LAN, log in, see all devices (temperature sensors, heating valves, smart plugs) grouped by room with their current temperature and online/offline status, and adjust a heating valve's temperature setpoint — with a confirmation or explicit error shown immediately after the command.

MVP flow:
1. Manager opens browser on the company LAN
2. Logs in with credentials
3. Sees all devices grouped by room: name, current temperature, online/offline status
4. Drills into one device, adjusts temperature setpoint
5. Change is confirmed immediately, or a specific error is shown — no silent failure

### Secondary

Devices are grouped by room/floor in the dashboard UI, matching the physical layout of the office.

### Guardrails

- **Command feedback**: a failed control command always surfaces a specific error — the user never sees silence after submitting an action, and the device is never left in an unknown state.
- **LAN isolation**: the product makes zero outbound network calls. No data reaches any service outside the company network.
- **Auth gate**: the dashboard is inaccessible without valid login credentials, even from within the LAN.

## User Stories

### US-01: Live device overview

**Given** I am logged into the dashboard on the company LAN,  
**When** I open the main view,  
**Then** I see all discovered devices grouped by room, each showing current temperature and online/offline status — with no internet connection required.

#### Acceptance Criteria
- All rooms appear as named groups; each device shows its current temperature reading (where applicable) and online/offline state
- The view reflects device state no older than 30 seconds
- No internet connection is required at any point during the session

### US-02: Adjust heating valve

**Given** I am on the device list and I identify a heating valve,  
**When** I open its detail view and submit a new temperature setpoint,  
**Then** the command is sent to the device locally, and I see either a success confirmation or a specific error — the device is never left in an ambiguous state.

#### Acceptance Criteria
- The submitted setpoint is visible in the device detail immediately after confirmation
- If the command fails, a specific error is shown — not silence
- Devices with unrecognised local protocol control codes are flagged as "unsupported" — no silent send

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
- FR-011: User can adjust the temperature setpoint of a heating valve from the device detail view. Priority: must-have. **Caveat:** control is implemented for confirmed device models with known local protocol control codes; devices with unrecognised codes display status but are flagged as "unsupported" for control.
  > Socrates: Counter-argument considered: "Tuya local protocol DP codes vary by manufacturer — control may silently fail on some valves." Resolution: added unsupported-device caveat. Control works for known models; unknown devices surface status only and are explicitly flagged.
- FR-012: User sees immediate confirmation or a clear error message after every control command — no silent failures. Priority: must-have
  > Socrates: No counter-argument; this is a named guardrail.

### Setup & Configuration
- FR-013: Admin can assign each discovered device to a named room individually (one-time setup after initial discovery; persisted). Priority: must-have
  > Socrates: Counter-argument considered: "bulk per-hub assignment would save time." Resolution: per-device assignment kept because one hub can span multiple rooms — bulk hub-to-room mapping doesn't hold.

## Non-Functional Requirements

- Device readings shown in the dashboard are current within 30 seconds of the device's actual state.
- The dashboard loads within 3 seconds on the company LAN with up to 50 devices present.
- Configuration data (room assignments, per-room thresholds, user credentials) is retained across server restarts.
- The product makes zero outbound network calls; no data crosses the company network boundary under any condition.
- The product is fully functional without an internet connection.
- The product works in current versions of Chrome, Firefox, and Edge on desktop. No mobile browser requirement.

## Business Logic

The app evaluates each room's current temperature against configurable per-room thresholds, scores the room as OK / Too Cold / Too Hot, flags threshold violations, detects when a room's temperature is significantly below its heating valve's current setpoint, and suggests specific valve adjustments.

The rule consumes three user-visible inputs: the current temperature reading from sensors in each room; the current setpoint configured on each heating valve; and the per-room comfort thresholds (minimum and maximum acceptable temperature) set by an admin through the dashboard.

The rule produces: a status badge per room (OK / Too Cold / Too Hot); alert flags on devices whose temperature violates their room's threshold; a suggested action when a room falls below its setpoint (e.g. "Room 3 is 2°C below setpoint — consider raising valve to 22°C"); and an anomaly flag when the current temperature is more than a configured gap below the valve's setpoint. In v1, anomaly detection is live-state only — if current temp < (setpoint − configured gap threshold), the room is flagged. No time-based drift tracking.

All thresholds — comfort band minimum, comfort band maximum, and anomaly gap — are configurable per room by an admin through the dashboard UI. A global default applies to rooms with no per-room override.

## Access Control

Authentication is required. All users log in with email and password. No unauthenticated access is permitted, even from within the company LAN.

Role model: flat. All authenticated users have identical access — they can view all devices and issue control commands. No role separation in MVP.

The dashboard is served on the company LAN only and is not reachable from the internet. Admin functions (room assignment, threshold configuration) are accessible to any authenticated user.

## Non-Goals

- **No historical temperature data** — no charts, graphs, or time-series views in v1. Temperature history deferred to v2.
- **No automation creation or scheduling** — users cannot create time-based rules (e.g. "heat room at 7am") in v1. Automation features deferred to v2.
- **No automation execution history** — no log of past automation runs. Deferred to v2.
- **No external notifications** — threshold alerts and anomaly flags appear in the dashboard UI only. No email, SMS, or push notifications in v1.
- **No multi-site support** — single office location only. No multi-tenant or multi-building architecture.

## Open Questions

1. **Timeline:** MVP estimated at 3 weeks after-hours; soft target 2026-06-10 (confirmed not a hard gate — scope is fixed, deadline is flexible). Owner: user. No blocking dependency.
2. **Device model list:** Control (FR-011) is scoped to confirmed device models with known local protocol control codes. The specific models in use must be documented before implementation of FR-011 begins. Owner: user. Block: yes for FR-011.
3. **Local key provisioning:** Device local encryption keys must be obtained from the Tuya IoT Platform or via local key extraction before discovery (FR-002/FR-003) can be built. This is an operational prerequisite, not a development task, but it gates implementation start. Owner: user. Block: yes for FR-002/FR-003.
