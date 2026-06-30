---
project: Tuya Device Dashboard — Dziennik Zdarzeń
version: 11
status: draft
created: 2026-06-30
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 2
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

Tuya Device Dashboard to web app dla facility managerów (1–5 osób per site) zarządzających flotą urządzeń HVAC. System pokazuje karty pokojów z temperaturą na żywo, heat toggle (pinnedOff), automation modes i alerty e-mail przy przekroczeniu progu.

**Architektura:** monolityczna aplikacja Next.js 15 (Turbopack) z warstwą API tRPC, ORM Drizzle, bazą SQLite (libsql), komponentami shadcn/ui i wykresami Recharts. Autentykacja przez NextAuth.

**Istniejące dane:** dane temperaturowe składowane w `device_temperature_readings`; stan urządzeń (online/offline, temperatureC) w `device_state_store` (in-memory, polling co 30s); stany alertów w `alert_states` (kolumna `notifiedAt`); historia temperatury dostępna przez `api.device.temperatureHistory`.

**Brakująca możliwość:** system nie utrwala historii zdarzeń — pokazuje wyłącznie present state, bez trajektorii. Nie istnieje żadna tabela ani widok zdarzeń.

## Problem Statement & Motivation

Facility manager wraca po przerwie (noc, weekend) i nie może odpowiedzieć na kluczowe pytania operacyjne: czy sensor był offline przez kilka godzin? Czy ogrzewanie w konkretnym pokoju zostało ręcznie wyłączone poprzedniego wieczoru? Czy alert e-mail poszedł przed czy po tym, jak temperatura wróciła do normy?

Dashboard odzwierciedla wyłącznie stan chwilowy — brak trajektorii oznacza brak odpowiedzi. Facility manager musi ufać pamięci lub pytać współpracowników, co przekłada się na opóźnione reakcje i pominięte incydenty.

Zmiana polega na dodaniu trwałego dziennika zdarzeń domenowych — strony `/events` z chronologicznym feedem czterech klas zdarzeń — tak żeby FM mógł odtworzyć "co się działo kiedy mnie nie było?" w ciągu kilkunastu sekund od zalogowania.

## User & Persona

**Facility manager** — zarządza 1–5 site'ami, loguje się codziennie rano żeby sprawdzić stan floty urządzeń. Nie jest technikiem — nie czyta logów systemowych ani surowych danych czujników. Potrzebuje odpowiedzi na pytanie "co się działo kiedy mnie nie było?" w ciągu 10 sekund od otwarcia strony.

## Success Criteria

### Primary

FM otwiera `/events`, widzi chronologiczny feed czterech klas zdarzeń (przekroczenia progu temperatury, zmiany heat toggle, urządzenia offline/online, wysłane alerty e-mail) z ostatnich 24h, posortowany od najnowszego, ładujący się w < 2s.

### Secondary

FM może filtrować feed po pokoju lub urządzeniu — zmniejsza szum przy zarządzaniu wieloma pokojami.

### Guardrails

- Błąd zapisu do dziennika zdarzeń nie blokuje `toggleHeat` ani device pollingu — główna operacja kontynuuje niezależnie od powodzenia zapisu zdarzenia.
- Czas ładowania istniejącego dashboardu nie wzrasta po wdrożeniu tej zmiany — dziennik zdarzeń nie jest odpytywany na stronie głównej.

## User Stories

### US-01: FM przegląda dziennik zdarzeń

- **Given:** FM jest zalogowany i otwiera stronę `/events`
- **When:** strona się załaduje
- **Then:** widzi chronologiczny feed zdarzeń z ostatnich 24h (przekroczenia progu, zmiany toggleHeat, urządzenia offline/online, wysłane alerty), posortowany od najnowszego, załadowany w < 2s

## Scope of Change

### Nowe możliwości

- [new] FM może otworzyć stronę `/events` z chronologicznym feedem zdarzeń z ostatnich 24h, posortowanym od najnowszego, z limitem 200 wpisów per zapytanie. Priority: must-have.
  > Socrates: Rozważony kontr-argument: "przy dużej flocie 24h może być przytłaczające." Rezolucja: zakres 24h pozostaje (skala 1–5 urządzeń per site sprawia, że feed jest krótki), dodano limit 200 wpisów jako guardrail na wypadek skrajnych przypadków.
- [new] System utrwala przekroczenia progu temperatury (zbyt zimno / zbyt gorąco) jako zdarzenia w momencie ich pierwszego wykrycia. Priority: must-have.
  > Socrates: Rozważony kontr-argument: "hookowanie w istniejącym kodzie ryzykuje regresy w krytycznych ścieżkach." Rezolucja: inline hooks z try/catch wystarczą; błąd zapisu nie blokuje głównej operacji. Podejście przyjęte.
- [new] System utrwala ręczne zmiany heat toggle (pinnedOff on/off) jako zdarzenia przy każdej zmianie stanu. Priority: must-have.
  > Socrates: Jak wyżej — inline hook z try/catch. Podejście przyjęte.
- [new] System utrwala zdarzenia przejścia urządzenia offline i powrotu online. Priority: must-have.
  > Socrates: Jak wyżej — inline hook z try/catch. Podejście przyjęte.
- [new] System utrwala każdy wysłany alert e-mail jako zdarzenie. Priority: must-have.
  > Socrates: Jak wyżej — inline hook z try/catch. Podejście przyjęte.
- [new] FM może filtrować feed po pokoju lub urządzeniu. Priority: nice-to-have.
  > Socrates: Rozważony kontr-argument: "filtr po typie zdarzenia jest ważniejszy." Rezolucja: filtr po pokoju/urządzeniu jest bardziej użyteczny dla FM zarządzającego wieloma pokojami ("pokaż tylko salę 3"). Filtr po typie przeniesiony do v2 jako ewentualne rozszerzenie.

### Zachowane zachowania

- [preserved] `toggleHeat` kontynuuje działanie gdy zapis zdarzenia się nie powiedzie — niepowodzenie zapisu jest izolowane i nie propaguje się do operacji wywołującej. Priority: must-have.
  > Socrates: Rozważony kontr-argument: "cicha degradacja maskuje trwałe awarie bazy." Rezolucja: główna operacja (ogrzewanie) jest krytyczna; błąd logu nie powinien jej blokować. Podejście przyjęte. Trwałe awarie dziennika zdarzeń będą widoczne jako pusty feed — FM to zauważy.
- [preserved] Device polling kontynuuje działanie gdy zapis zdarzenia się nie powiedzie — ta sama izolacja co `toggleHeat`. Priority: must-have.
  > Socrates: Jak wyżej. Podejście przyjęte.
- [preserved] Istniejący dashboard wyświetla się bez regresji — dziennik zdarzeń nie jest odpytywany na stronie głównej. Priority: must-have.

## Constraints & Compatibility

- Niepowodzenie zapisu zdarzenia nie propaguje się do operacji wywołującej — operacje `toggleHeat` i device polling kontynuują niezależnie od powodzenia zapisu zdarzenia.
- Dziennik zdarzeń nie jest odpytywany na stronie głównej — brak wpływu na czas ładowania `/`.
- Istniejące tabele (`device_temperature_readings`, `device_state_store`, `alert_states`) pozostają bez zmian — nowy dziennik zdarzeń jest addytywny względem istniejącego schematu.
- Istniejący mechanizm autentykacji (NextAuth: email/password lub OAuth) pozostaje bez zmian.

## Business Logic Changes

Dodana nowa reguła domenowa: każde zdarzenie domenowe (przekroczenie progu, zmiana stanu urządzenia, zmiana łączności, wysłany alert) jest trwale zapisane z timestampem i możliwe do chronologicznego przeglądania.

Dwie reguły precyzujące logikę rejestrowania:

- **Próg temperatury — leading edge only:** zdarzenie jest rejestrowane wyłącznie w momencie pierwszego przekroczenia progu. Kolejne odczyty powyżej progu (bez powrotu do normy) nie generują nowych wpisów. Nowy wpis powstaje dopiero gdy temperatura wróci do normy, a następnie ponownie przekroczy próg.
- **Łączność — każde przejście:** każde przejście urządzenia offline→online lub online→offline generuje osobny wpis bez deduplikacji przy częstych fluktuacjach.

Istniejąca reguła domenowa (przekroczenie progu temperatury → wysłanie alertu e-mail) pozostaje bez zmian — ta zmiana wyłącznie dodaje rejestrowanie zdarzeń, nie modyfikuje logiki wyzwalania.

## Access Control Changes

Brak zmian w modelu dostępu — obecny model zachowany. NextAuth (email/password lub OAuth) bez zmian. Strona `/events` dostępna dla każdego zalogowanego użytkownika, zgodnie z istniejącym płaskim modelem uprawnień (brak ról, brak separacji per site).

## Non-Goals

- Brak notyfikacji push/SMS o zdarzeniach — alerty e-mail istnieją i nie są zmieniane; kanały push/SMS to osobna zmiana.
- Brak mechanizmu retencji/archiwizacji starych wpisów w dzienniku zdarzeń w v1 — czyszczenie danych poza zakresem tej zmiany.
- Brak zmian w logice wyzwalania alertów e-mail — wyłącznie rejestrujemy fakt wysłania, istniejący mechanizm alertów pozostaje nienaruszony.

## Open Questions

1. **Retencja dziennika zdarzeń:** przez ile dni/tygodni przechowywać wpisy przed usunięciem lub archiwizacją? — TBD. Block: yes (wpływa na rozmiar danych i ewentualne indeksowanie przed implementacją).
