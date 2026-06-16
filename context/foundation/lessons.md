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

## Native typed `<input>` elements can desync from React state with no visible error

**Context:** `src/app/_components/setup/automation-form.tsx` — fire-time and setpoint fields
(S-11 automation-rules, Phase 5)

**Problem:** A native `<input type="number">` or `<input type="time">` can display a value
on screen while its `.value` property silently reports `""` — `type="number"` rejects a
comma decimal separator (locale-dependent) and `type="time"` has its own validity-state
quirks. Since `e.target.value` is what reaches React's `onChange`, the controlled state
variable goes out of sync with what the user visually sees, with zero error feedback. This
showed up twice in the same form: the submit button stayed permanently disabled because a
derived `canSubmit` check depended on a state value that silently never updated.

**Rule:** For typed inputs that allow ambiguous locale input (numbers, times), prefer
`type="text"` + an `inputMode` hint (`"decimal"` / `"numeric"`) + a custom `onChange` that
normalizes/masks the raw string before committing to state, instead of relying on native
`type="number"`/`type="time"` value coercion. Validate completeness with a regex (or
existing Zod schema) rather than trusting native `min`/`max`/`step`/type behavior.

**Applies to:** Any future form input for numeric or time-like values; if a submit button
stays inexplicably disabled despite all fields appearing filled, suspect this class of bug
before assuming a logic error in the enabling condition.

## Base UI `Select` needs an `items` prop to resolve its `SelectValue` label

**Context:** `src/components/ui/select.tsx` wraps `@base-ui/react/select`; seen in
`automation-form.tsx`'s device picker and `device-table.tsx`'s room picker (S-11, S-02)

**Problem:** `SelectValue` resolves its displayed label by looking up the current `value` in
the store's registered `items`. Items are only registered once `SelectItem` children for the
current value have actually mounted (i.e., the popup has been opened at least once). Without
an explicit `items` prop on `Select`, the very first paint of a controlled `Select` shows the
raw value (e.g., a UUID) instead of its label, since nothing has registered a label for it
yet.

**Rule:** Always pass `items={...}` (a `Record<value, label>`, or array of `{value, label}`)
to `Select` when its initial `value` can be non-empty on first render — i.e., whenever the
value comes from existing data (a saved room/device assignment) rather than starting empty.

**Applies to:** Any `Select` usage in this codebase where `value` can be pre-populated from
server data on mount.
