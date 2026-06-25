# Artefakt 1 — Terytorium (historia gita)

> Metoda: `git log --since="12 months ago"`, ale repo ma w praktyce **15 dni historii** (pierwszy commit 2026-06-08, ostatni 2026-06-23, 164 commity) — więc "12 miesięcy" pokrywa całą historię projektu. To nie jest mapa "starego legacy", to mapa bardzo młodego, intensywnie rozwijanego projektu. Podział na kwartały zamieniony na podział tygodniowy (patrz sekcja "Nacisk pracy w czasie") — kwartały nie miałyby tu sensu.
>
> Szum odfiltrowany z rankingów: `package-lock.json`, `drizzle/meta/*.json`, pliki migracji `drizzle/*.sql`, `context/changes/**`, `context/foundation/**`, configi (`biome.jsonc`, `tsconfig.json`, `next.config.*`, `postcss.config.*`, `.gitignore`, `.env*`).

## Top 10 najczęściej modyfikowanych plików

| # | Plik | Commity |
|---|------|---------|
| 1 | `src/app/_components/device-overview.tsx` | 25 |
| 2 | `src/server/api/routers/device.ts` | 17 |
| 3 | `src/app/_components/device-card.tsx` | 15 |
| 4 | `src/server/db/schema.ts` | 14 |
| 5 | `package.json` | 13 |
| 6 | `src/server/api/routers/device.test.ts` | 12 |
| 6 | `src/app/_components/room-group.tsx` | 12 |
| 8 | `src/server/api/root.ts` | 11 |
| 9 | `src/server/lib/tuya/real-client.ts` | 10 |
| 9 | `src/app/layout.tsx` | 10 |
| 9 | `src/app/_components/setup/room-manager.tsx` | 10 |

`device-overview.tsx` to wyraźny hotspot — prawie 2x więcej commitów niż drugi w rankingu. To główny dashboard (KPI rządki, widgety, drag-and-drop), który rósł przez prawie każdą iterację UI (S-15, S-16, S-17, S-19, S-21, plus w tej sesji dodanie/usunięcie widgetu automatyzacji).

## Top 10 najczęściej modyfikowanych folderów/modułów

Pierwsza seria (poziom `src/app`, `src/server`) dała zbyt ogólne wyniki (`src/app/_components` samo w sobie = 147 trafień, `src/server/api` = 81). Zejście jeden poziom niżej:

| # | Obszar | Commity | Co tam żyje |
|---|--------|---------|-------------|
| 1 | `src/app/_components` (pliki bezpośrednio w tym folderze, bez `setup/`) | 94 | Dashboard: `device-overview.tsx`, `device-card.tsx`, `room-group.tsx`, `filter-bar.tsx`, widgety `cc-*` |
| 2 | `src/server/api/routers` | 60 | tRPC routery: `device`, `room`, `automation`→`mode`, `site`, `settings`, `dashboard-layout` |
| 3 | `src/app/_components/setup` | 53 | Panel administracyjny: rooms/devices/sites/modes CRUD |
| 4 | `src/server/lib/tuya` | 30 | Klient Tuya LAN: `real-client.ts`, `stub-client.ts`, `dp-codes.ts`, `types.ts` |
| 5 | `src/server/workers` | 28 | Background workery: `tuya-poller.ts`, `automation-scheduler.ts` |
| 6 | `src/server/db` | 23 | `schema.ts`, `seed.ts` — jeden centralny schemat domeny |
| 7 | `src/components/ui` | 17 | Współdzielone prymitywy UI (dialog, select, button...) |
| 8 | `src/server/lib` (bez `tuya/`) | 27 | `device-state-store.ts`, `scoring.ts`, `valve-control.ts`, `mode-control.ts`, `crypto.ts`, `logger.ts` |

**Obserwacja:** `src/app/_components` (płaski poziom, bez `setup/`) jest de facto największym hotspotem w repo — większym niż cały `server/api/routers`. To nie jest typowy podział "dashboard ma niski priorytet, backend rośnie" — tu UI dashboardu jest najbardziej aktywnym, najmniej stabilnym obszarem.

## Nacisk pracy w czasie (tygodnie, nie kwartały)

| Tydzień (start) | _components (top) | _components/setup | components/ui | api/routers | server/db | server/lib | lib/tuya | workers |
|---|---|---|---|---|---|---|---|---|
| 2026-06-08 | 35 | 22 | 11 | 29 | 13 | 10 | 21 | 11 |
| 2026-06-15 | 48 | 14 | 4 | 24 | 7 | 12 | 8 | 11 |
| 2026-06-22 (częściowy, 2 dni) | 11 | 17 | 2 | 14 | 3 | 5 | 1 | 6 |

Czytelny przesuw: **tydzień 1** — fundament (integracja Tuya, `components/ui`, schema). **Tydzień 2** — eksplozja pracy w dashboardzie (`_components` top-level prawie podwaja aktywność). **Tydzień 3 (w trakcie)** — środek ciężkości przesuwa się do `setup/` (panel admina) względem top-level dashboardu — zgodne z tym, że ostatnia duża zmiana (automation-rework → modes) żyje głównie w `setup/`.

## Współzmiany — co zmienia się razem

Analiza par/trójek katalogów współwystępujących w tych samych commitach (po filtracji szumu):

| Para/Trójka | Commity razem | Interpretacja |
|---|---|---|
| `server/api/routers` ↔ `server/lib` | 14 | Każdy nowy endpoint zwykle ciągnie zmianę w warstwie logiki (np. `valve-control.ts`, `mode-control.ts`) |
| `_components` (top) ↔ `server/api/routers` | 13 | UI dashboardu i API są zmieniane razem częściej niż UI i `setup/` — dashboard jest bliżej "krawędzi" API niż panel admina |
| `_components` (top) ↔ `_components/setup` | 12 | Mimo wszystko obie części UI bywają zmieniane wspólnie (współdzielone komponenty, np. `SettingsCard`, `Badge`) |
| `server/api/routers` ↔ `server/db` | 9 | Nowy router = zwykle nowa tabela/kolumna w `schema.ts` |
| `server/api/routers` ↔ `server/workers` | 8 | Workery (scheduler, poller) i routery są sprzężone przez współdzielone funkcje (np. `applyModeToRooms`) |
| `server/api/routers` ↔ `lib/tuya` | 8 | Routery wołają klienta Tuya wprost (brak dodatkowej warstwy izolacji) |

**Top 3 sprzężenia — wnioski:**
1. **`api/routers` ↔ `lib`** — najsilniejsze sprzężenie w repo. Nowa funkcjonalność praktycznie nigdy nie jest tylko routerem; zawsze ciągnie helper w `server/lib`. Dla nowego developera: jeśli zmieniasz router, sprawdź `server/lib` po analogiczną logikę, zanim dodasz nową.
2. **`_components` ↔ `api/routers`** — dashboard jest "chatty" z API na poziomie kodu (osobne query/mutation hooki per widget), nie ma warstwy pośredniej typu "view model". Zmiana kontraktu routera = praktycznie zawsze zmiana w komponencie dashboardu.
3. **`api/routers` ↔ `server/db`** — potwierdza, że `schema.ts` jest punktem, przez który przechodzi każda nowa domena (patrz sekcja "wspólny mianownik" poniżej).

### Czy jest "wspólny mianownik" — plik zmieniający się z wieloma różnymi obszarami?

Tak, kilka kandydatów (mierzone liczbą *różnych* obszarów-partnerów w commitach, nie tylko liczbą zmian):

| Plik | Liczba różnych obszarów-partnerów | Zmiany | Dlaczego |
|---|---|---|---|
| `src/server/db/schema.ts` | 13 | 14 | **Najważniejszy "wspólny mianownik" w repo.** Jedna płaska definicja całej domeny (sites, rooms, devices, automation→modes, users...) — każda nowa funkcja dotyka tego pliku. Naturalny hotspot konfliktów merge. |
| `src/server/api/root.ts` | 13 | 11 | Każdy nowy router musi się tu zarejestrować — drugi "spine" plik. |
| `package.json` | 15 | 13 | Oczekiwane (zależności rosną z każdą funkcją) — nieinteresujące same w sobie, ale potwierdza brak monorepo/workspace podziału. |
| `src/app/layout.tsx` / `src/app/page.tsx` | 14 / 15 | 10 / 8 | Root layout i strona główna — typowe dla Next.js App Router, każda zmiana globalnego providera/stylu przechodzi tędy. |
| `src/styles/globals.css` | 12 | 6 | Współdzielone tokeny CSS (`--cc-*`, `--s-*`) — zmienia się razem z każdym większym redesignem UI. |

To nie jest plik tłumaczeń czy generowany plik (jak sugerował prompt) — w tym repo odpowiednik to **`schema.ts` + `root.ts`**: dwa miejsca, przez które fizycznie musi przejść każda nowa funkcja domenowa (nowa tabela → `schema.ts`; nowy router → `root.ts`). To jest "wspólny mianownik" tego stacku (Drizzle + tRPC), nie artefakt przypadku.

### Czy silnie sprzężone pliki nadal istnieją w repo?

Sprawdzono bezpośrednio na dysku. **Nie wszystkie** — kilka plików z wysoką częstotliwością współzmian zostało usuniętych w trakcie tej samej sesji, w której pisany jest ten artefakt (rework automatyzacji, faza 6 — decommission):

| Plik | Status | Kontekst |
|---|---|---|
| `src/server/api/routers/automation.ts` | ❌ USUNIĘTY | Stary router automatyzacji — zastąpiony przez `mode.ts` |
| `src/server/api/routers/automation.test.ts` | ❌ USUNIĘTY | Testy starego routera |
| `src/server/workers/automation-scheduler.test.ts` | ❌ USUNIĘTY | Testy starego ticka (`runAutomationTick`) — nowy tick (`runModeTick`) ma własny plik testowy |
| `src/app/_components/setup/automation-manager.tsx` | ❌ USUNIĘTY | Zastąpiony przez `mode-manager.tsx` |
| `src/app/_components/setup/automation-form.tsx` | ❌ USUNIĘTY | Zastąpiony przez `mode-form.tsx` |
| `src/app/_components/cc-automations-widget.tsx` | ❌ USUNIĘTY | Zastąpiony przez `cc-modes-widget.tsx` |
| `src/server/api/routers/post.ts` / `src/app/_components/post.tsx` | ❌ USUNIĘTE | Pozostałości startera T3 (`posts`), usunięte przy wdrażaniu właściwego schematu domeny (F-02) |
| `src/server/workers/automation-scheduler.ts` | ✅ ISTNIEJE (zmieniony) | Plik przetrwał, ale stracił `runAutomationTick`/`getRoomAvgTemperature`/`logExecution` — zostało tylko `runModeTick` |
| Pozostałe top 10 plików (device-overview, device.ts, schema.ts, root.ts, itd.) | ✅ ISTNIEJĄ | — |

**Wniosek dla mapy strukturalnej (Artefakt 2):** analiza zależności (`dependency-cruiser`) powinna skupić się na **aktualnie żywych** najaktywniejszych obszarach: `src/app/_components` (top-level), `src/app/_components/setup`, `src/server/api/routers`, `src/server/lib` (+`tuya/`), `src/server/workers`, `src/server/db`. Nie ma sensu analizować grafu importów dla usuniętych plików automatyzacji — to już zamknięty rozdział historii, nie żywa struktura.

## Surowe dane (do wglądu)

<details>
<summary>Top 40 plików, niefiltrowane vs filtrowane — pełna lista</summary>

Komenda bazowa:
```bash
git log --since="12 months ago" --name-only --pretty=format: -- . | grep -v '^$' | sort | uniq -c | sort -rn
```

Filtr szumu zastosowany do wszystkich rankingów w tym dokumencie:
```
package-lock\.json|drizzle/meta/|drizzle/[0-9]+_.*\.sql|^context/changes/|^context/foundation/|^\.env|biome\.jsonc|tsconfig\.json|next\.config|postcss\.config|\.gitignore
```

</details>
