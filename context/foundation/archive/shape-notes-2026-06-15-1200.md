---
project: Tuya Device Dashboard — S-11 Automation Rules
updated: 2026-06-12
context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 9
  quality_check_status: accepted
---

> Seed idea: S-11 automation-rules — "automatyzacja która umożliwia uruchamianie zależności głowica → sensor temperatury, optymalizacja kosztów ogrzewania biura"

## Current System

Tuya Device Dashboard — działający brownfield z:
- Live device overview (30s polling worker, custom Next.js server)
- Valve setpoint control (S-04) — tRPC mutation wysyłająca DP command przez TuyaGatewayClient
- Room health scoring — scoreRoom() ewaluuje sensor vs threshold per poll cycle
- Temperature history — SQLite append, purge 30 dni
- Multi-site support — siteId na wszystkich tabelach

**Tech stack:** Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Vitest, Biome, GitHub Actions CI.

**Must preserve:** polling loop (30s), ręczne sterowanie zaworami, room health scoring, temperature history, multi-site scoping.

## Vision & Problem Statement

Facility managerowie muszą ręcznie dostosowywać setpointy zaworów grzewczych — biuro ogrzewa się bez związku z faktyczną temperaturą i godzinami użytkowania. Koszty są nieoptymalne.

**Zmiana:** Dashboard pozwala tworzyć reguły automatyzacji wiążące sensor temperatury z głowicą grzewczą — system sam utrzymuje zadaną temperaturę komfortu w godzinach pracy i przełącza na tryb ekonomiczny poza nimi.

**Insight:** Infrastruktura jest gotowa: polling worker co 30s dostarcza odczyty sensorów, TuyaGatewayClient obsługuje komendy setpoint, Drizzle + SQLite przechowuje konfigurację. Brakuje wyłącznie warstwy reguł i schedulera oceniającego je na każdym cyklu.

## User & Persona

**Primary persona:** Facility manager (2–5 osób, płaskie uprawnienia — bez zmian od v1)

- Chce ustawić "temperatura w pokoju A powinna być 21°C w godzinach 7:00–18:00, pon–pt"
- Nie chce ręcznie zmieniać setpointów każdego dnia
- Oczekuje że poza godzinami biuro przejdzie w tryb ekonomiczny automatycznie

## Access Control

**Bez zmian** — istniejący model auth (email + password, flat permissions). Wszystkie sesje mają identyczny dostęp do tworzenia, edycji i usuwania reguł automatyzacji.

`No changes planned — current model preserved.`

## Success Criteria

### Primary
Admin otwiera sekcję Automations, tworzy regułę wiążącą sensor z głowicą (próg temperatury, setpoint komfortu, setpoint ekonomiczny, godziny pracy, dni tygodnia). System co 60s ewaluuje reguły i wysyła komendy — biuro utrzymuje zadaną temperaturę bez ręcznej interwencji.

MVP flow:
1. Admin otwiera /automations
2. Tworzy regułę: wybiera sensor → głowicę → ustawia próg, oba setpointy, godziny, dni
3. UI ostrzega jeśli inna reguła aktywna na tej samej głowicy w tym samym oknie
4. Reguła zapisana — widoczna na liście z togglem enable/disable
5. Scheduler (co 60s): jeśli w godzinach pracy i temp < (próg − 0.5°C) → wyślij setpoint_komfort; poza godzinami → wyślij setpoint_ekono
6. Każde dispatched polecenie logowane (umożliwia S-12)

### Secondary
Reguły można duplikować (skopiuj ustawienia jako punkt startowy dla nowej).

### Guardrails
- **Existing manual control preserved:** ręczne ustawienie setpointa przez użytkownika nigdy nie jest nadpisywane bez pełnego cyklu schedulera (scheduler działa co 60s, nie natychmiast)
- **No silent failures:** każda komenda wyslana przez scheduler jest logowana z wynikiem (sukces / błąd)
- **Conflict gate:** system nie pozwala zapisać reguły nakładającej się czasowo na tej samej głowicy bez potwierdzenia przez użytkownika

## Functional Requirements

### Rule Management
- FR-001: User can create an automation rule specifying: source sensor, target valve, temperature threshold (°C), comfort setpoint (°C), economy setpoint (°C), active days of week, and working-hours window (start and end time HH:MM). Priority: must-have. Change: new
  > Socrates: Counter-argument: "room already has threshold config from S-05 — should automation reuse that?" Resolution: kept separate. S-05 threshold is for display scoring only; automation threshold is the trigger for action. Different semantic — conflating them would make S-05 config surprising to edit.

- FR-002: System evaluates all active automation rules every 60 seconds, reading the latest sensor temperature from the in-memory device state. Priority: must-have. Change: new
  > Socrates: Counter-argument: "60s is too slow — temperature could overshoot." Resolution: acceptable. Tuya polling is already 30s; 60s evaluation keeps the scheduler lightweight. Overshoot risk is low for heating (thermal inertia of a room >> 60s).

- FR-003: Within working hours: if sensor temperature is below (threshold − 0.5°C), system sends comfort setpoint to target valve; if above (threshold + 0.5°C), no command is sent (hysteresis band prevents rapid cycling). Priority: must-have. Change: new
  > Socrates: Counter-argument: "fixed 0.5°C hysteresis may be too tight for some rooms." Resolution: kept fixed for MVP — configurable hysteresis is a nice-to-have for v2. 0.5°C matches typical sensor precision.

- FR-004: Outside working hours window, system sends economy setpoint to target valve regardless of current temperature. Priority: must-have. Change: new
  > Socrates: Counter-argument: "sending economy setpoint every 60s outside hours means many redundant commands to the valve." Resolution: optimise: only send economy command once when window closes (on transition), not every cycle. Noted as implementation constraint.

- FR-005: User can view all automation rules in a list showing: sensor name, valve name, threshold, working hours, active days, enable/disable status. Priority: must-have. Change: new
  > Socrates: No counter-argument; list view is prerequisite to managing rules.

- FR-006: User can toggle a rule between active and inactive without deleting it. Priority: must-have. Change: new
  > Socrates: No counter-argument; essential for temporary disable (e.g. office closed for holiday).

- FR-007: User can edit or delete an existing automation rule. Priority: must-have. Change: new
  > Socrates: Counter-argument: "delete is destructive — should soft-delete be used?" Resolution: hard delete for MVP. Execution log (FR-009) already preserves history via rule_id reference; soft-delete adds complexity without user value at this scale.

- FR-008: When saving a rule whose active-days + working-hours window overlaps with an existing active rule on the same target valve, UI displays a warning requiring explicit user confirmation before saving. Priority: must-have. Change: new
  > Socrates: Counter-argument: "blocking on any overlap is too strict — one rule for comfort, one for economy on same valve should be allowed." Resolution: clarified. The conflict check is for SAME trigger type / overlapping time window on same valve, not between comfort + economy modes of the same logical rule. Design implication: comfort + economy are fields of ONE rule, not two rules. FR-008 stands.

- FR-009: System appends a log entry for each scheduler cycle that results in a dispatched command: timestamp, rule_id, sensor_reading_celsius, target_setpoint, valve_id, success/error. Priority: must-have. Change: new
  > Socrates: Counter-argument: "logging every command at 60s intervals for N rules = heavy write load." Resolution: log only on dispatch (when a command is actually sent), not on every evaluation cycle. No-op evaluations (temp in band, outside hours with economy already set) are not logged.

## User Stories

### US-01: Create and activate an automation rule
**Given** I am logged into the dashboard,
**When** I navigate to Automations, create a rule linking Sensor A to Valve B with threshold 20°C, comfort setpoint 22°C, economy setpoint 16°C, Mon–Fri 07:00–18:00, and save it,
**Then** the rule appears in the list as active, and within 60 seconds the scheduler begins evaluating it and sending setpoint commands based on current temperature and time.

## Business Logic

**Domain rule (one sentence):** The app evaluates each active automation rule on a 60-second cycle — it compares the assigned sensor's latest reading against the rule's threshold (with ±0.5°C hysteresis), checks whether current time falls within the rule's working-hours window, and dispatches a comfort or economy setpoint command to the target valve only when a state transition is warranted.

**Inputs the rule consumes (as the user sees them):**
- Latest temperature reading from the assigned sensor (from 30s polling state)
- Current server time (compared against working-hours window and active days)
- Rule configuration: threshold, comfort setpoint, economy setpoint, hours, days

**Output the user encounters:**
- Valve setpoint changes automatically without manual intervention
- Execution log entry per dispatched command (feeds S-12 history view)
- UI: last-evaluated timestamp and last-sent command visible on rule list row (nice-to-have)

**State machine per rule (per evaluation cycle):**
```
if disabled → skip
if current time NOT in (active_days × working_hours) → send economy_setpoint (on transition only)
if current time in window:
  if sensor_temp < threshold − 0.5 → send comfort_setpoint
  if sensor_temp > threshold + 0.5 → no command (already warm)
  if threshold − 0.5 ≤ sensor_temp ≤ threshold + 0.5 → no command (hysteresis band)
```

## Constraints & Preserved Behavior

- **Polling worker continuity:** the existing 30s polling loop must not be modified — scheduler reads from its in-memory state store, does not add its own device polling
- **TuyaGatewayClient reuse:** automation dispatches setpoint commands through the same TuyaGatewayClient path as manual control (S-04), not a parallel path
- **siteId scoping:** automation rules are scoped to a site (inherit from the valve's room's siteId)
- **Existing valve control unaffected:** manual setpoint control from device detail view remains fully functional; automation is additive, not replacing
- **SQLite only:** no new database engine; automation_rules and automation_logs tables added via Drizzle migration

## Non-Functional Requirements

- **Scheduler reliability:** rule evaluation must complete within the 60s cycle even with 50 devices and 20 rules; no blocking I/O in the evaluation loop
- **Log retention:** automation_logs purged after 30 days (same policy as temperature_history)
- **No silent failures:** dispatch errors are caught and logged; they do not crash the scheduler or the polling worker

## Non-Goals

- **No complex triggers:** humidity, CO2, motion, or occupancy sensors — temperature + time only in v1
- **No rule chaining / dependencies:** rules are independent; one rule cannot trigger another
- **No push / email notifications** on rule execution — execution log only (S-12 covers history UI)
- **No mobile optimisation** for automations UI — desktop-first (consistent with existing scope)
- **Automation history UI (S-12)** is a separate slice — this slice writes the log, S-12 reads it

## Open Questions

- **Transition command deduplication:** when valve already has economy setpoint from previous cycle, should the scheduler skip the command or send it anyway? Recommendation: skip (compare last-sent value); avoids unnecessary Tuya commands. Confirm during plan.
- **Rule name field:** should rules have a user-defined name, or auto-generate from "Sensor X → Valve Y"? Lean toward user-defined for readability on the list.

## Forward: technical-roadmap

- S-12 automation-history: read-only log view on top of automation_logs table written by this slice
- v2 nice-to-haves: configurable hysteresis per rule, rule duplication, "test rule" dry-run mode
