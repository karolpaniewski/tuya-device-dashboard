# Artefakt 3 — Kontrybutorzy (kto wie co i o co go zapytać)

> Bazuje na `artifact-1-territory.md` i `artifact-2-structure.md`.

## Ważne odkrycie zanim zaczniesz pytać kogokolwiek o cokolwiek

```bash
git log --format="%an <%ae>" | sort | uniq -c | sort -rn
#  164 Karol <karol.paniewski@gmail.com>
```

**To repo ma jednego autora-człowieka na 164 commity.** Klasyczny scenariusz "kto wie co" (Alice robi backend, Bob robi frontend, zapytaj Carol o płatności) tu nie istnieje — nie ma kogo wybierać. Pytanie z promptu trzeba przeformułować: nie "kogo zapytać", ale **"o jaki temat/change-id zapytać Karola, żeby dostać szybką, konkretną odpowiedź, a nie 'nie pamiętam, to było AI'"**.

Druga rzecz wartą wiedzieć zanim ktokolwiek zapyta o cokolwiek: **45% wszystkich commitów (73/164) ma trailer `Co-Authored-By: Claude`** — duża część kodu była pisana w parze z agentem AI (Claude Code), nie wyłącznie ręcznie. To nie obniża automatycznie wiarygodności kodu, ale zmienia charakter pytania "czy autor to pamięta" — przy silnie AI-asystowanych obszarach lepszym pytaniem może być "czy mamy gdzieś plan/commit message z rozumowaniem", bo to record bywa bogatszy niż pamięć osoby.

## Top 5 obszarów (z artifact-1 + artifact-2) i czego dotyczyły commity

Wybrane jako przecięcie najwyższej aktywności (artifact-1) i najwyższego ryzyka strukturalnego (artifact-2: fan-out, chokepointy, cykl).

### 1. Dashboard — `src/app/_components/*.tsx` (top-level, bez `setup/`)
**41 commitów, 51% AI co-authored, 2026-06-08 → 2026-06-23 (cała historia repo)**

| Change-id | Commity | Temat |
|---|---|---|
| `dashboard-command-center-redesign` | 6 | Główny redesign UI dashboardu — KPI rządki, command-center shell |
| `visual-ux-redesign` | 5 | Dark/light mode, design tokens (`--cc-*`) |
| `dashboard-ux-redesign` | 4 | Dokończenie redesignu — paleta, density |
| `dashboard-personalization` | 3 | Drag-and-drop reorder/hide widgetów |
| `ux-polish` | 3 | Skeletony, empty states, toasty |
| `device-dnd-modal` | 2 | Drag-and-drop urządzeń, modal zarządzania |
| `room-heat-toggle` | 2 | Quick-action wyłączania ogrzewania |

**O co zapytać Karola w tym obszarze:** historia 4 kolejnych redesignów tego samego pliku (`device-overview.tsx`, #1 hotspot z artifact-1, #1 fan-out z artifact-2) — najlepiej pytać konkretnie "który redesign wprowadził X", bo plik przechodził przez kilka generacji stylistyki, nie jedną.

### 2. Tuya / kontrola urządzeń — `src/server/lib/{tuya/,valve-control,plug-control,mode-control,device-state-store}`
**19 commitów, 53% AI co-authored, 2026-06-09 → 2026-06-22**

| Change-id | Commity | Temat |
|---|---|---|
| `room-heat-toggle` | 4 | Bezpośrednie zamykanie zaworu (DP 3), niezależne od setpointu |
| `testing-valve-control-scoring` | 3 | Testy i hardening warstwy kontroli zaworu |
| `device-dnd-modal` | 2 | Integracja z modalem urządzenia |
| `automation-rework` | 1 | Modes wołają `sendValveStateCommand` wprost (ta sesja) |
| `room-health-thresholds` | 1 | Logika oceny temperatury vs setpoint |

**O co zapytać Karola w tym obszarze:** `valve-control.ts` jest chokepointem (artifact-2: Ca=Ce=7) z najniższą częstotliwością zmian (3 commity wprost), ale najszerszym realnym wpływem. To miejsce, gdzie "mało zmian" nie znaczy "mało ważne" — pytać wprost o protokół DP-kodów (`dp-codes.ts`) i różnicę real-client vs stub-client przed jakąkolwiek zmianą tu.

### 3. Setup / panel admina — `src/app/_components/setup/`
**21 commitów, 48% AI co-authored, 2026-06-10 → 2026-06-23**

| Change-id | Commity | Temat |
|---|---|---|
| `setup-to-settings` | 4 | Reorganizacja Setup → Settings (treść, nie tylko styl) |
| `automation-rework` | 3 | Rules → Modes (ta sesja, najnowszy kod w repo) |
| `visual-ux-redesign` | 3 | Design tokens |
| `ux-polish` | 3 | Polish UX |
| `room-site-reassignment` | 2 | Przenoszenie pokoju między site'ami |

**O co zapytać Karola w tym obszarze:** to jedyny obszar z realnym cyklem zależności (`mode-form.tsx` ↔ `mode-manager.tsx`, artifact-2) — to najnowszy kod w całym repo, jeszcze "ciepły", więc decyzje projektowe (czemu typy mieszkają w `mode-manager.tsx`, nie w osobnym pliku) są świeże i łatwe do uzyskania teraz, zanim kontekst się zatrze.

### 4. API routery — `src/server/api/`
**39 commitów, 51% AI co-authored, 2026-06-08 → 2026-06-23**

| Change-id | Commity | Temat |
|---|---|---|
| `testing-valve-control-scoring` | 4 | Testy routera device |
| `automation-rework` | 4 | Nowy router `mode.ts`, usunięcie `automation.ts` |
| `automation-rules` | 3 | (Zastąpiony przez automation-rework) Stary router `automation.ts` |
| `observability` | 2 | Strukturalne logowanie w routerach |
| `room-site-reassignment` | 2 | Transakcyjna zmiana site'a pokoju |

**O co zapytać Karola w tym obszarze:** `automation-rules` → `automation-rework` to pełny cykl życia jednej funkcji (zbudowana, potem całkowicie zastąpiona w tej samej sesji) — dobry przykład tego, jak szybko się tu podejmuje i odwraca decyzje architektoniczne. Pytać "dlaczego X zostało zrobione" z świadomością, że odpowiedź może być "już nieaktualne, zobacz Y".

### 5. Schemat bazy danych — `src/server/db/`
**19 commitów, 53% AI co-authored, 2026-06-08 → 2026-06-23**

| Change-id | Commity | Temat |
|---|---|---|
| `auth-scaffold` | 3 | Tabela `users`, sesje |
| `automation-rework` | 2 | Dodanie i usunięcie dwóch generacji tabel automatyzacji |
| `device-schema` | 2 | Fundament: `sites`, `rooms`, `devices` |
| `live-device-overview` | 2 | Pierwsze tabele dla odczytów temperatury |
| `automation-rules` | 2 | (Zastąpione) pierwsza generacja tabel automatyzacji |

**O co zapytać Karola w tym obszarze:** `schema.ts` ma najwyższy fan-in w repo (artifact-2: Ca=17) i prawie zero instability — to jest plik, w którym "mała zmiana" nigdy nie jest mała. Dwie tabele automatyzacji zostały tu dodane i usunięte w ciągu tej samej sesji (`automation_rule`/`automation_execution_log` → `automation_mode*`) — pytać o to konkretnie, jeśli ktoś natknie się na referencje do starych nazw w historii gita.

## Podsumowanie dla nowego developera

- Jest jeden człowiek do zapytania: **Karol**. Nie szukaj "eksperta od X" — szukaj raczej change-id/tematu, żeby pytanie było konkretne.
- ~Połowa kodu w każdym z 5 obszarów ma asystę AI (Claude Code) w commit message. To nie jest jednorodnie rozłożone w czasie czy obszarze (różnice 48-53%, statystycznie nieistotne) — ale samo zjawisko jest warte znać, zwłaszcza przy pytaniu "czy to było przemyślane, czy wygenerowane".
- Najbardziej "świeży" kontekst (najmniej zatarty pamięciowo) to `automation-rework` — wszystko inne ma już 1-2 tygodnie historii w 15-dniowym repo, co w tym tempie pracy jest realnie "dawno".
