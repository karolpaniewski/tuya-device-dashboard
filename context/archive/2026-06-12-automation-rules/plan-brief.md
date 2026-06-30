# Automation Rules — Plan Brief

> Full plan: `context/changes/automation-rules/plan.md`

## What & Why

Implement time-based automation rules (S-11) so an admin can schedule a valve setpoint command for a specific time and days-of-week, optionally guarded by a room temperature condition. This is the first automation feature deferred from v1; S-01 (device overview) and S-04 (valve control) are both done, so all blockers are cleared.

## Starting Point

The codebase has a working valve setpoint path (`device.setpoint` tRPC → `sendSetpoint()` → Tuya LAN), an in-process polling loop in `src/instrumentation.ts`, and a disabled Automations tab in the Setup shell with placeholder text. No `automationRules` table, no scheduler library, and no `automation` tRPC router exist yet.

## Desired End State

An admin opens Setup → Automations, creates rules (valve device, days, fire time, target setpoint, optional "only if room < X °C"), and sees them listed with toggle and delete actions. Every minute, an in-process node-cron job fires matching rules — sending the valve command and writing a row to the execution log table (UI for that log is S-12). Conflicting rules (same room, same day, same minute) are rejected at creation time.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Trigger types | Time + day-of-week + optional temp condition | Covers the roadmap example and lets the system skip heating an already-warm room | Plan |
| Conflict resolution | Block at save time | Prevents ambiguous setpoints at the source rather than at runtime | Plan |
| Execution model | In-process node-cron (every minute) | No new infrastructure; same process as poller; fits self-hosted Node.js model | Plan |
| Rule target | Specific device (valve) | Precise control; maps 1:1 to the existing `device.setpoint` path | Plan |
| Conflict scope | Room-level (not device-level) | Two valves in the same room at the same minute create contradictory room states | Plan |
| Temperature condition | "Only fire if room avg < X °C", optional | Covers the key use case; simple single-field form entry | Plan |
| Offline valve | Log failure, skip silently | Avoids retry queue complexity; next matching tick retries naturally | Plan |
| Scheduler state | Stateless — reads DB every tick | No cache invalidation needed; changes take effect on the next minute | Plan |
| Execution log | Stub table only, no UI (S-12 owns UI) | Keeps S-11 scope tight; data is available when S-12 lands | Plan |
| Timezone | Server local time (`process.env.TZ`) | LAN-only server is in the same timezone as the building | Plan |
| Test coverage | Unit tests for tick logic, conflict detection, temp evaluation | Covers the three pure-logic units; no E2E for scheduler needed | Plan |

## Scope

**In scope:**
- `automationRules` and `automationExecutionLogs` DB tables + migration
- `src/server/lib/valve-control.ts` — shared `sendSetpointCommand()` extracted from `device.setpoint`
- `automation` tRPC router: `list`, `create` (with conflict check), `delete`, `toggle`
- `src/server/workers/automation-scheduler.ts` — node-cron worker wired into `src/instrumentation.ts`
- Frontend: enable automations tab, `AutomationManager` list, `AutomationForm` with all 6 fields
- Vitest unit tests: tick dispatch, conflict detection, temperature evaluation

**Out of scope:**
- Execution log UI (S-12)
- Retry on failed valve command
- Room-level targeting
- Multiple trigger types (above/not-at-setpoint temperature operators)
- Per-site timezone configuration
- OS-level cron or external job runner

## Architecture / Approach

A node-cron `* * * * *` job reads all enabled rules from DB each minute, checks day-of-week + hour:minute against server local time, optionally reads room average temperature from the in-process `deviceStateStore` (populated by the existing 30 s poller), and calls `sendSetpointCommand()` — the same extracted helper that `device.setpoint` uses. Each execution writes a log row (success / failed / skipped). The conflict check runs at rule-creation time in the tRPC mutation, requiring a two-hop join: device → room via `deviceRoomAssignments` → existing rules for all devices in that room.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema | Two new tables, migration applied | Drizzle constraint syntax on SQLite check constraints |
| 2. Valve-control helper | Shared `sendSetpointCommand()`; `device.setpoint` refactored | Must not break existing setpoint behavior |
| 3. tRPC router | `list`, `create` (with conflict check), `delete`, `toggle` | Conflict detection join correctness |
| 4. Scheduler worker | node-cron fires each minute; rules evaluate and execute; exec log written | node-cron lifecycle in Next.js instrumentation hook |
| 5. Frontend UI | Automations tab enabled; list + create form | CONFLICT error display; optional temp threshold UX |
| 6. Unit tests | Tick dispatch, conflict, temp-condition coverage | Mocking DB + deviceStateStore cleanly |

**Prerequisites:** S-01 (done), S-04 (done), `node-cron` npm package installed in Phase 4.
**Estimated effort:** ~3–4 after-hours sessions across 6 phases.

## Open Risks & Assumptions

- `node-cron` fires at OS minute boundaries. If the Next.js process starts mid-minute, the first tick may be delayed up to 59 s — acceptable for a heating scheduler.
- `deviceStateStore` is populated by the poller every 30 s. Temperature readings used for condition evaluation may be up to 30 s stale — acceptable.
- If a device is deleted while it has active automation rules, the FK cascade (`onDelete: "cascade"`) deletes the rules automatically. No orphan-rule handling needed.
- The conflict check covers only *enabled* rules. Disabled rules do not block new rule creation at the same slot — if a disabled rule is later re-enabled, a conflict could silently exist. Mitigation: the toggle mutation should re-run the conflict check before enabling; this is noted as a follow-up but not required for S-11.

## Success Criteria (Summary)

- Admin can create, list, toggle, and delete automation rules from the Setup → Automations tab without error.
- A rule fires at the correct server local time and day-of-week, sending the setpoint to the valve and producing a `success` execution log row.
- A rule with a temperature threshold is skipped (with a `skipped` log row) when the room is already warm enough.
