---
project: "Tuya Device Dashboard — Room Quick-Overview Panel"
version: 10
status: draft
created: 2026-06-29
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: "# TODO: qps — see Open Questions"
  data_volume: "# TODO: data_volume — see Open Questions"
timeline_budget:
  delivery_weeks: 1
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

Tuya Device Dashboard to web app dla facility managerów (1–5 osób per site) do monitorowania urządzeń klimatyzacyjnych rozmieszczonych po pokojach budynku. Zbudowany na Next.js 15 + shadcn/ui + tRPC + libsql/SQLite. Dashboard pokazuje karty pokojów z bieżącą temperaturą i statusem urządzeń. Kliknięcie room card otwiera centered `RoomModal` (shadcn `Dialog`), który pokazuje listę urządzeń pokoju i automation modes targetujące pokój. Ten sam `RoomModal` jest używany w widoku automation-flow canvas (klik room-node). Temperatura historyczna jest dostępna przez `api.device.temperatureHistory` i renderowana w osobnym komponencie `room-temperature-panel.tsx` z użyciem Recharts `LineChart`.

## Problem Statement & Motivation

Facility manager przegląda dashboard z dziesiątkami kart pokojów. Kliknięcie room card otwiera centered dialog blokujący cały widok floty — nie może równolegle śledzić innych pokojów. Zamknięcie i ponowne otwarcie kolejnego pokoju to zbędne interakcje, które spowalniają rutynowy przegląd stanu budynku.

Slide-in panel z prawej strony pozwoli przeglądać stan pokoju bez utraty kontekstu dashboardu, a historia temperatury w panelu da pełny wgląd bez konieczności wchodzenia do osobnego widoku urządzenia.

## User & Persona

**Facility manager** — zarządza 5–50 pokojami w jednym budynku. Sprawdza dashboard kilka razy dziennie żeby zweryfikować stan grzewczy. Potrzebuje szybkiego wglądu w konkretny pokój bez odrywania się od widoku floty. Frustruje go konieczność zamykania i otwierania kolejnych dialogów żeby porównać pokoje.

## Success Criteria

### Primary
- Kliknięcie room card na dashboardzie otwiera slide-in panel z prawej strony; dashboard pozostaje widoczny i przewijalny w tle; panel zawiera: temperaturę aktualną z trendem, 24h chart historii temperatury, urządzenia z inline statusem, aktywne tryby i kontrolę heat.

### Secondary
- Panel wyświetla dane natychmiast gdy są już dostępne z dashboardu — bez dodatkowego stanu ładowania widocznego użytkownikowi przy powtórnym otwarciu tego samego pokoju.

### Guardrails
- Room interaction w automation-flow canvas działa bez zmian — klik room-node nadal otwiera centered dialog.
- Kontrola heat w panelu zachowuje się identycznie jak we wszystkich innych miejscach gdzie jest dostępna.
- Panel otwiera się bez perceptible delay (< 100 ms od kliknięcia).
- Sekcja historii temperatury ładuje się asynchronicznie — reszta panelu nigdy nie czeka na ten chart.

## User Stories

### US-01: Room Quick-Overview Panel

- **Given** zalogowany facility manager na dashboardzie z listą pokojów
- **When** kliknie dowolną room card
- **Then** slide-in panel otwiera się z prawej strony; dashboard pozostaje widoczny i nie jest blokowany przez overlay pełnoekranowy

#### Acceptance Criteria
- Panel zawiera: temperaturę aktualną + 24h trend chip; 24h historyczny chart temperatury (ukryty gdy pokój nie ma sensora temperatury); listę urządzeń z inline statusem (online/offline, setpoint, valve state); listę automation modes targetujących pokój; kontrolę heat
- Kliknięcie X, Esc lub obszaru poza panelem zamyka panel
- Room interaction w automation-flow canvas nie zmienia zachowania

## Scope of Change

- [modified] Room card click na dashboardzie — wcześniej otwierał centered dialog blokujący widok; teraz otwiera slide-in panel z prawej strony, dashboard pozostaje widoczny w tle.
  > Socrates: Kontr-argument rozważony: "click handler może kolidować z istniejącą nawigacją." Rozwiązanie: kept — room card nie ma nawigacji per se, otwierała RoomModal; zmiana zastępuje ten modal Sheetem.
- [new] Temperatura aktualna i 24h trend chip w nagłówku panelu.
- [new] 24h historyczny chart temperatury w panelu — wyświetlany dla pokojów z sensorem temperatury; ukryty dla pokojów bez sensora.
  > Socrates: Kontr-argument rozważony: "pokój bez sensora nie ma danych — chart będzie pusty." Rozwiązanie: sekcja historii temperatury jest ukryta gdy pokój nie ma żadnego sensora (empty state, nie placeholder).
- [new] Kontrola heat bezpośrednio w panelu (wcześniej dostępna tylko w głównym widoku device overview).
  > Socrates: Kontr-argument rozważony: "skąd panel zna aktualny heat state?" Rozwiązanie: device.overview query jest już załadowany przez dashboard — panel czyta heat state stamtąd; nie wymaga nowego endpointu.
- [new] Zamknięcie panelu przez przycisk X, klawisz Esc lub kliknięcie obszaru poza panelem.
- [preserved] Lista urządzeń z inline statusem (online/offline, setpoint, valve state) — ta sama treść co w istniejącym room dialog.
- [preserved] Lista automation modes targetujących pokój — ta sama treść co w istniejącym room dialog.
- [preserved] Room interaction w automation-flow canvas — klik room-node nadal otwiera centered dialog; widok canvas nie jest modyfikowany.
  > Socrates: Kontr-argument rozważony: "spójność UX wymaga tego samego panelu w canvas." Rozwiązanie: kept jako preserved — canvas ma swoją logikę (modalRoomId state, ograniczona przestrzeń); zmiana poza scopem tego featurea.

## Constraints & Compatibility

- **Automation-flow canvas**: room interaction w canvas pozostaje w pełni niezmieniony — klik room-node nadal otwiera centered dialog. Widok canvas nie jest modyfikowany.
- **Kontrola heat**: zachowanie kontroli heat jest identyczne we wszystkich miejscach gdzie jest dostępna — ta sama logika domenowa, ten sam feedback dla użytkownika.
- **Dane pokojów i urządzeń**: dane załadowane dla dashboardu są bezpośrednio dostępne w panelu bez dodatkowych żądań sieciowych — panel nie duplikuje istniejącego data fetchingu dla urządzeń i trybów.
- **Historia temperatury**: funkcjonalność historii temperatury jest już dostępna — panel korzysta z niej bez żadnych zmian po stronie serwera.
- **Backward compatibility**: żadne istniejące URL-e, kontrakty danych ani schemat bazy danych nie ulegają zmianie. Zmiana nie wymaga modyfikacji logiki serwera ani migracji danych.

## Business Logic Changes

No domain logic change. This is an infrastructure/UX change — panel prezentuje te same dane (urządzenia, tryby, temperatura) przez inny affordance (slide-in panel zamiast centered dialog), i eksponuje istniejącą operację heat control w nowym punkcie dostępu.

## Access Control Changes

No access control changes — current model preserved. Panel jest widoczny dla tych samych zalogowanych użytkowników co obecny dashboard. Żadnych nowych ról ani poziomów dostępu.

## Non-Goals

- Nie edytuje urządzeń — panel jest read-only poza kontrolą heat; setpoint, schedules i device settings pozostają w widoku szczegółów urządzenia.
- Nie zastępuje room interaction w automation-flow canvas — canvas zachowuje centered dialog bez zmian.
- Nie persystuje stanu panelu — zamknięcie i ponowne otwarcie nie pamięta pozycji scroll ani ostatnio wybranego pokoju.
- Nie targetuje mobile — dashboard nie jest mobile-first surface; panel może być użyteczny na mobile, ale nie jest testowaną powierzchnią dla tego featurea.

## Open Questions

1. **target_scale.qps** — nie oszacowane podczas shapowania. Dla 1–5 użytkowników wartość `low` jest bezpiecznym założeniem; weryfikacja opcjonalna. Owner: user. Block: no.
2. **target_scale.data_volume** — nie oszacowane podczas shapowania. Dla małej instalacji wartość `small` jest bezpiecznym założeniem; weryfikacja opcjonalna. Owner: user. Block: no.
