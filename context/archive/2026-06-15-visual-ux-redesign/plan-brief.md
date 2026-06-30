# S-17 Visual & UX Redesign — Plan Brief

> Full plan: `context/changes/visual-ux-redesign/plan.md`
> PRD: `context/foundation/prd-v2.md`

## What & Why

Przeprojektowanie warstwy wizualnej Tuya Device Dashboard — aplikacja wygląda tanio, używa wyłącznie ciemnego motywu, kafelki nie rozróżniają typów urządzeń, a strona główna nie daje żadnej informacji syntetycznej na pierwszy rzut oka. Cel: Grafana/Datadog aesthetic (data-dense, każdy piksel niesie informację), pełny dark/light mode, ikony na kafelkach, prominentne wykresy temperatur i wykres kołowy w KPI row.

## Starting Point

Dashboard ma już KPI row (4 karty), sidebar z pokojami i 56px sparklines (S-15), glassmorphism design system (S-14) i drag-and-drop modale (S-16). `next-themes@0.4.6` jest zainstalowany ale nieużywany; `<html>` ma hardcoded `className="dark"`; ikony lucide-react i recharts są dostępne.

## Desired End State

Użytkownik otwiera dashboard i widzi w < 2s: KPI row (5 kart, w tym donut chart), panel z pełnymi wykresami temperatur per pokój (200px, z osiami), karty pokoi z kafelkami posiadającymi ikony typu. Przełącznik dark/light w headerze persystuje między sesjami bez flash przy odświeżeniu.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Architektura light mode | `dark:` Tailwind variant pairs | Jawne, weryfikowalne per-komponent; brak nowych utilities | Plan |
| FOUC prevention | Inline script w `<head>` | Standard next-themes pattern, < 200 bytes, zero flash | Plan |
| Pozycja toggle | PageShell header | Wspólny dla wszystkich stron; slot `rightContent` już istnieje | Plan |
| Wykresy temperatur | Osobny overview panel (200px, pełne osie) nad kartami pokoi | User wyraził potrzebę "prominentne", nie tylko sparklines | Shape |
| Pie chart | 5. karta w KPI row (donut 80px) | Wszystkie metryki w jednym miejscu u góry | Shape |
| Ikony urządzeń | Thermometer / Gauge / Plug z lucide-react | Semantycznie trafne; gotowe w zainstalowanej bibliotece | Shape |
| Glassmorphism w light mode | Solid cards (bg-white, border-gray-200, shadow-sm) | Glass na białym tle jest niewidoczny / brudny | Shape |
| Light mode palette | gray-50 bg + blue-600 accents | Grafana light theme feel; czytelność > unikalność | Shape |

## Scope

**In scope:**
- `next-themes` ThemeProvider + inline FOUC script
- Nowy `ThemeToggle` komponent w PageShell headerze
- CSS vars dla page-bg i blob colors w globals.css
- Audit i naprawa wszystkich hardcoded `white/X` klas w ~10 komponentach
- Ikony `Thermometer` / `Gauge` / `Plug` w `DeviceCard` i `DeviceTable`
- `RoomTemperaturePanel` — grid 200px wykresów w device-overview.tsx
- Donut chart (5. KPI karta) w device-overview.tsx

**Out of scope:**
- Żadne zmiany backendowe (tRPC / Drizzle / schema)
- Custom SVG icons / angażowanie designera
- Widget historii automatyzacji (czeka na S-11 + S-12)
- Nowe npm dependencies

## Architecture / Approach

next-themes zarządza klasą `.dark`/`.light` na `<html>`. CSS zmienne w globals.css definiują tokeny dla obu motywów (shadcn tokeny już istnieją; dodajemy `--page-bg` i `--blob-1/2`). Komponenty używają Tailwind `dark:` variant pairs. Recharts `stroke` i `fill` używają `var(--color-chart-N)` zamiast hardcoded hex. Nowe komponenty (ThemeToggle, RoomTemperaturePanel) są izolowane — nie dotykają istniejącej logiki.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Theme Infrastructure | ThemeProvider, FOUC script, toggle w headerze, CSS vars | next-themes SSR compatibility z App Router |
| 2. Light Mode Audit | Wszystkie komponenty poprawnie renderowane w obu motywach | Dużo plików — ryzyko pominięcia hardcoded koloru |
| 3. Device Type Icons | Ikony Thermometer/Gauge/Plug na każdym kafelku | Żadne; izolowana zmiana |
| 4. Temperature Panel | Overview panel z 200px wykresami per pokój | N par. queries per room — sprawdzić czy staleTime jest wystarczający |
| 5. Pie Chart KPI | Donut chart jako 5. karta w KPI row | KPI grid responsive breakpoints po zmianie z 4→5 kart |

**Prerequisites:** Brak — wszystkie biblioteki zainstalowane, żadnych migracji.
**Estimated effort:** ~2 tygodnie po godzinach (2–3 sesje na każdą fazę)

## Open Risks & Assumptions

- next-themes wymaga `suppressHydrationWarning` na `<html>` i `<body>` — bez tego React hydration warning w konsoli
- Faza 2 (audit) jest największa czasowo — wiele plików; ryzyko pominięcia jednej hardcoded klasy. Zalecane: test w light mode po każdym pliku, nie na końcu fazy.
- RoomTemperaturePanel odpytuje `temperatureHistory` per pokój — istniejący staleTime 60s powinien zapobiec zbędnym refetchom

## Success Criteria (Summary)

- Dashboard w < 2s: KPI row (5 kart), panel wykresów, kafelki z ikonami — bez klikania
- Przełącznik dark/light persystuje bez FOUC
- Oba motywy: legibility + WCAG AA kontrast, brak regresji w dark mode
