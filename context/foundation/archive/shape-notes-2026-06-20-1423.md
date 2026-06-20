---
project: Tuya Device Dashboard — S-17 Visual & UX Redesign
updated: 2026-06-15

context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 2
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 6
  quality_check_status: accepted
---

> Seed idea: redesign wyglądu aplikacji — "wygląda tanio, brak spójności, brak ilustracji, słaby dashboard, brak light mode"

## Current System

Tuya Device Dashboard — działający brownfield:
- Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Tailwind CSS, shadcn/ui
- Dark-only design, brak spójnej palety i systemu designu
- Kafelki urządzeń nie rozróżniają wizualnie sensor / valve / plug
- Strona główna po zalogowaniu: słaby dashboard — brak wykresów na widoku głównym, brak KPI row
- Brak trybu jasnego

**Must preserve:** polling loop (30s), sterowanie zaworami, room health scoring, temperature history, multi-site scoping, auth gate — żadna logika nie jest zmieniana.

## Vision & Problem Statement

Facility managerowie pracują z dashboardem który wygląda jak szkic, nie jak narzędzie pracy. Ciemne tło bez hierarchii, kafelki bez charakteru, strona główna bez żadnej informacji na pierwszy rzut oka.

**Zmiana:** Przeprojektowanie warstwy wizualnej i UX — Grafana/Datadog aesthetic: data-dense, wykresy na pierwszym planie, profesjonalny monitoring feel. Priorytet: strona główna / dashboard. Uzupełnienie: ikony rozróżniające typy urządzeń (Lucide/Phosphor), pełny system dark + light z przełącznikiem.

**Insight:** Stack jest gotowy — Tailwind + shadcn/ui obsługuje dark/light class strategy. Recharts już zainstalowany. Żadna nowa biblioteka nie jest wymagana do core zmiany — problem jest w tym JAK używamy obecnych narzędzi.

**Estetyczna referencja:** Grafana / Datadog — data-dense, wykresy na pierwszym planie, każdy piksel niesie informację. Ciemny motyw czytelny, jasny jako alternatywa z przełącznikiem.

## User & Persona

**Rola:** Facility manager / administrator biura (2–5 osób w organizacji)
**Moment bólu:** Otwarcie dashboardu rano — chce natychmiast zobaczyć stan pomieszczeń, alerty, trendy temperatury. Zamiast tego widzi listę kafelków bez kontekstu.
**Urządzenie:** Desktop browser (primary), mobile (secondary — S-08 już zrobiony)

## Access Control

Brak zmian — obecny model zachowany: jeden typ użytkownika, pełny dostęp po zalogowaniu email + password.
Preferencja dark/light przechowywana client-side (localStorage / cookie), nie wymaga zmiany schematu DB ani ról.

## Success Criteria

### Primary
Po zalogowaniu użytkownik widzi w ciągu 2 sekund:
1. KPI row: urządzenia online/offline, liczba pokoi, aktywne alerty termiczne
2. Wykresy temperatur per pokój (prominentne, nie tylko sparklines)
3. Wykres kołowy: rozkład urządzeń per pokój
4. Każdy kafelek urządzenia ma ikonę rozróżniającą sensor / valve / plug
5. Przełącznik dark/light mode dostępny w nawigacji — preferencja persystuje między sesjami (localStorage)

### Secondary
- Ogólna spójność wizualna: paleta, typografia, spacing — feel zbliżony do Grafana/Datadog
- Mobile: redesign nie psuje S-08 (375px viewport)

### Guardrails
- Zero zmian w logice backendowej — polling, scoring, history, multi-site bez modyfikacji
- Wszystkie istniejące funkcje pozostają dostępne (nie chowamy niczego za redesignem)

## Functional Requirements

### Dashboard

- FR-001: Użytkownik widzi KPI row natychmiast po zalogowaniu: urządzenia online/offline, liczba pokoi, aktywne alerty termiczne. Priority: must-have. Change: modified (S-15 dodał KPI row; ten slice przeprojektowuje jego wygląd i spójność wizualną).
  > Socrates: Kontrargument rozważony: "S-15 już dodał KPI row — może to tylko poprawa wyglądu?". Rezolucja: zakwalifikowane jako modified, nie new — scope jest precyzyjny. FR stoi.

- FR-002: Użytkownik widzi wykresy temperatur per pokój na głównym widoku dashboardu (prominentne, nie tylko sparklines). Priority: must-have. Change: modified.
  > Socrates: Kontrargument rozważony: "przy 10+ pokojach dashboard się załamie". Rezolucja: skala produktu to 2–5 pokoi (PRD §target_scale: small). FR stoi.

- FR-003: Użytkownik widzi wykres kołowy z rozkładem urządzeń per pokój. Priority: must-have. Change: new.
  > Socrates: Kontrargument rozważony: "wartość informacyjna niska — slot lepiej na health status". Rezolucja: user wyraził potrzebę wprost; health status jest już w KPI row (alerty). FR stoi.

### Urządzenia

- FR-004: Każdy kafelek urządzenia wyświetla unikalną ikonę rozróżniającą sensor / valve / plug (Lucide lub Phosphor). Priority: must-have. Change: new.
  > Socrates: Kontrargument rozważony: "typ jest widoczny w nazwie — ikona to dekoracja". Rezolucja: ikona daje rozpoznanie < 200ms bez czytania; przy mixed-type room jest rzeczywistą wartością.

### Motyw

- FR-005: Użytkownik może przełączać dark / light mode; preferencja persystuje w localStorage między sesjami. Priority: must-have. Change: new.
  > Socrates: Kontrargument rozważony: "dark/light podwaja koszt każdej przyszłej zmiany UI". Rezolucja: koszt zaakceptowany świadomie — light mode to wyrażona potrzeba użytkownika, nie opcja. Każdy przyszły komponent musi być testowany w obu trybach.

- FR-006: Cała aplikacja (wszystkie strony i komponenty) renderuje się poprawnie w obu motywach. Priority: must-have. Change: new.
  > Socrates: Objęte odpowiedzią do FR-005 — koszt zaakceptowany.

## Non-Goals

- **Custom SVG icons rysowane od zera** — wyłącznie gotowe ikony z Lucide lub Phosphor; zero angażowania designera.
- **Widget historii automatyzacji** — wykluczone z tego slica; dojdzie razem z S-12 gdy będzie co pokazywać. Placeholder dopuszczalny jeśli slot jest potrzebny layoutowo.

## Business Logic

Brak zmian w logice domenowej — ta zmiana jest infrastructure/visual-only. Istniejące reguły pozostają nienaruszone:
- `scoreRoom()` — ocena health per pokój na każdym cyklu pollingu
- Valve setpoint control — DP command przez TuyaGatewayClient
- Temperature history — append co 30s, purge 30 dni

## Constraints & Preserved Behavior

- Polling worker (30s cycle) nie jest dotykany — żaden komponent UI nie może spowalniać ani blokować pętli
- Wszystkie istniejące tRPC endpoints pozostają bez zmian
- Mobile layout (S-08, 375px viewport) nie może regresować
- Dane w SQLite nie są migrowane — zero zmian schematu

## Non-Functional Requirements

- Dashboard renderuje się w < 2s po zalogowaniu — wykresy i KPI widoczne bez dodatkowego fetcha
- Kontrast tekstu spełnia WCAG AA (4.5:1) w obu motywach — light mode nie może być wash-out
- Przełącznik dark/light działa bez FOUC (flash of unstyled content) — motyw odczytywany z localStorage przed renderem, nie po

## User Stories

### US-01: Poranny przegląd stanu biura
**Given** jestem zalogowany jako facility manager,
**When** otwieram dashboard,
**Then** widzę w ciągu 2 sekund: KPI row (online/offline, pokoje, alerty), wykresy temperatur per pokój, wykres kołowy urządzeń, każde urządzenie z ikoną swojego typu — bez żadnego dodatkowego klikania.
