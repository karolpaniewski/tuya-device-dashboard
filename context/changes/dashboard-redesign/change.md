---
id: dashboard-redesign
title: Dashboard & Setup Redesign (S-15)
status: implemented
created: 2026-06-12
updated: 2026-06-22
roadmap_id: S-15
plan: context/changes/dashboard-redesign/plan.md
---

Shipped via one consolidated commit (`a425930`) rather than the
granular per-phase commits `plan.md`'s Progress section expects — its
checkboxes were left mostly unfilled even though the work landed.
Confirmed live in the codebase (`cc-kpi-card.tsx`, sparklines in
`device-overview.tsx`) and superseded by later passes
(`dashboard-command-center-redesign`, `dashboard-ux-redesign`,
`dashboard-personalization`). Roadmap S-15 already marks this `done`.

Pełny redesign dashboardu i okna Setup w kierunku klasycznego, nowoczesnego dashboardu.

## Dashboard scope

- KPI summary row: liczba urządzeń online/offline, rozkład pokoi OK/Too Cold/Too Hot, średnia temperatura aktywnych sensorów
- Lewy sidebar z listą pokoi — kliknięcie filtruje widok na wybrany pokój
- Sparkline chart (ostatnie 24h) inline na karcie pokoju — dane z temperature_history; bez otwierania modala

## Setup scope

- Tabbed navigation: Rooms / Devices / Automations / Sites (zamiast jednej długiej strony)
- Tabela urządzeń: sortowanie po nazwie/statusie/pokoju, wyszukiwanie inline, paginacja

## Out of scope

- Nowe źródła danych (wszystko pochodzi z istniejących endpointów)
- Zmiany w backendzie / tRPC routerach
- Nowe typy wykresów poza sparklinem (pełny chart history modal pozostaje bez zmian)
