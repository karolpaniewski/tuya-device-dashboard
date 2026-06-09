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

## localKey columns store AES-256-GCM ciphertext — always use crypto helpers

**Context:** `src/server/db/schema.ts` — `gateways.localKey`, `devices.localKey`

**Problem:** Tuya LAN local keys stored as plaintext TEXT give full device-control access to
anyone who reads `db.sqlite` (backup, Drizzle Studio, accidental file exposure). LAN-only
scope does not eliminate the risk.

**Rule:** `localKey` columns store AES-256-GCM ciphertext. All tRPC procedures and scripts
that write a `localKey` must call `encryptLocalKey()` before insert/update, and must call
`decryptLocalKey()` after reading. The `ENCRYPTION_SECRET` env var (64 hex chars) is the
key source. Both helpers live in `src/server/lib/crypto.ts`.

**Applies to:** S-01 device polling setup, any future procedure writing `gateways.localKey`
or `devices.localKey`, seed scripts that insert test devices.
