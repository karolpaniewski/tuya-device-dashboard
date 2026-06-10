# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-10 (Phase 4 → complete; §5 status footnotes; §6.6 post-edit hook recipe)

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
| 1 | Bootstrap + auth-gate + crypto | Wdróż Vitest; udowodnij auth-gate regression i poprawność decryptLocalKey | #1, #3 | unit (crypto), integration (tRPC auth protection) | complete | context/changes/testing-bootstrap-auth-crypto |
| 2 | Polling worker integrity | Udowodnij że worker nie serwuje stale state jako live po błędzie | #2 | unit/integration (worker lifecycle + stale detection) | complete | context/changes/testing-polling-worker |
| 3 | Valve control + threshold scoring | Udowodnij FR-012 command feedback contract i poprawność room scoring | #4, #5 | unit (scoring), integration (command pipeline), smoke z hardware | complete | context/changes/testing-valve-control-scoring |
| 4 | Quality gates wiring | Zamknij floor: lint + typecheck + Vitest w CI | cross-cutting | gates (naming only, bez YAML) | complete | context/changes/testing-quality-gates-wiring |

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
| lint + typecheck | local + CI | required — local ✔; CI YAML pending (Module 1 Lesson 5) | syntactic / type drift |
| unit + integration (Vitest) | local + CI | required — local ✔; CI YAML pending (Module 1 Lesson 5) | logic regressions (auth, crypto, worker, scoring) |
| hardware smoke (S-04) | manual, on PR | required after §3 Phase 3 | command feedback na real hardware |
| post-edit hook (Vitest) | local (agent loop) | recommended after §3 Phase 4 | regressions w czasie edycji |
| e2e | CI | not in scope — see §7 | (wykluczone z MVP) |
| UI snapshot | CI | not in scope — see §7 | (wykluczone, interview Q5) |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, it reads "TBD — see §3 Phase N."

### 6.1 Adding a unit test (pure function)

**Reference test**: `src/server/lib/crypto.test.ts`  
**Run**: `npm test`

- **File location**: co-located next to the module — `src/path/to/module.test.ts`
- **Imports**: import directly from the module under test; no mocks needed for pure functions
- **Env setup**: `process.env.ENCRYPTION_SECRET` (and other required vars) are set in `src/test/setup.ts` — no per-test setup needed for crypto helpers
- **Oracle rule**: the expected value in each assertion must come from an independent source (a plaintext constant, a PRD rule, a spec) — never from inspecting what the function currently returns; use `encryptLocalKey(PLAINTEXT)` → `decryptLocalKey(...)` → compare against `PLAINTEXT`, not against a hardcoded ciphertext snapshot
- **Error case pattern**: for functions that must throw on bad input, pass a value that is structurally invalid for the format (e.g. a base64 string that decodes to fewer bytes than IV + auth-tag) and assert `.toThrow()` — no need to assert the specific error message

### 6.2 Adding an integration test (tRPC procedure)

**Reference test**: `src/server/api/routers/device.test.ts`  
**Run**: `npm test`

- **File location**: co-located next to the router — `src/server/api/routers/<router>.test.ts`
- **Required mocks** (top of file, Vitest hoists these before imports):
  ```ts
  vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
  vi.mock("~/server/db", () => ({ db: {} }));
  ```
  Without these, importing `createCaller` triggers `~/server/auth` and `~/server/db` which fire `~/env` Zod validation and fail outside Next.js.
- **Caller creation**: import `createCaller` from `~/server/api/root` (NOT from `~/trpc/server` — that file imports `server-only` and `next/headers`); pass an inline context object:
  ```ts
  const caller = createCaller({ db: {} as never, session: null, headers: new Headers() });
  ```
- **Auth-gate assertion**: `await expect(caller.router.procedure()).rejects.toMatchObject({ code: "UNAUTHORIZED" })`
- **Note on timing delay**: `protectedProcedure` chains `timingMiddleware` which adds ~500 ms in non-production environments. This is expected and does not affect test correctness.

### 6.3 Adding a worker / polling test

**Reference test**: `src/server/workers/tuya-poller.test.ts`  
**Run**: `npm test`

- **File location**: co-located next to the worker — `src/server/workers/<worker>.test.ts`
- **Required mocks** (Vitest hoists these before imports):
  ```ts
  vi.mock("~/server/db", () => ({ db: { select: vi.fn() } }));
  vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));
  ```
- **Store interaction**: import `deviceStateStore` from `~/server/lib/device-state-store` directly. Call `deviceStateStore.clear()` in `beforeEach` to isolate test cases. Pre-seed with `deviceStateStore.set(id, { isOnline, temperatureC, lastPolledAt })` to control starting state.
- **DB mock shape for `pollOnce`**: `db.select()` returns `{ from: vi.fn().mockResolvedValue([gatewayRows]) }` — two levels only (no `leftJoin`; gateway queries are flat).
- **Tuya client mock shape**: `vi.mocked(getTuyaClient).mockReturnValue({ fetchGatewayDevices: vi.fn().mockResolvedValue([readings]) })` for success path; `.mockRejectedValue(new Error("..."))` for the error path.
- **Oracle rule for `lastPolledAt`**: assert `Date.now() - store.get(id)!.lastPolledAt.getTime() < 1000` — do not hardcode a specific timestamp; the oracle is "timestamp is recent", relative to when the test ran.
- **Stale detection (resolver tests)**: see `src/server/api/routers/device.test.ts` `"stale detection"` describe block. Pre-seed the store with a known `lastPolledAt`, call `caller.device.overview()`, assert `isStale`. Threshold constant: `STALE_THRESHOLD_MS = 60_000` in `device.ts`.

### 6.4 Adding a command pipeline test

**Reference test**: `src/server/api/routers/device.setpoint.test.ts`  
**Run**: `npm test`

- **File location**: co-located next to the router — `src/server/api/routers/<router>.<procedure>.test.ts`
- **Required mocks** (top of file — Vitest hoists before imports):
  ```ts
  vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
  vi.mock("~/server/db", () => ({ db: {} }));
  vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));
  vi.mock("~/server/lib/crypto", () => ({
    decryptLocalKey: vi.fn().mockReturnValue("plaintext-key"),
  }));
  vi.mock("~/server/lib/tuya/dp-codes", () => ({
    DP_CODE_MAP: { "test-product-key": 2 },
  }));
  ```
  The `~/server/lib/crypto` mock prevents real AES-256-GCM execution in tests (crypto correctness is covered by Phase 1 unit tests). The `dp-codes` mock injects a synthetic productKey → DPS mapping.
- **Two-call `db.select()` pattern**: `device.setpoint` calls `db.select()` twice — once for the device lookup, once for the gateway lookup. Use `mockReturnValueOnce` chained twice so each call resolves to a different row:
  ```ts
  const mockDb = {
    select: vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([mockDevice]) }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([mockGateway]) }),
      }),
  };
  ```
  Pass `mockDb as never` when creating the caller.
- **`sendSetpoint` spy pattern**:
  - Success path: `vi.fn().mockResolvedValue(undefined)`
  - Failure path: `vi.fn().mockRejectedValue(new Error("timeout"))`
  - Wire to caller via: `vi.mocked(getTuyaClient).mockReturnValue({ sendSetpoint: mock } as never)`
- **Anti-pattern to avoid**: Do not assert only the success return value. The highest-signal tests are the **failure paths** — `BAD_REQUEST` for unsupported DP code and `INTERNAL_SERVER_ERROR` for tuyapi rejection. The `BAD_REQUEST` test MUST assert `expect(sendSetpointMock).not.toHaveBeenCalled()` — this is the guard that proves the unsupported-device check fired before the command was dispatched. Without this assertion, a broken guard (that lets the command through) would still pass the test.
- **Call `afterEach(() => vi.resetAllMocks())`** to prevent mock state from leaking between test cases.

### 6.5 Adding a business logic unit test

**Reference test**: `src/server/lib/scoring.test.ts`  
**Run**: `npm test`

- **File location**: co-located with the module — `src/server/lib/<module>.test.ts`
- **No mocks needed** for pure functions: import the function under test directly; no `vi.mock` required.
- **Oracle rule** (critical — read this before writing any `expect`): Every expected constant in an assertion must be derivable from a PRD or specification rule **by reading that rule**, not by running the function and recording its current output. Writing `expect(result).toBe(scoreRoom(inputs))` as the expected value is the *implementation mirror anti-pattern* — it turns a test into a tautology that passes even when the function is wrong, as long as it is consistently wrong.
  - Correct: `expect(result.badge).toBe("Too Cold")` — because PRD §FR-012 states `temp < minTempC → "Too Cold"`, and `15 < 18`.
  - Wrong: `expect(result.badge).toBe(scoreRoom(15, null, thresholds).badge)` — this re-invokes the function as the oracle.
- **Edge-case checklist** — always cover:
  - **Null inputs**: `temperatureC: null` → badge must be `null`, not an error or default string.
  - **Boundary values**: test at exactly `minTempC` and `maxTempC` — the contract is inclusive (`>=` / `<=`), so `temp === minTempC` must yield `"OK"`, not `"Too Cold"`.
  - **Suppression paths**: fields that are `null` must suppress derived computations (e.g. `anomalyGapC: null` → `anomaly: false` even when all other inputs are non-null).
  - **Partial null**: a single null threshold field (e.g. `minTempC: null` with `maxTempC` non-null) must suppress the badge — partial thresholds are not safe to use.

### 6.6 Configuring the post-edit Vitest hook (local agent loop)

**Purpose**: run the test suite automatically after every file edit during an agent session.
**Recommended**: yes — catches regressions in-flight without manual re-runs.

Add to `.claude/settings.json` in the project root (create alongside `.claude/settings.local.json` if absent):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npm test 2>&1 | tail -30"
          }
        ]
      }
    ]
  }
}
```

`tail -30` keeps output readable in the agent loop; increase the line count if a failure scrolls off.
This hook fires after every edit or write; the agent sees test output and can self-correct before the next step.
**Note**: local development only — not a CI gate. The CI entry point is `npm run ci`.

### 6.7 Per-rollout-phase notes

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
