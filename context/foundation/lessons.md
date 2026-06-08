# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## tsx scripts require --env-file for .env loading

**Context:** `package.json` — `db:seed` script

**Problem:** Skrypt tsx uruchomiony przez `npm run <script>` nie ładuje automatycznie
pliku `.env`. Bez `--env-file=.env` wszystkie `process.env` guards w skrypcie
failują natychmiast, mimo że `.env` istnieje w katalogu projektu.

**Rule:** Każdy skrypt npm używający tsx, który czyta process.env bezpośrednio,
musi mieć dodany `--env-file=.env` w package.json.

**Applies to:** Wszystkie skrypty `db:*`, CLI scripts, cokolwiek używa tsx bezpośrednio
poza kontekstem Next.js (który ma własny mechanizm ładowania .env).
