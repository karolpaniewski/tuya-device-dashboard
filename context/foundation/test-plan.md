# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-09 (Phase 1 → change opened)

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (15 commits/30d).
Top directories by churn: `src/server/db` (7), `src/server/lib/tuya` (4),
`src/app/login` (4), `src/app/_components` (4), `src/server/api` (3),
`src/server/workers` (1).

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Niezalogowany użytkownik na LAN dociera do danych urządzeń lub wydaje komendę setpoint | High | Medium | PRD §Access Control ("inaccessible without valid login credentials, even from within the LAN"), archived slice: auth-scaffold |
| 2 | Polling worker cicho pada → stale device state serwowany jako live przez >30s, manager podejmuje decyzje na nieaktualnych danych | Medium | Medium | PRD §NFR ("readings current within 30 seconds"), live-device-overview slice plan ("process-level singleton, no recovery logic"), hot-spot `src/server/workers` (1 commit/30d), interview Q3 |
| 3 | `decryptLocalKey` produkuje zły klucz lub rzuca wyjątek → gateway nieosiągalny lub odszyfrowany klucz wycieka do logów / error body | High | Medium | live-device-overview slice plan (key discovery: "decryptLocalKey before passing to tuyapi"), hot-spot `src/server/lib/tuya` (4 commits/30d), interview Q3 |
| 4 | Komenda setpoint wysłana do złego DP code lub bez potwierdzenia → zawór zablokowany na jednej temperaturze, użytkownik nie widzi błędu | High | High | interview Q1 (user's top stated fear), PRD §FR-012 guardrail ("no silent failures"), PRD §FR-011 caveat ("DP codes vary — control may silently fail"), roadmap S-04 (blocked on DP code docs) |
| 5 | Scoring progów temperaturowych (room health) produkuje zły badge lub brakujący alert → manager nie widzi Too Cold / Too Hot | Medium | Medium | PRD §Business Logic (scoring formula + anomaly detection), roadmap S-05 (proposed), PRD §Open Questions #3 (multi-sensor aggregation strategy undefined) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Request bez ważnej sesji do tRPC device procedure → UNAUTHORIZED, nie dane urządzeń; redirect do `/login` | "Zalogowany użytkownik = dostęp do wszystkiego" nie implikuje, że middleware nie przepuszcza `/_next/` lub tRPC batch endpoint bez sesji | Middleware matcher pattern i które ścieżki obejmuje; `protectedProcedure` stack w tRPC context; callbackUrl redirect flow dla chronionych tras | Integration test (tRPC call bez sesji) | Test wyłącznie happy-path logowania; brak testu żądania bez sesji do procedur danych |
| #2 | Worker start → crash → restart cycle: state store zamraża dane lub flaguje stale, nie serwuje silently-dead data jako fresh; tRPC resolver musi wykryć brak odświeżenia >30s | "Worker działa ze stubem w dev" nie implikuje, że obsłuży błąd prawdziwego klienta Tuya; stub ukrywa failure modes | Singleton lifecycle i co dzieje się przy unhandled rejection w pętli pollera; czy resolver sprawdza timestamp ostatniego odświeżenia przed odpowiedzią | Unit/integration (worker error path + stale-state detection) | Testowanie wyłącznie happy-path startu workera |
| #3 | `decryptLocalKey(validCiphertext)` = oryginalny plaintext key; `decryptLocalKey(invalidCiphertext)` = throw, nie garbage lub silent no-op; klucz nie pojawia się w żadnym logu ani error body | "Działa z fixture seed key" nie implikuje odporności na corrupted ciphertext lub zły IV/auth-tag | AES-256-GCM params (długość IV, auth tag format); format klucza w seed vs format produkcyjny; ścieżki logowania gdzie gateway credentials mogą trafić do output | Unit test (pure function: valid + invalid + edge cases) | Test wyłącznie happy path ze fixture key; brak testu invalid/corrupted input |
| #4 | Komenda do urządzenia z nieznanym DP code → flagowana jako "unsupported" zanim wysłana, nie próbuje nadpisać losowego datapoint; failed command → specyficzny błąd w UI, nie silence | "HTTP 200 od API = zawór zareagował" — HTTP success ≠ fizyczna zmiana na urządzeniu | DP code validation logic (gdzie i kiedy "unsupported" jest oznaczane); feedback pathway od tuyapi przez tRPC do UI; error propagation przy timeout / nack od urządzenia | Integration (command pipeline) + smoke test z real hardware po wdrożeniu S-04 | Assert status 200 = sukces; nie testowanie failure i unsupported-device path |
| #5 | `scoreRoom(sensors, setpoint, thresholds)` z known inputs → expected badge (OK/Too Cold/Too Hot); edge: brak sensorów w pokoju → brak badge (nie error, nie falszywy status); multi-sensor → aggregacja worst-case | "S-05 wyląduje z testami" — bez jawnego planu testy zignorują edge cases z PRD Open Questions (multi-sensor aggregation undefined) | Strategia agregacji dla pokoju z >1 sensorem (min/avg/worst-case); formuła anomaly gap; zachowanie gdy żaden sensor nie jest przypisany do pokoju | Unit test (pure scoring function z known inputs) | Implementation mirror: assert output = co funkcja teraz zwraca, nie co PRD mówi że powinna zwrócić |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Bootstrap + auth-gate + crypto | Wdróż Vitest; udowodnij auth-gate regression i poprawność decryptLocalKey | #1, #3 | unit (crypto), integration (tRPC auth protection) | change opened | context/changes/testing-bootstrap-auth-crypto |
| 2 | Polling worker integrity | Udowodnij że worker nie serwuje stale state jako live po błędzie | #2 | unit/integration (worker lifecycle + stale detection) | not started | — |
| 3 | Valve control + threshold scoring | Udowodnij FR-012 command feedback contract i poprawność room scoring | #4, #5 | unit (scoring), integration (command pipeline), smoke z hardware | not started | — |
| 4 | Quality gates wiring | Zamknij floor: lint + typecheck + Vitest w CI | cross-cutting | gates (naming only, bez YAML) | not started | — |

**Status vocabulary** (parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`

---

## 4. Stack

Baza testowa na start: **none** — brak test runner config, brak plików `*.test.*`. Phase 1 bootstrapuje runner.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | none yet — see §3 Phase 1 | Standardowe dla T3/Next.js 15 App Router; działa z tRPC i Drizzle w Node environment |
| API / module mocking | Vitest built-in + `vi.mock` | none yet — see §3 Phase 1 | Dla izolacji warstwy Tuya client i DB w testach integracyjnych |
| e2e | none yet | — | Wykluczone z zakresu MVP (§7); rozważyć w --refresh gdy S-04 + real hardware stabilne |
| hardware smoke | manual (tuyapi + real devices) | — | Fizyczne urządzenia dostępne (interview Q5 update); stosować dla R4 po wdrożeniu S-04 |

**Stack grounding tools (current session):**
- Docs: none — brak Context7 / framework docs MCP w bieżącej sesji; Vitest + Next.js 15 compatibility zweryfikowana przez local manifest; checked: 2026-06-09
- Search: Exa.ai dostępny (mcp__exa__web_search_exa) — nie użyto, stack T3+Vitest wystarczająco ugruntowany przez manifest; checked: 2026-06-09
- Runtime/browser: none — brak Playwright MCP w bieżącej sesji; e2e wykluczone z zakresu (§7)
- Provider/platform: Linear MCP dostępny — wyłącznie issue tracking, bez relevancji dla quality gates; checked: 2026-06-09

---

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required | syntactic / type drift |
| unit + integration (Vitest) | local + CI | required after §3 Phase 1 | logic regressions (auth, crypto, worker, scoring) |
| hardware smoke (S-04) | manual, on PR | required after §3 Phase 3 | command feedback na real hardware |
| post-edit hook (Vitest) | local (agent loop) | recommended after §3 Phase 4 | regressions w czasie edycji |
| e2e | CI | not in scope — see §7 | (wykluczone z MVP) |
| UI snapshot | CI | not in scope — see §7 | (wykluczone, interview Q5) |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, it reads "TBD — see §3 Phase N."

### 6.1 Adding a unit test (pure function)

TBD — see §3 Phase 1 (crypto / decryptLocalKey pattern).

### 6.2 Adding an integration test (tRPC procedure)

TBD — see §3 Phase 1 (auth-gate pattern: tRPC call bez sesji → UNAUTHORIZED).

### 6.3 Adding a worker / polling test

TBD — see §3 Phase 2 (polling worker lifecycle + stale-state detection pattern).

### 6.4 Adding a command pipeline test

TBD — see §3 Phase 3 (command feedback contract: FR-012 failure path pattern).

### 6.5 Adding a business logic unit test

TBD — see §3 Phase 3 (room threshold scoring: scoreRoom z known inputs + edge cases).

### 6.6 Per-rollout-phase notes

(Wypełniane przez `/10x-implement` po zakończeniu każdej fazy — nieoczekiwane odkrycia, wzorce fixture, etc.)

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI snapshot tests** — migają przy każdej zmianie layoutu i nie łapią niczego znaczącego dla tej domeny; re-evaluate jeśli projekt przejdzie na design system z kontraktem wizualnym. (Source: interview Q5.)
- **UI component tests (React Testing Library itp.)** — zakres MVP koncentruje się na logice backendu, crypto i business rules; UI jest cienką warstwą nad tRPC; re-evaluate jeśli pojawi się złożona logika po stronie klienta. (Source: interview Q5.)
- **Seed skrypt i migracje Drizzle** — jednorazowe operacje administracyjne, niski blast radius, testowane ręcznie przy każdym wdrożeniu. Re-evaluate jeśli seed stanie się krytyczną ścieżką.
- **Generowane typy tRPC** — generator jest testem; typecheck w CI wystarczy.
- **Zewnętrzne powiadomienia** — brak w MVP (PRD §Non-Goals).

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-09
- Stack versions last verified: 2026-06-09
- AI-native tool references last verified: 2026-06-09 (none in use)

Refresh (`/10x-test-plan --refresh`) when:

- nowe top-3 ryzyko pojawi się z roadmapy lub archiwum,
- `checked:` date dowolnego narzędzia jest starsza niż 3 miesiące,
- stack projektu zmieni się (nowy framework, nowy test runner),
- §7 negative-space nie odpowiada już temu, w co wierzy zespół.
