# Plan Brief: Glassmorphic Command-Center Redesign

> Two-page summary. Full detail: `plan.md`.

## What & Why

Recreate the "Tuya Control Center" hi-fi design handoff as the new
look of the main dashboard (`src/app/page.tsx`), using the existing
React/tRPC/Drizzle stack, wired to real device data — not the
prototype's sample numbers.

## Scope

- **In**: full visual redesign of `/` (shell, KPI row, climate chart,
  side column, device grid, alert toast) + a new real
  `device.setPlugState` backend mutation.
- **Out**: `/setup` and `page-shell.tsx` (untouched), camera support,
  battery/power/energy/cost/valve-% (no real data source), light mode
  for the new chrome, new routes/pages, automated test suite.

## Key Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Missing data (battery/power/energy/cost) | Ship visual redesign on real data now, defer the rest | No real data source exists; fabricating numbers would be dishonest |
| D2 | Camera card | Omit entirely | No camera integration exists; app's `deviceType` is `sensor\|valve\|plug` only |
| D3 | Plug control | Build a real `device.setPlugState` mutation | Highest-value piece of new real interactivity the redesign unlocks |
| D4 | New color tokens | Scoped to the dashboard page only (`.command-center` block) | Protects `/setup` and the global `--s-*` token set from collateral changes |
| D5 | Light mode | Dark-only command center | Matches the design's single dark aesthetic; rest of app keeps theming |
| D6 | Nav rail | Build visually, wire only real routes (`/`, `/setup`) | App has exactly 2 routes; no dead links |
| D7 | Chart library | Recharts for line/area/donut, custom SVG only for gauges | Matches existing convention (`room-temperature-panel.tsx`, `device-overview.tsx` donut) |
| D8 | Automations on dashboard | Compact read+toggle widget | Real data via existing `automation.list`/`automation.toggle`; matches design's intent without a full management UI |
| D9 | Valve gauge | Drop the % ring, show target/current temp only | No valve-open-% data exists; temps are real |
| D10 | Alerts (KPI + toast) | Derive live from existing real signals only | `roomsTooHot`/`roomsTooCold` already computed from real `scoreRoom()`; no fabricated battery/device copy |
| D11 | 5th KPI slot (was "Power Draw") | Real-data metric instead — **Active Automations count** | Self-determined (not user-facing decision); genuinely new info not shown elsewhere |
| D12 | Build priority | Visual fidelity first, interactivity layered after | Phase 4 ships plug toggle visual-only; Phase 5 wires it |
| D13 | Testing | Manual verification only, per-phase gates | Visual redesign; no new automated coverage needed |

## Key Discovery (drives Phase 5 scope)

Smart plugs exist in production (`seed-production.ts`, productKey
`fgwhjm9j`, 6 devices) but have **zero** Tuya wiring: no DP code map
entry, no on/off decode in `real-client.ts`, no control mutation.
Phase 5 is a from-scratch backend build, including a live-device DP
discovery step (same empirical method used to find the valve's
setpoint DP).

## Phases

1. **Foundation** — fonts, scoped tokens, command-center shell (rail + header + clock)
2. **KPI row** — 5 real-data stat cards
3. **Climate + side column** — multi-series chart, relocated donut, automations widget
4. **Devices section** — restyled toolbar + card grid, plug toggle visual-only
5. **Plug control backend** — DP discovery → decode → mutation → wire Phase 4's toggle
6. **Alerts toast** — bottom-left toast derived from real room-alert signal

## Risks / Watch-outs

- Plug DP discovery (Phase 5.1) requires physical access to a real
  plug to toggle during live debug logging — cannot be done from code
  alone.
- Climate chart (Phase 3) renders a dynamic number of series (one per
  room with a sensor), not the design's fixed 3 — could get visually
  dense with many rooms; no cap is applied per D7's "match existing
  convention," but watch for this manually in Phase 3's gate.
