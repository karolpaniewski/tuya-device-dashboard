# Artefakt 2 — Struktura (dependency-cruiser)

> Konfiguracja: `.dependency-cruiser.cjs` w korzeniu repo (`doNotFollow: node_modules`, `tsConfig: tsconfig.json`, reguły `no-circular`/`no-orphans`). Analiza ograniczona do `src/` — **163 moduły, 444 zależności**. Wymagało doinstalowania `dependency-cruiser` (devDependency) i `graphviz` (`brew install graphviz`) do renderowania SVG.

## Rozpoznanie możliwości — 3 sposoby użycia dependency-cruiser w tym repo

1. **Cykle (`no-circular`)** — szybki sygnał "te dwa pliki nie potrafią się od siebie odseparować". W młodym, szybko rosnącym repo jak to, cykle pokazują się tam, gdzie typy i komponenty nie zostały jeszcze rozdzielone (patrz `mode-form.tsx` ↔ `mode-manager.tsx` poniżej).
2. **Metryki Ca/Ce/Instability (`--metrics`)** — najlepszy sposób żeby bez czytania kodu znaleźć: (a) moduły-fundamenty (wysokie Ca, niskie I — zmiana boli wszystkich), (b) moduły-chokepointy (wysokie Ca *i* Ce — zmiana boli wszystkich *i* sama jest pod presją wielu zależności), (c) moduły niemożliwe do odizolowania w testach (wysokie Ce, wysoka instability).
3. **Granice warstw (`forbidden` reguły z `from`/`to`)** — w stacku Next.js App Router + tRPC najważniejsze pytanie nie jest "czy mamy cykle", a "czy coś z `src/app` (kod, który może wylądować w bundlu klienta) importuje wprost z `src/server` (kod z dostępem do DB, kluczy szyfrowania, Tuya local-key)". To real-world ryzyko bezpieczeństwa, nie tylko czystość architektury.

## Cykle w aktywnych obszarach

Uruchomiono `no-circular` ograniczone do `src/` (po odfiltrowaniu `node_modules` — pierwsza, nieprzefiltrowana próba dała 65 "cykli", z czego prawie wszystkie żyły w `node_modules/next`, `d3-interpolate`, `@base-ui/react` — szum biblioteczny, nieistotny dla tego repo).

**3-5 najważniejszych obserwacji:**
1. Po odfiltrowaniu `node_modules` zostaje **tylko jeden realny cykl** w całym `src/` — to dobry znak dla młodego repo, ale wart natychmiastowej naprawy, bo dotyka najaktywniejszego obszaru z Artefaktu 1 (`_components/setup`).
2. Cykl jest **type-only z jednej strony** (`import type` w `mode-form.tsx`) — nie spowoduje runtime cyklu w bundlu, ale to sygnał, że typy `ModeRoomOption`/`ModeSummary` mieszkają w złym pliku.
3. Brak orphanów w `src/server/**` — cała warstwa serwerowa jest "podłączona", nic nie wisi w powietrzu.
4. Są 2 orphany w sumie, oba poza serwerową logiką domenową — jeden to plik testowy (oczekiwany, ładowany przez Vitest config, nie przez import), drugi to **realny martwy kod**.
5. `no-orphans` jako reguła `info`, nie `warn`/`error` — w tym repo orphan != błąd, bo część plików (entry pointy, testy) jest celowo "nieimportowana" wprost.

| Obszar | Co znalazłem | Dowód z dependency-cruiser | Dlaczego to ważne przy zmianie | Związek z artifact-1-territory.md | Co sprawdzić dalej |
|---|---|---|---|---|---|
| `src/app/_components/setup` | Cykl `mode-form.tsx` ↔ `mode-manager.tsx` przez typy `ModeRoomOption`/`ModeSummary` | `mode-form.tsx → mode-manager.tsx → mode-form.tsx` (warn no-circular) | Każda zmiana publicznego API jednego pliku ryzykuje złamanie drugiego przez reeksport typów; nowy dev nie zgadnie, gdzie "naprawdę" mieszkają te typy | `setup/` to obszar #3 w rankingu aktywności (53 commity) i część tygodnia 3 (automation-rework → modes) | Wydzielić `ModeRoomOption`/`ModeSummary` do osobnego `mode-types.ts` albo zostawić je w `mode-form.tsx` (plik, który faktycznie definiuje formę danych) |
| `src/lib` | Orphan: `device-type-colors.ts` — zero importów w `src/` | `info no-orphans: src/lib/device-type-colors.ts` (potwierdzone `grep`em — zero trafień) | Martwy kod z czasów przed refaktorem na CSS-variable badge'e (`device-table.tsx` ma teraz `TYPE_ACCENT`/`TYPE_ACCENT_BG` z `var(--cc-*)`, nie te stałe) | Nie pojawia się w żadnym rankingu z artifact-1 — bo nikt go nie dotyka, stąd "martwy", nie "aktywny" | Usunąć plik albo dopisać go do nowego systemu kolorów, jeśli miał wrócić |
| `src/test` | Orphan: `setup.ts` | `info no-orphans: src/test/setup.ts` | Fałszywy alarm — plik jest ładowany przez `vitest.config.ts` (`setupFiles`), nie przez `import` | — | Nic, to oczekiwane |

## Granice warstw

Sprawdzono granicę realną dla tego stacku (nie `platform/types`/`platform/client` z przykładu — w tym repo odpowiednikiem jest **`src/app` (może trafić do bundla klienta) → `src/server` (DB, klucze, Tuya)**), plus `src/components/ui` jako warstwa fundamentowa.

**3-5 najważniejszych obserwacji:**
1. **5 z 6 "naruszeń" to fałszywe alarmy** wynikające z tego, jak Next.js App Router miesza kod serwerowy i klienta w jednym folderze `src/app` — Server Actions (`actions.ts`), Route Handlery (`api/trpc/[trpc]/route.ts`, `api/auth/[...nextauth]/route.ts`) fizycznie żyją pod `src/app`, ale działają wyłącznie po stronie serwera. Reguła oparta tylko na ścieżce folderu nie odróżni tego od prawdziwego klienta.
2. **Jedno naruszenie jest realnie inne w rodzaju**: `device-overview.tsx` (ma `"use client"`) importuje `DEFAULT_THRESHOLDS` z `src/server/lib/scoring.ts`. Po sprawdzeniu treści — `scoring.ts` to czysta logika (żadnych Node API, sekretów, DB) — więc to nie jest wyciek bezpieczeństwa, ale jest **mylące nazewnictwo folderu**: nie wszystko pod `src/server/lib` jest faktycznie server-only.
3. `src/components/ui` (warstwa fundamentowa) ma **zero** importów w górę (`src/app`, `src/server`) — granica trzymana poprawnie.
4. Brak automatycznego sposobu odróżnienia "Server Component/Action" od "Client Component" po samej ścieżce — trzeba sprawdzać `"use client"`/`"use server"` ręcznie. To jest `unknown` dla samego narzędzia, nie "brak powiązania".
5. Nie sprawdzano granicy `src/lib` (client-safe) → `src/server/lib` (server-only) głębiej niż jeden przebieg reguły `warn` — wyszło 0 naruszeń, ale to małe `src/lib` (4 pliki), więc niska pewność tego wyniku.

| Sprawdzana granica | Wynik | Dowód z dependency-cruiser | Dlaczego to ważne przy zmianie | Związek z artifact-1-territory.md | Co sprawdzić dalej |
|---|---|---|---|---|---|
| `src/app` → `src/server` (ogólna) | 6 "naruszeń", z czego 5 to Server Actions/Route Handlers (oczekiwane) | `error no-client-importing-server: src/app/login/actions.ts → src/server/auth.ts` + 4 podobne | Reguła ścieżkowa nie wystarcza w App Router — potrzeba reguły świadomej `"use client"` | `src/app/api`, `login/` nie były w top 10 z artifact-1 (niska aktywność = niskie ryzyko regresji tu) | Dodać do `.dependency-cruiser.cjs` wyjątek po katalogu (`actions.ts`, `route.ts`) albo reguła oparta o zawartość pliku |
| `src/app` → `src/server` (realny klient) | 1 prawdziwe naruszenie ścieżki, ale bezpieczne treściowo | `error: src/app/_components/device-overview.tsx → src/server/lib/scoring.ts` | `scoring.ts` jest czystą logiką — bezpieczne, ale nazwa folderu "server" sugeruje coś innego nowemu devowi | `device-overview.tsx` = #1 hotspot z artifact-1 (25 commitów) — to ten plik dotyka tej granicy | Rozważyć przeniesienie `scoring.ts` do `src/lib` (jest używany i po stronie klienta, i serwera) — albo dopisać komentarz w pliku, że jest celowo bezpieczny dla klienta |
| `src/components/ui` → `src/app`/`src/server` | 0 naruszeń | brak błędów dla tej reguły | Fundament UI trzyma granicę — bezpiecznie refaktorować prymitywy bez obawy o cykl w górę | `components/ui` = obszar #7 z artifact-1 (17 commitów, ale głównie nowe komponenty, nie refaktory) | — |

## Ryzyka testowalności

### Podsumowanie

Metryki Ca (fan-in)/Ce (fan-out)/Instability na `src/` (bez plików testowych) ujawniają dwa różne wzorce ryzyka: **moduły-fundamenty** (wysoki Ca, do których zmiana dotyka wszystkiego co je importuje) i **moduły-agregatory** (wysoki Ce, same trudne do testowania w izolacji, bo ciągną dużo zależności).

### Lista ryzyk testowych

| Moduł | Ca / Ce / I | Rodzaj ryzyka | Co to znaczy praktycznie |
|---|---|---|---|
| `src/app/_components/device-overview.tsx` | 0 / **26** / 96% | Agregator skrajny | Najwyższy fan-out w repo — testowanie w izolacji wymaga mockowania ~26 zależności (query/mutation hooki, dnd-kit, layout state). Realistycznie: **test integracyjny/e2e**, nie unit. |
| `src/server/lib/valve-control.ts` | **7** / **7** / 50% | Chokepoint (oba wysokie) | Jedyna droga, którą *wszystko* (setpoint, valve toggle, mode trigger, automation tick) dociera do prawdziwego/stub Tuya klienta. Zepsuj to i psujesz 4 niezależne funkcje na raz. Testowalne w izolacji (ma już `valve-control.test.ts`), ale zmiana wymaga regresji na całej powierzchni, nie tylko jednego testu. |
| `src/server/api/routers/device.ts` | 0 / 11 / 92% | Agregator (server) | Najbardziej rozgałęziony router — łączy DB, Tuya client, crypto, scoring. Test wymaga hoisted-mock całej tej powierzchni (wzorzec już używany w `device.test.ts`). |
| `src/server/api/root.ts` | 11 / 8 / 42% | Fundament + agregator | Każdy nowy/usunięty router przechodzi tędy (potwierdzone w artifact-1). Nie ma własnej logiki do testowania, ale jest punktem, w którym literówka w rejestracji routera psuje całe API. |
| `src/server/db/schema.ts` | **17** / 2 / 11% | Fundament skrajny | Najwyższy fan-in w repo, prawie zerowa instability (zmienia się rzadko relatywnie do tego, jak wiele go importuje). To jest "nie psuj tego bez migracji" plik. |
| `src/trpc/react.tsx` | **19** / 8 / 30% | Fundament (client) | Najwyższy fan-in po stronie klienta — generator hooków `api.*`. Zepsucie typowania tu objawia się jako fala błędów TS w dziesiątkach komponentów na raz. |
| `src/app/_components/setup/mode-form.tsx` / `mode-manager.tsx` | 7-8 Ce każdy, 78-89% I | Agregator + cykl | Ten sam cykl co w sekcji "Cykle" — wysoka instability + cykl = najtrudniejsza para plików do bezpiecznej zmiany w całym `setup/`. |

### Najbardziej podejrzane moduły

1. **`device-overview.tsx`** — zarówno #1 w git-history (artifact-1), jak i #1 we fan-out (Ce=26). Dwa niezależne sygnały wskazują to samo miejsce — to najsilniejszy "tu boli najbardziej" wniosek z całej analizy.
2. **`valve-control.ts`** — nie jest hotspotem zmian (tylko 3 commity), ale jest hotspotem *ryzyka*: niska częstotliwość zmian + wysoki fan-in/fan-out = "rzadko dotykane, ale gdy dotykane, dotyka wszystkiego". Klasyczny kandydat na regresję, o której nikt nie pomyśli przy code review.
3. **`mode-form.tsx` ↔ `mode-manager.tsx`** — najnowszy kod w repo (automation-rework, ten tydzień), już ma cykl. Warto naprawić zanim ktoś zbuduje na tym kolejną warstwę.

### Co sprawdzić dalej

- Czy `valve-control.test.ts` faktycznie pokrywa wszystkie 4 ścieżki wywołania (setpoint, toggle, mode trigger, automation tick), czy tylko bezpośrednie wywołanie?
- Czy `device-overview.tsx` da się rozbić na mniejsze, testowalne komponenty bez utraty obecnej funkcjonalności (KPI rządki, drag-and-drop, filtry) — to pytanie do przyszłego planu refaktoru, nie do tej mapy.
- Realna granica `src/lib` ↔ `src/server/lib` — sprawdzić to dokładniej, gdy te foldery urosną (obecnie zbyt małe, by ufać wynikowi).

### Opcjonalny kolejny krok: graf

Wyrenderowano jeden, celowo wąski podgraf (nie cały `webapp`/`src`) — fokus na `valve-control.ts` z głębokością 2, bo to najciekawszy chokepoint z metryk (zbalansowany Ca=Ce=7), nie najgłośniejszy plik (to byłby `device-overview.tsx`, ale tam fan-out=26 zrobiłby nieczytelny graf):

```bash
npx depcruise --config .dependency-cruiser.cjs --ts-config tsconfig.json \
  --include-only "^src" \
  --focus "^src/server/lib/valve-control\.ts$" --focus-depth 2 \
  -T dot src | dot -T svg > context/map/valve-control-focus.svg
```

→ zapisano jako `context/map/valve-control-focus.svg`. Widać na nim wprost: `valve-control.ts` jako jedyny most między czterema niezależnymi wywołującymi (`mode-control.ts`, `automation-scheduler.ts`, i transitive przez `api/routers/*` ← `root.ts`) a czterema plikami klienta Tuya (`real-client`, `stub-client`, `dp-codes`, `types` przez `tuya/index.ts`), plus współdzielone `crypto.ts`/`log-context.ts`.
