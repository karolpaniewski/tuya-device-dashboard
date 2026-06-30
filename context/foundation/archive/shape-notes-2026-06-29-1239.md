---
project: Tuya Device Dashboard — Automation Flow Bulk-Connect
context_type: brownfield
created: 2026-06-29
updated: 2026-06-29
product_type: web-app
target_scale:
  users: small
checkpoint:
  current_phase: 7
  phases_completed: [1, 2, 3, 4, 5, 6]
  frs_drafted: 6
  timeline_budget:
    delivery_weeks: 1
    hard_deadline: null
    after_hours_only: true
  gray_areas_resolved:
    - topic: selection mechanism
      decision: multi-select na nodach w canvas — shift+click i lasso-select na room-nodach
    - topic: mode context
      decision: klik mode-node najpierw → aktywuje go jako cel; potem zaznaczasz rooms
    - topic: duplicates
      decision: idempotent — rooms już połączone z aktywnym mode są pomijane bez komunikatu
    - topic: mixed selection UI
      decision: dwa osobne przyciski z licznikami "Connect N" i "Disconnect M" — oba widoczne jednocześnie
    - topic: backend
      decision: jeden nowy tRPC call addTargets(roomId[]) — atomowy INSERT w transakcji; analogicznie removeTargets
    - topic: undo
      decision: brak undo — toast z potwierdzeniem ("Connected 3 rooms") wystarczy
  quality_check_status: accepted
---

> Seed idea (verbatim): "bulk-connect"

## Current System

Tuya Device Dashboard ma działający `/automation-flow` — flow-chart wizualizacja
mode → room → urządzenie zbudowana na `@xyflow/react` v12. Ostatnia zmiana
(editable-automation-flow) dodała drag-to-connect (jedno połączenie na raz)
i klik-na-edge = detach.

**Tech stack:** Next.js 15 + React 19, tRPC v11, @xyflow/react v12, Drizzle ORM
+ libsql (SQLite).

**Users:** facility manager / office administrator — single flat role.

**Pain / gap:** drag-to-connect jeden room na raz — przy N rooms przypisanych do
jednego mode użytkownik musi zrobić N osobnych gestów. Przy 6–10 rooms to
powtarzalna, monotonna robota.

**Must preserve:** istniejący drag-to-connect (edge z handle), klik-na-edge
(detach), Setup editor (Automations tab) — żadna istniejąca interakcja nie może
się zepsuć.

## Vision & Problem Statement

Rozszerzyć editable automation flow-chart o bulk-operacje: użytkownik zaznacza
wiele room-nodów naraz i łączy/odłącza je od aktywnego mode jednym kliknięciem,
zamiast robić to jeden po jednym.

**Change category:** nowa funkcja (rozszerzenie istniejącego modułu).

**Dlaczego teraz:** mechanizm selekcji (`@xyflow/react` multi-select) jest
dostępny w bibliotece bez dodatkowej pracy. Infrastruktura (`automationModeTargets`,
`addTarget`/`removeTarget` tRPC procedures) jest gotowa — bulk to po prostu
N operacji w jednym request.

## User & Persona

**Primary:** facility manager / office administrator — bez zmian. Nowa funkcja
skraca czas konfiguracji gdy mode dotyczy wielu rooms jednocześnie.

## Access Control

Bez zmian. Flat single-role model (admin), single seeded user. Bulk-connect
używa tych samych authorization checks co istniejący addTarget/removeTarget.

## Success Criteria

### Primary
Użytkownik otwiera `/automation-flow`, klika mode-node, shift+klika 4 room-nody,
klika "Connect 4" — 4 krawędzie pojawiają się na canvas, toast "Connected 4 rooms"
się wyświetla. Drugi klik "Connect 4" na tych samych rooms — nic się nie dzieje
(idempotent).

### Secondary
Użytkownik zaznacza mieszankę rooms (2 połączone, 3 nie) — toolbar pokazuje
"Connect 3" i "Disconnect 2" jednocześnie. Klik "Disconnect 2" usuwa 2 krawędzie,
toast "Disconnected 2 rooms".

### Guardrails
- Istniejący drag-to-connect (jeden na raz) nadal działa bez regresji.
- Klik na edge (detach) nadal działa bez regresji.
- Setup editor (Automations tab) — bez żadnych zmian.

## Functional Requirements

### Selekcja i aktywacja

- FR-001: Admin może kliknąć mode-node aby ustawić go jako aktywny cel
  bulk-operacji (wizualny highlight stanu aktywności).
  Priority: must-have. Change: new.
  > Socrates: kontr-argument "klik = otwiera edit-panel" rozważony. Przy
  > obecnym brak edit-panelu w flow-chart klik jest wolny. Stoi.

- FR-002: Admin może shift+kliknąć lub lasso-zaznaczyć wiele room-nodów na canvas.
  Priority: must-have. Change: new.
  > Socrates: kontr-argument "lasso koliduje z drag-to-connect" rozważony.
  > Drag-to-connect startuje z handle (małego circle na nodzie), lasso startuje
  > z pustego tła canvas — różne gesty, brak kolizji. Stoi.

### Bulk-akcje

- FR-003: Admin może bulk-połączyć wszystkie zaznaczone (niepołączone) rooms
  z aktywnym mode jednym kliknięciem "Connect N"; rooms już połączone są pomijane.
  Priority: must-have. Change: new.
  > Socrates: kontr-argument "dwa przyciski mylące przy mixed selection" rozważony.
  > Rozwiązanie: liczniki w labelach ("Connect 3", "Disconnect 2") eliminują
  > dwuznaczność. Stoi po rewizji.

- FR-004: Admin może bulk-odłączyć wszystkie zaznaczone (połączone) rooms od
  aktywnego mode jednym kliknięciem "Disconnect M"; rooms bez krawędzi są pomijane.
  Priority: must-have. Change: new.
  > Socrates: patrz FR-003.

### Zachowane (preserved)

- FR-005: Admin może nadal drag-to-connect jeden room do jednego mode
  (istniejące zachowanie zachowane).
  Priority: must-have. Change: preserved.

- FR-006: Admin może nadal kliknąć pojedynczą krawędź aby ją usunąć
  (istniejące zachowanie zachowane).
  Priority: must-have. Change: preserved.

## User Stories

### US-01: Bulk-connect wiele rooms do mode

Given: użytkownik jest na `/automation-flow`, widzi canvas z mode-nodami i room-nodami
When: klika mode-node "Night Mode" → shift+klika 4 room-nody (2 niepołączone,
  2 już połączone) → klika "Connect 2" w toolbarze
Then: 2 nowe krawędzie pojawiają się na canvas, toast "Connected 2 rooms",
  2 już-połączone rooms — bez zmian

## Business Logic

Zmiana infrastrukturalna — brak nowej reguły domenowej. `automationModeTargets`
działają na tych samych regułach co dotąd: room-level targeting, scheduler tick
per mode, valve state commands.

Bulk-connect = N atomowych INSERTów w jednej transakcji (`addTargets` tRPC
procedure). Bulk-disconnect = N DELETEs w jednej transakcji (`removeTargets`).
Idempotentność: INSERT ignoruje duplikaty (unique constraint lub explicit check);
DELETE ignoruje brak rekordu (no-op).

## Non-Functional Requirements

- Bulk-akcja (connect lub disconnect) na ≤ 20 rooms kończy się w czasie
  postrzeganym przez użytkownika jako natychmiastowy (< 500ms p95 na LAN).
- Toast feedback po każdej bulk-akcji: "Connected N rooms" / "Disconnected M rooms".
- Canvas nie migocze podczas dodawania/usuwania krawędzi (optimistic update
  lub instant re-render po mutacji).

## Constraints & Preserved Behavior

- `addTarget` i `removeTarget` tRPC procedures mogą być reused lub rozszerzone;
  schemat bazy danych (`automationModeTargets`) nie zmienia się.
- `/automation-flow` route i istniejące node types (`ModeNode`, `RoomNode`,
  edge styles) — bez zmian strukturalnych.
- Setup editor (Settings → Automations tab) — bez żadnych zmian (oddzielna
  surface, ten sam data layer).

## Non-Goals

- Brak zmian w Setup editor (Automations tab) — edycja schedule, nazwy mode
  i innych atrybutów nadal odbywa się w Setup, nie w flow-chart.

## Open Questions

(brak — wszystkie gray areas rozwiązane podczas sesji)
