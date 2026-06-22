---
change_id: dashboard-command-center-redesign
title: Glassmorphic command-center redesign of the Tuya dashboard
status: archived
created: 2026-06-19
updated: 2026-06-22
roadmap_id: null
archived_at: 2026-06-22T07:53:08Z
---

## Notes

Hi-fi redesign of the main dashboard (`src/app/page.tsx`) to match the
"Tuya Control Center" glassmorphic design handoff
(`Claude Design/design_handoff_tuya_dashboard/`), recreated with the
existing React/tRPC/Drizzle stack and wired to real Tuya device data —
no fabricated sample values.

Routed through `/10x-plan` directly (no `/10x-frame` — this is a known,
user-specified redesign target, not a misframed problem). 13 scoping
decisions made across 4 question rounds; see `plan-brief.md` for the
full decision table.

Scope is dashboard-page-only: `src/components/page-shell.tsx` (shared
with `/setup`) and the global `--s-*` token set are NOT touched. New
visual tokens live under a `.command-center`-scoped block; new fonts
are added app-wide via `next/font` but only consumed by the new
dashboard components.

Planned 2026-06-19 — 6 phases (Foundation / KPI row / Climate + side
column / Devices section / Plug control backend / Alerts toast). Key
discovery during planning: smart plugs exist in production
(`seed-production.ts`, productKey `fgwhjm9j`) but have **zero** Tuya
DP wiring today — no on/off decode, no DP code map entry, no control
mutation. Phase 5 builds this from scratch, including an explicit
live-device DP-discovery step (mirroring how the valve's setpoint DP
was originally confirmed).

See `plan.md` / `plan-brief.md`.

All 6 phases complete (closing SHA f421f79). Post-implementation fix
(c7cfbd6) addressed the left nav rail scrolling with content instead of
staying pinned.
