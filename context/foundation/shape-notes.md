---
project: Tuya Device Dashboard — Dziennik Zdarzeń
context_type: brownfield
created: 2026-06-29
updated: 2026-06-30
product_type: web-app
target_scale:
  users: small
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 9
  timeline_budget:
    delivery_weeks: 2
    hard_deadline: null
    after_hours_only: true
  quality_check_status: accepted
---

## Business Logic

Każde zdarzenie domenowe (przekroczenie progu, zmiana stanu urządzenia, zmiana łączności, wysłany alert) jest trwale zapisane do `event_log` z timestampem i możliwe do chronologicznego przeglądania.

Dwie reguły precyzujące:

- **Próg temperatury — leading edge only:** zdarzenie zapisywane wyłącznie w momencie pierwszego przekroczenia progu. Kolejne odczyty powyżej progu (bez powrotu do normy) nie generują nowych wpisów. Wpis powstaje ponownie dopiero gdy temperatura wróci do normy, a następnie ponownie przekroczy próg.
- **Łączność — każde przejście:** każde przejście urządzenia offline→online lub online→offline generuje osobny wpis. Brak deduplikacji przy częstych fluktuacjach.

## Non-Functional Requirements

- Strona `/events` ładuje się w < 2s dla feedu z ostatnich 24h przy flocie 1–5 urządzeń per site.
- Czas ładowania strony głównej dashboardu nie wzrasta po dodaniu `event_log` — tabela nie jest queryowana na `/`.
- Strona `/events` jest dostępna wyłącznie dla zalogowanych użytkowników — niezalogowani otrzymują redirect do logowania.

## Non-Goals

- Brak notyfikacji push/SMS o zdarzeniach — alerty e-mail istnieją i nie są zmieniane; push/SMS to osobna zmiana.
- Brak mechanizmu retencji/archiwizacji starych wpisów `event_log` w v1 — czyszczenie tabeli poza zakresem tej zmiany.
- Brak zmian w logice wyzwalania alertów e-mail — wyłącznie logujemy fakt wysłania, istniejący mechanizm alertów pozostaje nienaruszony.

## Open Questions

- Retencja `event_log`: przez ile dni/tygodni przechowywać wpisy? Brak decyzji — wymaga ustalenia przed implementacją (wpływa na indeksowanie i rozmiar bazy).

## Constraints & Preserved Behavior

- Błąd zapisu do `event_log` nie blokuje `toggleHeat` ani device pollingu — INSERT owinięty try/catch w każdym miejscu hookowania.
- `event_log` nie jest queryowany na stronie głównej dashboardu — brak wpływu na czas ładowania istniejącej strony.
- Istniejące tabele (`device_temperature_readings`, `device_state_store`, `alert_states`) pozostają bez zmian — nowa tabela `event_log` jest addytywna.
- Istniejący mechanizm NextAuth (email/password lub OAuth) bez zmian.

## Current System

Tuya Device Dashboard to web app (Next.js 15 + shadcn/ui + tRPC + libsql/SQLite) dla facility managerów (1–5 osób per site). Dashboard pokazuje karty pokojów z temperaturą live, heat toggle (pinnedOff), automation modes, alerty e-mail przy przekroczeniu progu. Dane temperaturowe są już składowane w tabeli `device_temperature_readings`. Stan urządzeń (online/offline, temperatureC) trzymany w `device_state_store` (in-memory, polled co 30s). Alerty śledzone przez `alert_states` (kolumna `notifiedAt`). Historia temperatury dostępna przez `api.device.temperatureHistory`. Brak jakiejkolwiek tabeli zdarzeń — system pokazuje tylko present state, nigdy trajektorię.

Tech stack: Next.js 15 (Turbopack), tRPC, Drizzle ORM, libsql/SQLite, shadcn/ui, Recharts, Zod, NextAuth.

Must preserve: istniejący dashboard, room-quick-overview-panel, room-modal w automation-flow canvas, heat toggle, alerty e-mail, polling urządzeń.

## Vision & Problem Statement

Facility manager wraca po 12h przerwy i nie wie co się wydarzyło. Dashboard pokazuje obecny stan — ale czy sensor był offline przez 3 godziny? Czy ogrzewanie w sali konferencyjnej zostało ręcznie wyłączone wczoraj wieczorem? Czy alert poszedł, zanim temperatura wróciła do normy? Na te pytania nie ma teraz odpowiedzi.

Dziennik zdarzeń to osobna strona `/events` z chronologicznym feedem czterech klas zdarzeń: przekroczenia progów temperatury (zbyt zimno / zbyt gorąco), ręczne zmiany heat toggle (pinnedOff on/off), urządzenia które wyszły offline lub wróciły online, i wysłane alerty e-mail. Dane trafią do nowej tabeli `event_log` w SQLite, zapisywanej przy każdym zdarzeniu w istniejących procedurach serverowych.

## Success Criteria

### Primary
FM otwiera `/events`, widzi chronologiczny feed czterech klas zdarzeń (przekroczenia progu temp, zmiany heat toggle, urządzenia offline/online, wysłane alerty) z ostatnich 24h, posortowany od najnowszego, ładuje się w < 2s.

### Secondary
FM może filtrować feed po typie zdarzenia (threshold / toggle / connectivity / alert) — zmniejsza szum przy dużej flocie.

### Guardrails
- Błąd zapisu do `event_log` nie crashuje `toggleHeat` ani device polling — INSERT owinięty try/catch, główna operacja kontynuuje.
- Istniejący dashboard nie jest wolniejszy — `event_log` nie jest queryowany na stronie głównej.

## Functional Requirements

### Nowe możliwości

- FR-001: FM może otworzyć stronę `/events` z chronologicznym feedem zdarzeń z ostatnich 24h, posortowanym od najnowszego, z limitem 200 rekordów per zapytanie. Priority: must-have. Change: new
  > Socrates: Rozważony kontr-argument: "przy dużej flocie 24h może być przytłaczające." Rezolucja: zakres 24h pozostaje (skala 1–5 urządzeń per site sprawia, że feed jest krótki), dodano LIMIT 200 jako guardrail na wypadek skrajnych przypadków.
- FR-002: System zapisuje przekroczenia progu temperatury (zbyt zimno / zbyt gorąco) do `event_log` w momencie ich wykrycia. Priority: must-have. Change: new
  > Socrates: Rozważony kontr-argument: "hookowanie w istniejącym kodzie ryzykuje regresy w krytycznych ścieżkach." Rezolucja: inline hooks z try/catch wystarczą; błąd zapisu nie blokuje głównej operacji. Podejście przyjęte.
- FR-003: System zapisuje ręczne zmiany heat toggle (pinnedOff on/off) do `event_log` przy każdej zmianie stanu. Priority: must-have. Change: new
  > Socrates: Jak FR-002 — inline hook z try/catch. Podejście przyjęte.
- FR-004: System zapisuje zdarzenia przejścia urządzenia offline i powrotu online do `event_log`. Priority: must-have. Change: new
  > Socrates: Jak FR-002 — inline hook z try/catch. Podejście przyjęte.
- FR-005: System zapisuje każdy wysłany alert e-mail do `event_log`. Priority: must-have. Change: new
  > Socrates: Jak FR-002 — inline hook z try/catch. Podejście przyjęte.
- FR-006: FM może filtrować feed po pokoju lub urządzeniu. Priority: nice-to-have. Change: new
  > Socrates: Rozważony kontr-argument: "filtr po typie zdarzenia jest ważniejszy." Rezolucja: filtr po pokoju/urządzeniu jest bardziej użyteczny dla FM zarządzającego wieloma pokojami ("pokaż tylko salę 3"). Filtr po typie przeniesiony do v2 jako ewentualne rozszerzenie.

### Zachowane zachowania

- FR-007: `toggleHeat` kontynuuje działanie gdy zapis do `event_log` się nie powiedzie — INSERT owinięty try/catch. Priority: must-have. Change: preserved
  > Socrates: Rozważony kontr-argument: "cicha degradacja maskuje trwałe awarie bazy." Rezolucja: główna operacja (ogrzewanie) jest krytyczna; błąd logu nie powinien jej blokować. Podejście przyjęte. Trwałe awarie `event_log` będą widoczne jako pusty feed — FM to zauważy.
- FR-008: Device polling kontynuuje działanie gdy zapis do `event_log` się nie powiedzie — INSERT owinięty try/catch. Priority: must-have. Change: preserved
  > Socrates: Jak FR-007. Podejście przyjęte.
- FR-009: Istniejący dashboard wyświetla się bez regresji — `event_log` nie jest queryowany na stronie głównej. Priority: must-have. Change: preserved

## User Stories

### US-01: FM przegląda dziennik zdarzeń

- **Given:** FM jest zalogowany i otwiera stronę `/events`
- **When:** strona się załaduje
- **Then:** widzi chronologiczny feed zdarzeń z ostatnich 24h (przekroczenia progu, zmiany toggleHeat, urządzenia offline/online, wysłane alerty), posortowany od najnowszego, załadowany w < 2s

## Access Control

NextAuth — email/password lub OAuth (istniejący mechanizm, bez zmian). Wszyscy zalogowani użytkownicy widzą to samo — brak ról, brak separacji per site w modelu uprawnień. Strona `/events` dostępna dla każdego zalogowanego. No changes planned — current model preserved.

## User & Persona

**Facility manager** — zarządza 1–5 site'ami, loguje się codziennie rano żeby sprawdzić stan floty. Nie jest technikiem — nie czyta logów systemowych. Potrzebuje odpowiedzi na pytanie "co się działo kiedy mnie nie było?" w ciągu 10 sekund od otwarcia strony.
