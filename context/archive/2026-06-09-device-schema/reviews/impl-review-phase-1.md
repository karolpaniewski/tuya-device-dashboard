<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Device Data Schema — Phase 1

- **Plan**: `context/changes/device-schema/plan.md`
- **Scope**: Phase 1 of 2
- **Date**: 2026-06-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 2 warnings · 3 observations

## Verdicts

| Dimension            | Verdict |
|----------------------|---------|
| Plan Adherence       | PASS    |
| Scope Discipline     | PASS    |
| Safety & Quality     | WARNING |
| Architecture         | PASS    |
| Pattern Consistency  | PASS    |
| Success Criteria     | PASS    |

## Findings

### F1 — localKey columns stored as plaintext

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/server/db/schema.ts:37` (gateways), `src/server/db/schema.ts:72` (devices)
- **Detail**: Both `gateways.localKey` and `devices.localKey` store Tuya LAN encryption keys as plain TEXT in SQLite. These keys grant full local-protocol control over every device on the network. Anyone with read access to `db.sqlite` (backup, Drizzle Studio, accidental file exposure) can impersonate any device. The LAN-only self-hosted scope limits the blast radius, but the risk is real and should be explicitly acknowledged.
- **Fix A ⭐ Recommended**: Accept as known risk — add `// TODO: encrypt at rest before any internet-accessible deployment` inline comment on both columns and record in `context/foundation/lessons.md`.
  - Strength: Zero code change; honest acknowledgment; surfaces on any future security pass.
  - Tradeoff: Key material stays plaintext for MVP.
  - Confidence: HIGH — LAN-only PRD constraint makes full encryption disproportionate for v1.
  - Blind spot: Backup files going off-LAN not covered.
- **Fix B**: Encrypt at DB level now using a symmetric key stored in env.
  - Strength: Eliminates plaintext-at-rest risk entirely.
  - Tradeoff: Requires application-layer encrypt/decrypt on every read/write; key management complexity; out of scope for this change.
  - Confidence: MEDIUM — adds meaningful complexity before S-01 is even working.
  - Blind spot: Key rotation path not designed yet.
- **Decision**: FIXED via Fix B — `src/server/lib/crypto.ts` created; `ENCRYPTION_SECRET` added to `.env` + `src/env.js`; schema comments updated; lesson recorded.

---

### F2 — roomThresholds missing min < max constraint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/server/db/schema.ts:126-128`
- **Detail**: `roomThresholds` has `minTempC` and `maxTempC` as nullable REALs with no ordering constraint. Nothing prevents saving `minTempC = 25, maxTempC = 18`, which produces an inverted threshold window. The business logic in S-05 would then silently score every room as anomalous. No application-layer validation exists yet (S-05 owns that), so only the DB can catch this now.
- **Fix**: Add `check("threshold_order_check", sql\`${t.minTempC} IS NULL OR ${t.maxTempC} IS NULL OR ${t.minTempC} < ${t.maxTempC}\`)` to the extras array in `roomThresholds`. The NULL guards preserve the nullable intent (unset thresholds are valid).
  - Strength: Zero cost at read time; fires before any application code on insert/update; prevents a class of silent data bugs.
  - Tradeoff: Requires a schema edit + `db:push` re-run; need to coordinate with Phase 2 migration.
  - Confidence: HIGH — identical check pattern already used on `devices.deviceType`.
  - Blind spot: `anomalyGapC` could also have a `> 0` constraint, but that's lower stakes.
- **Decision**: FIXED — `threshold_order_check` added to `roomThresholds` extras array with NULL guards.

---

### F3 — gatewayId nullable intent not documented inline

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/server/db/schema.ts:67`
- **Detail**: `devices.gatewayId` is nullable by design (devices can exist before gateway pairing is confirmed, per plan). This is correct, but no inline comment documents the intent. Future S-01 authors may add `.notNull()` thinking it was an oversight, or may not account for `null` joins in the polling query.
- **Fix**: Add `// nullable: device may exist before gateway pairing; S-01 must handle null joins` above the `gatewayId` column.
- **Decision**: FIXED — comment added.

---

### F4 — assignment_room_idx index added (not in plan)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/server/db/schema.ts:123`
- **Detail**: An `index("assignment_room_idx").on(t.roomId)` was added to `deviceRoomAssignments` — not mentioned in the plan. This is additive and sound (an index on the FK column is standard practice and will help S-01's room-grouped queries). Not a concern.
- **Fix**: No action needed. The index is correct and beneficial.
- **Decision**: SKIPPED — sound addition, no action needed.

---

### F5 — @ts-expect-error in trpc/server.ts is correct and self-correcting

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/trpc/server.ts:28`
- **Detail**: The `@ts-expect-error` suppresses a real TypeScript error caused by tRPC v11's `AnyRouter extends TRouter` conditional being triggered by the now-empty router. The suppression is semantically correct: `@ts-expect-error` (not `@ts-ignore`) means TypeScript will promote it to a compiler error once the condition resolves — i.e., when S-01 adds the first procedure. At that point `typecheck` will fail until the comment is removed, which is the intended signal.
- **Fix**: No action needed. The mechanism is self-correcting.
- **Decision**: SKIPPED — self-correcting, no action needed.
