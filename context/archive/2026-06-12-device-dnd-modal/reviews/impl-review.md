<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Device DnD + Management Modal

- **Plan**: context/changes/device-dnd-modal/plan.md
- **Scope**: All 5 Phases
- **Date**: 2026-06-12
- **Verdict**: APPROVED (all findings resolved during triage)
- **Findings**: 0 critical · 0 warnings · 0 observations (all fixed or skipped)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Test mocks not updated for .orderBy() — 6 tests failing

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/server/api/routers/device.test.ts:50, 136
- **Detail**: device.overview query chains .orderBy() after two leftJoins. Test mocks terminated the chain at the second leftJoin with mockResolvedValue — returning a Promise directly instead of an object with .orderBy. All 6 device.overview tests failed.
- **Fix**: Updated all 4 mock sites to chain .orderBy returning a thenable + .where.
- **Decision**: FIXED

### F2 — sendSetpoint opens a duplicate TuyAPI connection

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/server/lib/tuya/real-client.ts:212–232
- **Detail**: sendSetpoint created a new TuyAPI instance per call, bypassing the persistent gatewayConnections pool. Could cause gateway to drop the poller connection.
- **Fix (A)**: Rewrote sendSetpoint to reuse the existing GatewayState from gatewayConnections. Throws if gateway not yet connected.
- **Decision**: FIXED via Fix A

### F3 — rename / reorder lack ownership scope check

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Security)
- **Location**: src/server/api/routers/device.ts:108–148
- **Detail**: Both procedures lacked siteId filtering — any auth'd user could mutate another user's devices by UUID.
- **Fix**: Added siteId to both inputs; added eq(devices.siteId, input.siteId) to WHERE clauses. Updated UI call sites.
- **Decision**: FIXED

### F4 — connect-timeout race leaves zombie TuyAPI instance alive

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/server/lib/tuya/real-client.ts:84–115
- **Detail**: After Promise.race timeout, the in-flight TuyAPI socket continued running with live event handlers, risking double reconnect triggers.
- **Fix**: Added state.tuyaGateway.disconnect().catch(() => {}) in catch block before scheduling reconnect. Also added clearTimeout guard.
- **Decision**: FIXED

### F5 — reconnectTimer overwritten without clearing the previous handle

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/server/lib/tuya/real-client.ts:76
- **Detail**: 'disconnected' event handler set reconnectTimer without clearing the previous value.
- **Fix**: Added if (state.reconnectTimer) clearTimeout(state.reconnectTimer); before both assignment sites.
- **Decision**: FIXED

### F6 — reorder array has no size cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/server/api/routers/device.ts:122–148
- **Detail**: Unbounded array input could trigger N sequential SQLite updates holding the writer indefinitely.
- **Fix**: Added .max(200) to the Zod array validator (bundled with F3 fix).
- **Decision**: FIXED

### F7 — deviceStateHint.setpointC mutation is a no-op

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/app/_components/device-modal.tsx:80, 97–98
- **Detail**: deviceStateHint was a plain object re-created each render; mutation on it was never read. Optimistic setpoint display didn't work.
- **Fix**: Replaced with useState(device.setpointC); updated onSuccess and JSX to use optimisticSetpoint.
- **Decision**: FIXED

### F8 — Cross-room drag fires two non-atomic mutations

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/app/_components/device-overview.tsx:224–233
- **Detail**: setDeviceRoom + reorder fired independently; partial success left inconsistent server state.
- **Fix**: Added device.move tRPC mutation combining room assignment + sort order in one DB transaction. Replaced two-mutation cross-room call with single moveMutation.
- **Decision**: FIXED

### F9 — Setpoint control is a numeric input, plan said slider

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/_components/device-modal.tsx:190–217
- **Detail**: Plan specified slider; implementation used <input type="number">.
- **Fix**: Swapped to <input type="range"> with live value label above.
- **Decision**: FIXED

### F10 — device-assignment-grid.tsx deleted without plan documentation

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/app/_components/setup/device-assignment-grid.tsx (unstaged)
- **Detail**: Unplanned deletion; no dangling imports; component superseded by SortableDeviceCard.
- **Decision**: SKIPPED
