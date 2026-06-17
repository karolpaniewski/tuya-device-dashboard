# Observability Infrastructure Implementation Plan

## Overview

Replace the ~20 raw `console.*` calls in production runtime code (tRPC middleware/route handler, the Tuya poller worker, the automation scheduler worker, and the Tuya real-client) with structured Pino logging. Every log line in a request or worker context automatically carries `requestId`/`userId` or `gatewayId`/`deviceId`/`ruleId` via an `AsyncLocalStorage`-backed context, without threading a context parameter through every function call. `localKey` and `passwordHash` are redacted at the logger level (defense-in-depth, not by convention). When `LOG_DIR` is configured (the self-hosted LAN deployment only — not Vercel dev, not CI), logs additionally append to a date-rotated file with capped retention.

## Current State Analysis

- No logging library exists; all 34 `console.log`/`error`/`warn` calls in the repo are unstructured strings to stdout/stderr.
- No request/correlation-id concept exists anywhere.
- `ctx.session.user.id` is already available in tRPC context (`src/server/api/trpc.ts:28-35`, `src/server/auth.ts:10-35`) but isn't attached to any log line today.
- `gateways.localKey` / `devices.localKey` (`src/server/db/schema.ts:57,110`) and `users.passwordHash` (`src/server/db/schema.ts:33`) are the two sensitive fields in the schema. No call site logs these values today, but nothing prevents a future call site from doing so by accident — this is the gap `lessons.md`'s "localKey columns store AES-256-GCM ciphertext" rule exists to close once a logger that can deep-serialize objects is introduced.
- Three runtime environments exist for this app and they have different filesystem characteristics: Vercel (dev convenience, serverless/ephemeral fs), GitHub Actions CI (ephemeral `ubuntu-latest` runners), and the self-hosted Node.js LAN server (production, persistent disk, started via `next start` per `tech-stack.md`). File-based logging only makes sense on the third.
- `automationExecutionLogs` (`src/server/db/schema.ts:250-278`) is existing prior art for a queryable log, but it's a DB table for one specific domain event (rule firings) — not a general-purpose application log, and out of scope for this slice.

### Key Discoveries:

- Pino's built-in file-rotation transports (`pino/file`, `pino-roll`, `pino.transport()`) spawn a `node:worker_threads` worker resolved from a runtime-computed path. Both Webpack and Turbopack static-analyze imports, so this path isn't reliably preserved through `next build`/`next start`, risking `ENOENT` failures in production. **Decision:** the base Pino instance never uses `transport()`; it writes synchronously to `process.stdout` only. File output and rotation are implemented as a separate, plain `fs`-based destination this plan owns directly (no worker thread), avoiding the bundling risk entirely.
- `AsyncLocalStorage` is safe to use in `src/app/api/trpc/[trpc]/route.ts` — that route has no `export const runtime = "edge"`, so it runs on the Node.js runtime where `node:async_hooks` is fully supported, and Next.js itself relies on the same primitive internally for `headers()`/`cookies()`.
- Event-driven callbacks inside `src/server/lib/tuya/real-client.ts` (`onData`, `heartbeat`, `error`, `disconnected` handlers registered in `buildConnection`, real-client.ts:46-80) fire asynchronously from TuyAPI's own socket listener — **outside** the call stack that invoked `ensureConnected`/`pollOnce`. An `AsyncLocalStorage` scope entered during the poll tick will NOT be active when these callbacks later fire. `gatewayId` context for these specific call sites must come from a child logger captured in the `GatewayState` closure at `buildConnection` time, not from ALS.
- Test conventions: Vitest, `environment: "node"`, co-located `*.test.ts` next to source, `vi.mock()` for DB/auth dependencies, `src/test/setup.ts` sets required env vars globally (`vitest.config.ts:7-17`).

## Desired End State

Running `npm run dev` and hitting any tRPC route prints one structured JSON line per request to the console, tagged with a generated `requestId` and (if logged in) `userId`. Running the app with `LOG_DIR=/some/writable/path` additionally appends the same lines to a file named for the current date in that directory, and files older than the configured retention window are removed automatically. Triggering a poll cycle or an automation tick logs gateway/device/rule context on every line without any call site manually passing those ids. Logging an object that happens to contain `localKey` or `passwordHash` never produces the actual secret value in the output, verified by an automated test. `npm run ci` (biome + tsc + vitest + next build) stays green.

### Key Discoveries:

- See "Current State Analysis" above — discoveries are listed there per the codebase research performed during planning.

## What We're NOT Doing

- Not replacing `console.*` calls in `scripts/*.ts`, `src/server/db/seed.ts`, or `src/server/db/seed-production.ts` — these are short-lived, human-run scripts outside the Next.js process; they stay on plain `console.log`.
- Not building a log viewer UI or shipping logs to an external service (Sentry/Datadog/etc.) — out of scope per the roadmap's LAN-only, zero-outbound-calls NFR.
- Not changing the `automationExecutionLogs` DB table or its `logExecution()` helper — that's a separate, already-shipped domain-specific log or this slice.
- Not using any Pino transport/worker-thread mechanism (`pino/file`, `pino-roll`, `pino.transport()`) — see Key Discoveries above.
- Not adding distributed tracing, metrics, or alerting — purely structured logging + file persistence, per the roadmap's stated NFR scope.

## Implementation Approach

One new logger module (`src/server/lib/logger.ts`) wraps a single Pino instance configured with global `redact` paths and a level read from `LOG_LEVEL`. A second module (`src/server/lib/log-context.ts`) owns one `AsyncLocalStorage` instance and exposes `runWithRequestContext`/`runWithWorkerContext` entry points plus a `getLogger()` accessor that returns a Pino child logger bound to whatever context is active. The tRPC route handler and `createTRPCContext` open a request-scoped context per HTTP request; the poller and scheduler workers open a context per gateway-poll / per-rule-evaluation inside their existing loops. The Tuya real-client's async event callbacks get their own bound child logger captured at connection-build time, since they execute outside any ALS scope. All ~20 production `console.*` call sites are then replaced with calls through `getLogger()`, reclassified by severity (routine per-poll chatter → `debug`, lifecycle/errors → `info`/`warn`/`error`) so a file-backed log doesn't fill up with noise on a long-running server.

## Critical Implementation Details

### Timing & lifecycle

`real-client.ts`'s TuyAPI event handlers (`onData`, `heartbeat`, `error`, `disconnected`) run outside the call stack that triggered the connection, so they cannot read an `AsyncLocalStorage`-scoped context. `buildConnection` must create `logger.child({ gatewayId: gateway.tuyaGatewayId })` once and store it on `GatewayState`, then have each event handler use that stored child logger instead of calling `getLogger()`.

### Build/bundling constraint

The base Pino instance must be constructed with no `transport` option anywhere (`pino(options)`, never `pino(options, pino.transport(...))`) to avoid the worker-thread resolution failure described in Key Discoveries. File output is a hand-written `fs`-based destination, not a Pino transport.

## Phase 1: Logger foundation

### Overview

Add the Pino dependency and build the logger + context + file-rotation primitives in isolation, with unit tests, before touching any call site.

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: Add `pino` as a runtime dependency.

**Contract**: `pino` added to `dependencies` (not `devDependencies` — it runs in production). No `pino-pretty`, `pino-roll`, or other transport packages are added, per the build/bundling constraint above.

#### 2. Base logger

**File**: `src/server/lib/logger.ts` (new)

**Intent**: Construct one shared Pino instance with redaction and level configured, plus the optional rotated file destination.

**Contract**: Exports a default `logger` (Pino root logger). Configuration:
- `level`: from `env.LOG_LEVEL` (new optional env var, default `"info"`).
- `redact`: `{ paths: ["*.localKey", "*.gateway.localKey", "*.passwordHash", "*.user.passwordHash"], censor: "[REDACTED]" }` — matches the field names confirmed in `src/server/db/schema.ts:33,57,110`.
- Destination: always writes to `process.stdout` (Pino's default, no `transport`). When `env.LOG_DIR` is set, additionally write to a same-process `fs`-based file destination (see #3) via `pino.multistream([{ stream: process.stdout }, { stream: fileDestination }])` — `fileDestination` is a plain object satisfying Pino's `{ write(chunk) }` stream contract, not a Pino transport.

#### 3. File rotation + retention destination

**File**: `src/server/lib/log-file-destination.ts` (new)

**Intent**: A plain Node stream-like object that appends to a date-named file under `LOG_DIR`, rotates when the date changes, and deletes files older than the retention window — implemented with `fs`/`fs.promises` directly, with no worker thread.

**Contract**: Exports a factory `createLogFileDestination(dir: string, retentionDays: number): { write(chunk: string): void }`. On construction, opens (or creates) ``${dir}/app-${YYYY-MM-DD}.log`` for appending. On each `write()`, compares the current date to the date the open file was created for; if it changed, closes the old file descriptor, opens a new one for the new date, and runs a cleanup pass that deletes any `app-*.log` file in `dir` older than `retentionDays`. Synchronous `fs` calls are acceptable here since writes are infrequent relative to the 30s poll cadence and this avoids partial-write ordering issues.

#### 4. Request/worker context

**File**: `src/server/lib/log-context.ts` (new)

**Intent**: One `AsyncLocalStorage<LogContextStore>` instance plus entry points that let request and worker code open a scope without threading a context object through every function signature.

**Contract**: Exports:
- `runWithRequestContext<T>(fn: () => Promise<T>): Promise<T>` — generates `requestId` via `crypto.randomUUID()`, creates a mutable store `{ requestId, userId: undefined }`, runs `fn` inside `als.run(store, fn)`.
- `setRequestUserId(userId: string | undefined): void` — mutates `userId` on the currently-active store (called once `auth()` resolves inside `createTRPCContext`).
- `runWithWorkerContext<T>(context: Record<string, string>, fn: () => Promise<T>): Promise<T>` — same ALS instance, store is whatever worker-supplied fields are passed (e.g. `{ gatewayId }`, `{ ruleId }`).
- `getLogger(): pino.Logger` — returns `logger.child(als.getStore() ?? {})`, i.e. the base logger from `logger.ts` bound to whatever context (if any) is active. Returns the unbound base logger when called outside any scope (e.g. module-load-time code).

#### 5. Unit tests

**File**: `src/server/lib/logger.test.ts` (new)

**Intent**: Lock in the two security/correctness invariants that must never regress: redaction and context propagation.

**Contract**: Tests assert (a) logging an object containing a `localKey` or `passwordHash` value never produces that literal string in the serialized output (capture via a custom Pino destination collecting written chunks in-memory), (b) a logger obtained via `getLogger()` inside `runWithRequestContext` includes the generated `requestId` in its output, and a nested `runWithWorkerContext` call correctly layers/overrides fields, and (c) a message logged at `debug` is absent from output when `level` is `"info"` and present when `level` is `"debug"`.

#### 6. Test-run noise

**File**: `src/test/setup.ts`

**Intent**: Keep `vitest run` output clean — without this, every router test that exercises a logged code path prints structured JSON to the test runner's stdout.

**Contract**: Add `process.env.LOG_LEVEL = "silent";` alongside the existing env var assignments.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck` (or the equivalent step in `npm run ci`)
- Lint passes: `npx biome check .`
- New unit tests pass: `npx vitest run src/server/lib/logger.test.ts`
- Full suite passes: `npm run ci`

#### Manual Verification:

- `LOG_DIR=/tmp/obs-test npm run dev`, hit any page once, then `cat /tmp/obs-test/app-<today>.log` and confirm a structured JSON line is present and matches what printed to the console
- Manually create a stale dated file in `/tmp/obs-test` (touch with an old name) and confirm the next write after a date rollover removes files older than the configured retention — verified by temporarily lowering `retentionDays` in a scratch script, not by waiting days in real time

---

## Phase 2: Wire context into tRPC and workers

### Overview

Replace the ~20 production `console.*` call sites with calls through `getLogger()`, open request/worker context scopes at the right entry points, and reclassify log severity per the noise policy.

### Changes Required:

#### 1. tRPC request context + timing middleware

**File**: `src/app/api/trpc/[trpc]/route.ts`

**Intent**: Open a request-scoped log context around the whole tRPC request lifecycle.

**Contract**: `handler` wraps its existing body in `runWithRequestContext(() => fetchRequestHandler({...}))`. The dev-only `onError` callback (currently `console.error` at line 27) becomes `getLogger().error({ path, err: error }, "tRPC request failed")`, and the dev-only guard is removed since the redacting structured logger is now safe to run in all environments (errors should surface in production too — that's the point of this slice).

**File**: `src/server/api/trpc.ts`

**Intent**: Attach the resolved `userId` to the active request context, and replace the timing middleware's raw log.

**Contract**: `createTRPCContext` calls `setRequestUserId(session?.user?.id)` after resolving `session`. `timingMiddleware` (trpc.ts:85-100) replaces `console.log` at line 97 with `getLogger().info({ path, durationMs: end - start }, "trpc.request")`.

#### 2. Tuya poller worker

**File**: `src/server/workers/tuya-poller.ts`

**Intent**: Tag every log line in `pollOnce()` with the relevant `gatewayId`, and reclassify severity.

**Contract**: The per-gateway loop body (lines 28-72) runs inside `runWithWorkerContext({ gatewayId: gateway.tuyaGatewayId }, async () => { ... })`. All 4 `console.error` calls (lines 22, 67, 78, 90 — DB fetch error, gateway poll error, temperature-history write error, purge error) become `getLogger().error({ err }, "<same message minus the bracketed prefix>")`. The summary line (line 94, `console.log`) becomes `getLogger().info({ gatewayCount: allGateways.length }, "tuya-poller.poll-complete")`.

#### 3. Automation scheduler worker

**File**: `src/server/workers/automation-scheduler.ts`

**Intent**: Tag every log line in `runAutomationTick()` with `ruleId` where applicable, and demote the tick-start line.

**Contract**: The tick-start line (line 67, `console.log("[automation-scheduler] tick")`) becomes `getLogger().debug("automation-scheduler.tick-start")` — every-minute chatter doesn't belong at `info`. The per-rule loop body (lines 81-105) runs inside `runWithWorkerContext({ ruleId: rule.id }, async () => { ... })`. The tick-summary line (line 107, `console.log`) becomes `getLogger().info({ rulesEvaluated: rules.length, firedCount }, "automation-scheduler.tick-complete")`.

#### 4. Tuya real-client

**File**: `src/server/lib/tuya/real-client.ts`

**Intent**: Reclassify the ~10 call sites by actual severity and bind a per-gateway child logger for the event-callback closures (per the Timing & lifecycle note above).

**Contract**: `buildConnection` (lines 22-83) creates `const gatewayLogger = getLogger().child({ gatewayId: gateway.tuyaGatewayId });` once, stored implicitly via closure (not on `GatewayState`, since it's only used by the handlers defined in the same closure). Reclassification:
- `onData`'s state-update line (line 56-59) → `gatewayLogger.debug({ cid: key, dps: d.dps }, "tuya.state-update")`
- `heartbeat` handler (line 65-66) → `gatewayLogger.debug("tuya.heartbeat")`
- `error` event handler (line 68-69) → `gatewayLogger.warn({ err }, "tuya.gateway-error-event")`
- `disconnected` handler (line 71-74) → `gatewayLogger.warn("tuya.disconnected-reconnecting")`
- `connectState`'s connected line (line 100-102) → `gatewayLogger.info("tuya.connected")`
- `connectState`'s connect-failed catch (line 107-110) → `gatewayLogger.error({ err }, "tuya.connect-failed")`
- `refreshSubDevices`'s start line (line 130-132) → `gatewayLogger.debug({ nodeCount: nodeIds.length }, "tuya.refresh-start")`
- `refreshSubDevices`'s per-device failure (line 137-140) → `gatewayLogger.warn({ err, nodeId }, "tuya.refresh-failed")`
- `fetchGatewayDevices`'s missing-key guard (line 171-173) → `gatewayLogger.warn("tuya.missing-connection-info")` (note: this branch logs before `gatewayLogger` would normally be in scope since it's outside `buildConnection` — call `getLogger().child({ gatewayId: gateway.tuyaGatewayId })` inline here instead)
- `fetchGatewayDevices`'s summary line (line 214-216) → `gatewayLogger.debug({ knownCount: readings.length, pollableCount: pollable.length }, "tuya.poll-summary")` (reclassified to debug — this fires every 30s per gateway)

#### 5. Tuya DP codes warning

**File**: `src/server/lib/tuya/dp-codes.ts`

**Intent**: Replace the single startup warning.

**Contract**: Line 11's `console.warn` becomes `getLogger().warn(...)` with the same message.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Lint passes: `npx biome check .`
- Existing worker/router tests still pass unmodified: `npx vitest run src/server/workers src/server/api`
- Full suite passes: `npm run ci`

#### Manual Verification:

- Start the app, log in, navigate the dashboard; confirm each tRPC call produces one structured console line with a `requestId` and the logged-in `userId`
- Let one poll cycle run; confirm a `tuya-poller.poll-complete` line appears at `info` and no per-device heartbeat/state-update noise appears at the default `info` level
- Set `LOG_LEVEL=debug`, restart, confirm heartbeat/state-update/poll-summary lines now appear
- Temporarily break a gateway connection (e.g. wrong IP in dev/stub mode) and confirm a `tuya.connect-failed` line appears at `error` with `gatewayId` attached

---

## Phase 3: Env wiring and end-to-end verification

### Overview

Declare the new environment variables through the existing `t3-env` schema, document them, and do a final full-system pass.

### Changes Required:

#### 1. Env schema

**File**: `src/env.js`

**Intent**: Make `LOG_LEVEL`, `LOG_DIR`, `LOG_RETENTION_DAYS` validated, optional server env vars, following the existing pattern for `TUYA_STUB`.

**Contract**: Add to `server`: `LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info")`, `LOG_DIR: z.string().optional()`, `LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(14)`. Add the matching three entries to `runtimeEnv`.

#### 2. Env example

**File**: `.env.example`

**Intent**: Document the new optional vars for anyone setting up the self-hosted deployment.

**Contract**: Append a commented `# Observability` section with `LOG_LEVEL`, `LOG_DIR`, `LOG_RETENTION_DAYS` and one-line comments noting they're optional and `LOG_DIR` only applies to the persistent self-hosted deployment.

### Success Criteria:

#### Automated Verification:

- `npm run ci` passes end to end (lint + typecheck + full vitest suite + `next build`)
- `next build` succeeds with no warnings about unresolved `pino` worker/transport files (confirms the build/bundling constraint held)

#### Manual Verification:

- Fresh clone simulation: copy `.env.example` to `.env`, fill in required vars, leave the three new ones unset, confirm the app boots and logs to console only (no crash from a missing `LOG_DIR`)
- Set `LOG_DIR` to a writable path and `LOG_RETENTION_DAYS=1`, run for long enough to cross a simulated date boundary (or temporarily fake the date check in a scratch test), confirm an old log file gets deleted

---

## Testing Strategy

### Unit Tests:

- Redaction never leaks `localKey`/`passwordHash` regardless of nesting depth in the logged object
- `getLogger()` inside `runWithRequestContext`/`runWithWorkerContext` produces lines carrying the expected context fields
- Level filtering: `debug` suppressed at default `info` level, visible at `debug`

### Integration Tests:

- None added — this slice is infrastructure with no new user-facing behavior; existing router/worker tests continue to pass unmodified and incidentally exercise the new logging code paths.

### Manual Testing Steps:

1. `npm run dev`, log in, browse the dashboard — confirm structured console output with `requestId`/`userId`.
2. Let a poll cycle and an automation tick run — confirm `gatewayId`/`ruleId` context appears, and routine chatter stays at `debug`.
3. Set `LOG_DIR` to a scratch directory — confirm a dated file appears and matches console output.
4. Force a gateway connect failure — confirm an `error`-level line with full context.
5. Run `npm run ci` — confirm green.

## Performance Considerations

Synchronous `fs` writes in the file destination are acceptable given the existing 30-second poll cadence and per-minute scheduler tick — log volume is low (tens of lines per cycle, not thousands). The date-comparison check on every write is a single `Date` allocation and string comparison, negligible relative to the network I/O already happening in the same call paths.

## Migration Notes

No data migration. `LOG_DIR`/`LOG_LEVEL`/`LOG_RETENTION_DAYS` are new optional env vars with safe defaults (console-only, `info` level) — existing deployments that don't set them keep working unchanged after deploying this change.

## References

- Roadmap: `context/foundation/roadmap.md` — S-07 (observability)
- Prior art for infra-only slices with no PRD FR trace: `context/changes/cicd-pipeline/plan.md` (S-06)
- Sensitive field locations: `src/server/db/schema.ts:33,57,110`
- Existing queryable-log precedent (different domain, not reused here): `src/server/db/schema.ts:250-278` (`automationExecutionLogs`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logger foundation

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 63a9719
- [x] 1.2 Lint passes: `npx biome check .` — 63a9719
- [x] 1.3 New unit tests pass: `npx vitest run src/server/lib/logger.test.ts` — 63a9719
- [x] 1.4 Full suite passes: `npm run ci` — 63a9719

#### Manual

- [x] 1.5 `LOG_DIR` writes a dated file matching console output — 63a9719
- [x] 1.6 Stale dated files beyond retention are removed on rotation — 63a9719

### Phase 2: Wire context into tRPC and workers

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck`
- [x] 2.2 Lint passes: `npx biome check .`
- [x] 2.3 Existing worker/router tests still pass: `npx vitest run src/server/workers src/server/api`
- [x] 2.4 Full suite passes: `npm run ci`

#### Manual

- [x] 2.5 tRPC calls produce structured lines with requestId/userId
- [x] 2.6 Poll cycle logs gatewayId context; routine chatter stays at debug
- [x] 2.7 LOG_LEVEL=debug reveals heartbeat/state-update/poll-summary lines
- [x] 2.8 Forced connect failure logs at error with gatewayId

### Phase 3: Env wiring and end-to-end verification

#### Automated

- [ ] 3.1 `npm run ci` passes end to end
- [ ] 3.2 `next build` succeeds with no pino transport/worker resolution warnings

#### Manual

- [ ] 3.3 Fresh-clone simulation boots with new vars unset
- [ ] 3.4 LOG_DIR + low retention demonstrates old file cleanup
