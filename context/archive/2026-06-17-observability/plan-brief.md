# Observability Infrastructure — Plan Brief

> Full plan: `context/changes/observability/plan.md`

## What & Why

Replace ~20 raw `console.*` calls across tRPC middleware, the Tuya poller worker, the automation scheduler worker, and the Tuya real-client with structured Pino logging. Every log line in a request or worker context automatically carries correlation fields (`requestId`/`userId`, `gatewayId`/`ruleId`) without threading a context object through every function call, and `localKey`/`passwordHash` are redacted at the logger level — defense-in-depth on top of the existing AES-256-GCM encryption rule in `lessons.md`.

## Starting Point

No logging library exists today; everything goes to stdout/stderr as unstructured strings, with no request/correlation-id concept anywhere. The two sensitive fields are `gateways.localKey` / `devices.localKey` and `users.passwordHash` (`src/server/db/schema.ts:33,57,110`). Three runtime environments exist (Vercel dev, ephemeral GH Actions CI, persistent self-hosted LAN production) — file-based logging only matters on the third.

## Desired End State

`npm run dev` prints one structured JSON line per tRPC request, tagged with `requestId`/`userId`. Worker ticks tag lines with `gatewayId`/`ruleId`. Setting `LOG_DIR` additionally appends the same lines to a date-rotated file with capped retention. Logging any object containing `localKey`/`passwordHash` never leaks the value — locked in by a unit test. `npm run ci` stays green.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Logging library | Pino | Fast, structured, widely-adopted, supports `redact` and child loggers natively | User (recommended) |
| Output destination | stdout always; file only when `LOG_DIR` set | File logging only meaningful on the persistent self-hosted server, not Vercel/CI | User (recommended) |
| Secret redaction | Pino global `redact` paths, not per-call-site convention | Defense-in-depth — a future call site can't accidentally leak `localKey`/`passwordHash` | User (recommended) |
| Context propagation | `AsyncLocalStorage` + child loggers | Avoids threading a context param through every function call | User (recommended) |
| Scope | Production runtime code only (tRPC, workers, real-client) | Scripts/seeds are short-lived and human-run, outside the Next.js process | User (recommended) |
| Log-level policy | Routine per-poll/per-tick chatter → `debug`; default level `info` in production | Keeps a file-backed log from filling with noise on a long-running server | User (recommended) |
| Rotation mechanism | Hand-written `fs`-based destination, NOT a Pino transport | Pino's worker-thread transports (`pino/file`, `pino-roll`, `pino.transport()`) risk `ENOENT` under Next.js/Turbopack bundling — same rotation/retention outcome without the fragility | Plan (technical pivot, disclosed to user) |
| Verification | Unit-test redaction + context/level logic; manually verify file output end-to-end | Redaction is a security invariant worth locking in code; file I/O is easiest to eyeball | User (recommended) |

## Scope

**In scope:** `src/server/lib/logger.ts`, `src/server/lib/log-context.ts`, `src/server/lib/log-file-destination.ts` (all new), wiring into `src/server/api/trpc.ts`, `src/app/api/trpc/[trpc]/route.ts`, `src/server/workers/tuya-poller.ts`, `src/server/workers/automation-scheduler.ts`, `src/server/lib/tuya/real-client.ts`, `src/server/lib/tuya/dp-codes.ts`, new `LOG_LEVEL`/`LOG_DIR`/`LOG_RETENTION_DAYS` env vars.

**Out of scope:** `console.*` in `scripts/*.ts` and DB seed files, a log viewer UI, shipping logs to an external service (Sentry/Datadog/etc.), changes to the existing `automationExecutionLogs` DB table, distributed tracing/metrics/alerting.

## Architecture / Approach

One shared Pino instance (`logger.ts`) with global `redact` paths and `LOG_LEVEL`-driven level, writing to stdout always and, when `LOG_DIR` is set, also to a plain-`fs` date-rotated destination (`log-file-destination.ts`) with no worker thread. One `AsyncLocalStorage` instance (`log-context.ts`) lets request code (`runWithRequestContext`) and worker code (`runWithWorkerContext`) open a scope; `getLogger()` returns a child logger bound to whatever context is active. The one exception: TuyAPI's async event callbacks in `real-client.ts` fire outside any ALS scope, so those call sites use a child logger captured in closure at connection-build time instead.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Logger foundation | `logger.ts`, `log-context.ts`, `log-file-destination.ts` + unit tests for redaction/context/level | Getting the multistream wiring (stdout + optional file) and ALS context layering right before any call site depends on it |
| 2. Wire into tRPC and workers | All ~20 `console.*` call sites replaced, severity reclassified, context attached | `real-client.ts`'s event-callback closures need a bound child logger, not ALS — easy to miss and silently lose `gatewayId` context |
| 3. Env wiring + verification | `LOG_LEVEL`/`LOG_DIR`/`LOG_RETENTION_DAYS` added to `src/env.js` + `.env.example`, full manual pass | Confirming `next build` doesn't choke on any residual transport/worker-thread resolution |

**Prerequisites:** none — this is infrastructure with no PRD/FR trace, tied to roadmap slice S-07.

## Open Risks & Assumptions

- Pino's worker-thread transports are deliberately avoided everywhere in this plan; if a future contributor adds `pino.transport()` for convenience, the bundling fragility this plan routed around comes back.
- `real-client.ts` event callbacks (`onData`, `heartbeat`, `error`, `disconnected`) must use the closure-captured child logger, not `getLogger()` — using the latter there would silently drop `gatewayId` context since those callbacks run outside any ALS scope.
- Retention/rotation cleanup logic is exercised manually (date-boundary simulation), not via real multi-day waiting — acceptable per the user's chosen verification split (automated for redaction/context, manual for file I/O).

## Success Criteria (Summary)

- `npm run ci` (lint + typecheck + tests + `next build`) stays green through all three phases
- A redaction unit test proves `localKey`/`passwordHash` never appear in logger output regardless of nesting
- Live tRPC requests and worker ticks show structured lines with correct `requestId`/`userId`/`gatewayId`/`ruleId` context
- `LOG_DIR` produces a dated file matching console output; files older than `LOG_RETENTION_DAYS` are removed on rotation
