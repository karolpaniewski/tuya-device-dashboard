---
project: "Tuya Device Dashboard — S-17 Visual & UX Redesign"
version: 2
status: draft
created: 2026-06-15
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

# Tuya Device Dashboard — S-17 Visual & UX Redesign

## Current System Overview

Tuya Device Dashboard to działający LAN-only web dashboard zarządzania urządzeniami Tuya dla małego zespołu facility managerów (2–5 osób).

**Architektura:** Next.js 15 monolith z custom server entrypoint (persistent polling worker), tRPC v11, Drizzle ORM + libsql (SQLite), Tailwind CSS, shadcn/ui.

**Aktualna funkcjonalność:**
- Live device overview: urządzenia grupowane per pokój, temperatura, online/offline (odświeżanie co 30 sekund)
- Valve setpoint control
- Room health scoring (OK / Too Cold / Too Hot) z progami per pokój
- Temperature history z wykresami, purge po 30 dniach
- Multi-site support
- Auth: email + password, all routes gated

**Aktualny stan UI:** Wyłącznie ciemny motyw. Brak spójnego systemu designu — paleta, typografia i spacing nie tworzą spójnego języka wizualnego. Kafelki urządzeń nie rozróżniają wizualnie sensor / valve / plug. Strona główna po zalogowaniu nie eksponuje kluczowych KPI ani wykresów na pierwszym widoku — użytkownik musi nawigować żeby zobaczyć informacje które powinny być natychmiastowo dostępne.

## Problem Statement & Motivation

Facility managerowie otwierają dashboard codziennie rano żeby ocenić stan biura. Obecny interfejs nie realizuje tego scenariusza skutecznie: strona główna nie daje żadnej informacji syntetycznej na pierwszy rzut oka — brak zestawienia KPI, brak wykresów temperatur widocznych bez klikania, brak wizualnego rozróżnienia typów urządzeń na kafelkach. Ogólny wygląd aplikacji jest niespójny i nie buduje zaufania jako profesjonalne narzędzie pracy.

Zmiana jest potrzebna teraz ponieważ podstawowa logika produktu (polling, sterowanie, scoring, historia) jest stabilna — warstwa wizualna stała się główną barierą użyteczności i pierwszym wrażeniem decydującym o zaufaniu użytkowników do narzędzia.

Obecny workaround: użytkownicy muszą klikać w menu i przełączać widoki żeby zebrać informacje które powinny być widoczne od razu po zalogowaniu.

## User & Persona

**Rola:** Facility manager / administrator biura (2–5 osób w organizacji).

**Moment bólu:** Otwarcie dashboardu rano — chce natychmiast zobaczyć stan pomieszczeń, alerty termiczne, trendy temperatur. Zamiast tego widzi listę kafelków bez kontekstu i hierarchii.

**Urządzenie:** Desktop browser (primary), mobile (secondary — obsługa 375px viewport zaimplementowana w S-08).

**Zmiana dla istniejących użytkowników:** Ten sam system, lepszy interfejs — żadne istniejące przepływy pracy nie są usuwane ani przenoszone. Użytkownicy którzy przyzwyczaili się do ciemnego motywu mogą go zachować; ci którzy wolą jasny — zyskują wybór.

## Success Criteria

### Primary
Po zalogowaniu użytkownik widzi w ciągu 2 sekund bez żadnego dodatkowego klikania:
1. KPI row: urządzenia online/offline, liczba pokoi, aktywne alerty termiczne
2. Wykresy temperatur per pokój (prominentne, natychmiast widoczne — nie tylko sparklines)
3. Wykres kołowy: rozkład urządzeń per pokój
4. Każdy kafelek urządzenia z ikoną rozróżniającą sensor / valve / plug
5. Przełącznik dark/light mode dostępny w nawigacji — preferencja persystuje między sesjami

### Secondary
- Ogólna spójność wizualna: paleta, typografia, spacing tworzą feel profesjonalnego narzędzia monitoringowego (referencja: Grafana / Datadog — data-dense, każdy piksel niesie informację)
- Mobile: redesign nie psuje istniejącego 375px viewport support

### Guardrails
- Zero zmian w logice backendowej — polling, scoring, history, multi-site działają identycznie jak przed zmianą
- Wszystkie istniejące funkcje pozostają dostępne — żadna istniejąca capability nie jest chowana ani usuwana za redesignem

## User Stories

### US-01: Poranny przegląd stanu biura

- **Given** jestem zalogowany jako facility manager,
- **When** otwieram dashboard,
- **Then** widzę w ciągu 2 sekund: KPI row (online/offline, pokoje, alerty), wykresy temperatur per pokój, wykres kołowy urządzeń, każde urządzenie z ikoną swojego typu — bez żadnego dodatkowego klikania.

## Scope of Change

### Dashboard

- [modified] KPI row — istnieje od S-15; wizualnie przeprojektowany: nowa hierarchia, paleta, spacing zgodne z Grafana/Datadog aesthetic
- [modified] Wykresy temperatur per pokój — istniejące sparklines zastąpione prominentnymi wykresami widocznymi na głównym widoku bez klikania

### Nowe elementy

- [new] Wykres kołowy rozkładu urządzeń per pokój na widoku głównym
- [new] Unikalna ikona per typ urządzenia (sensor / valve / plug) na każdym kafelku urządzenia, dobrana z gotowej biblioteki ikon
- [new] Przełącznik dark / light mode w nawigacji — preferencja persystuje między sesjami bez utraty przy odświeżeniu strony
- [new] Pełna obsługa jasnego motywu we wszystkich komponentach i stronach aplikacji

### Zachowane bez zmian

- [preserved] Polling worker i cykl odświeżania danych urządzeń
- [preserved] Valve setpoint control
- [preserved] Room health scoring (OK / Too Cold / Too Hot)
- [preserved] Temperature history i retencja danych
- [preserved] Multi-site support
- [preserved] Auth gate i model dostępu
- [preserved] Istniejące API — zero zmian w warstwie backendowej

## Constraints & Compatibility

- Istniejący mechanizm odświeżania danych urządzeń (co 30 sekund) nie jest dotykany — żaden nowy komponent UI nie może blokować ani spowalniać tego cyklu
- Warstwa API pozostaje bez zmian — zero modyfikacji backendowych
- Obsługa 375px viewport (S-08) nie może regresować — każdy zmodyfikowany komponent musi być weryfikowany na mobile
- Schemat bazy danych nie jest migrowany — zero zmian tabel i kolumn
- Istniejące przepływy pracy użytkowników (sterowanie zaworami, konfiguracja progów, setup pokoi i urządzeń) pozostają dostępne i niezmienione

## Business Logic Changes

Brak zmian w logice domenowej. Ta zmiana jest wyłącznie visual/infrastructure — przeprojektowanie warstwy prezentacji bez modyfikacji żadnych reguł domenowych. Istniejące reguły (ocena zdrowia pokoju, sterowanie zaworami, retencja odczytów temperatury) pozostają nienaruszone i niemodyfikowane.

## Access Control Changes

Brak zmian w modelu dostępu — obecny model zachowany: jeden typ użytkownika, pełny dostęp po zalogowaniu email + password.

Preferencja jasnego/ciemnego motywu przechowywana jest po stronie przeglądarki użytkownika — nie wymaga zmian w schemacie bazy danych, modelu ról ani sesji.

## Non-Goals

- **Ikony i ilustracje tworzone od zera** — wyłącznie gotowe ikony z istniejących bibliotek; zero tworzenia custom grafiki przez designera.
- **Widget historii automatyzacji** — wykluczone z tego slica; dojdzie razem z S-12 gdy będzie co pokazywać. Placeholder layoutowy jest akceptowalny jeśli slot jest potrzebny do struktury strony.

## Non-Functional Requirements

- Dashboard renderuje się i pokazuje dane w ciągu 2 sekund od zalogowania — KPI i wykresy widoczne bez dodatkowego fetcha
- Kontrast tekstu spełnia WCAG AA (4.5:1 dla tekstu normalnego) w obu motywach — jasny motyw nie może być wash-out
- Wybrany motyw (ciemny/jasny) jest aktywny od pierwszego renderowania strony — użytkownik nie widzi przeskoku do domyślnego motywu przy ładowaniu

## Open Questions

Brak otwartych pytań — quality cross-check z fazy shapowania zakończony ze statusem `accepted`. Wszystkie decyzje projektowe zostały rozstrzygnięte podczas sesji `/10x-shape`.
