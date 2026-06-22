<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Valve control + threshold scoring tests (Phase 3 rollout)

- **Plan**: context/changes/testing-valve-control-scoring/plan.md
- **Scope**: All phases (Phase 3.1–3.5)
- **Date**: 2026-06-10
- **Verdict**: NEEDS ATTENTION (7 findings; all triaged and resolved)
- **Findings**: 2 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL (F1, F2, F3, F4 — all fixed) |
| Architecture | PASS |
| Pattern Consistency | WARNING (F5 — fixed) |
| Success Criteria | PASS |

## Findings

### F1 — real-client.ts silently passes empty string to tuyapi when localKey is null

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/server/lib/tuya/real-client.ts:20
- **Detail**: `gateway.localKey ?? ""` silently passes empty string to tuyapi when localKey is null; AES-GCM would throw KEY_DECRYPT_FAILED masking the real cause.
- **Fix**: Added explicit guard `if (!gateway.localKey) throw new Error("localKey is required for sendSetpoint")` before `device.connect()`.
- **Decision**: FIXED

### F2 — No test asserts decryptLocalKey() is called before sendSetpoint

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/server/api/routers/device.setpoint.test.ts (missing assertion)
- **Detail**: Success test mocked decryptLocalKey but never asserted it was called with the encrypted key or that sendSetpoint received the plaintext key. A refactor skipping decrypt would pass silently.
- **Fix A (applied)**: Added `vi.mocked(decryptLocalKey).mockReturnValue("plaintext-key")` in success test setup; added `expect(vi.mocked(decryptLocalKey)).toHaveBeenCalledWith("encrypted-key")` and `expect(sendSetpointMock).toHaveBeenCalledWith(expect.objectContaining({ localKey: "plaintext-key" }), expect.anything())`.
- **Decision**: FIXED via Fix A

### F3 — No null-guard for gateway.localKey before decryptLocalKey

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/server/api/routers/device.ts:62
- **Detail**: `decryptLocalKey(gateway.localKey ?? "")` would produce INTERNAL_SERVER_ERROR instead of BAD_REQUEST when localKey is null, masking a configuration issue as a server error.
- **Fix**: Added explicit guard `if (!gateway.localKey) throw new TRPCError({ code: "BAD_REQUEST", message: "GATEWAY_KEY_NOT_SET" })` before the decrypt try/catch; added test asserting BAD_REQUEST GATEWAY_KEY_NOT_SET.
- **Decision**: FIXED

### F4 — No console.warn when DP_CODE_MAP is empty outside TUYA_STUB mode

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/server/lib/tuya/dp-codes.ts
- **Detail**: Empty DP_CODE_MAP causes silent BAD_REQUEST "UNSUPPORTED_DEVICE" for all devices in production, with no startup signal to the operator.
- **Fix**: Added module-level `if (Object.keys(DP_CODE_MAP).length === 0 && process.env.TUYA_STUB !== "true") console.warn(...)`.
- **Decision**: FIXED

### F5 — afterEach(vi.resetAllMocks) at top-level of test file

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/server/api/routers/device.setpoint.test.ts (top-level afterEach)
- **Detail**: Top-level `afterEach(() => vi.resetAllMocks())` resets factory mock return values (including `decryptLocalKey`) after every test in all describe blocks, causing cross-block mock state bleed. F2's fix surfaced this as an active bug.
- **Fix**: Removed top-level afterEach; added scoped `afterEach(() => vi.resetAllMocks())` inside DP-validation, command-failure, and success describe blocks.
- **Decision**: FIXED

### F6 — Incorrect gap computation in scoreRoom suggestion string

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/server/lib/scoring.ts:43
- **Detail**: `gap = valveSetpointC - anomalyGapC - temperatureC` measured distance to the anomaly threshold line, not to the setpoint. E.g. at temp=15, setpoint=20, gap=3: suggestion said "2°C below setpoint" instead of "5°C below setpoint".
- **Fix**: Changed to `gap = Math.round((valveSetpointC - temperatureC) * 10) / 10`.
- **Decision**: FIXED

### F7 — TuyaGatewayClient.sendSetpoint localKey naming ambiguity

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/server/lib/tuya/types.ts
- **Detail**: `sendSetpoint` accepts `localKey: string | null` which is plaintext (post-decrypt), while DB column `gateways.localKey` holds ciphertext. Same field name, different semantics. Separation of concerns is clear in the code flow (device.ts decrypts before calling).
- **Decision**: ACCEPTED — semantics are clear from the code flow; rename would cascade across 3 files without meaningful safety gain.
