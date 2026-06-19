# Plan: Glassmorphic Command-Center Redesign of the Tuya Dashboard

## Overview

Recreate the "Tuya Control Center" hi-fi design handoff
(`Claude Design/design_handoff_tuya_dashboard/README.md` +
`Tuya Control Center.dc.html`) as the new look of `src/app/page.tsx`,
using the app's existing React/tRPC/Drizzle stack and component
library. Every displayed value is wired to real Tuya device data —
the design prototype's sample numbers (trends, battery %, power/kWh,
camera feeds) are not recreated where no real data source exists.

## Current State Analysis

The dashboard today (`src/app/page.tsx:1-31` → `src/components/page-shell.tsx:20-63`
→ `src/app/_components/device-overview.tsx`) is a flat dark/light
themeable UI: a shared header bar with site selector + theme toggle,
a 2-5 widget KPI/donut row (drag-reorderable), a collapsible
per-room temperature panel, a room sidebar + filter toolbar, and a
device card grid — all already wired to real data via
`device.overview` (`src/server/api/routers/device.ts:240-346`).

The design handoff replaces this chrome with a full-viewport two-column
app shell (74px icon rail + main column), a 5-card KPI row, a combined
climate-chart + side-column section, and a restyled device grid — on a
deep-black "glass" aesthetic with cyan/emerald/violet/amber/rose
accents, Space Grotesk + JetBrains Mono typography.

## Key Discoveries

- **`page-shell.tsx` is shared** with `/setup` (`src/app/setup/page.tsx`,
  `src/app/page.tsx`) — the redesign must not touch it. A new
  dashboard-only shell component replaces it on `/` only.
- **Existing FilterBar already implements the spec's toolbar behavior.**
  `src/app/_components/filter-bar.tsx:32-43,91-117` already filters by
  type (All/Sensor/Valve/Plug) and status (All/Online/Offline) and is
  fully wired — Phase 4 restyles it, it does not rewire it.
- **The devices-by-room donut already exists and is real data.**
  `device-overview.tsx:455-458` (`roomDeviceCounts`) +
  `device-overview.tsx:518-568` (Recharts `PieChart`) — Phase 3 moves
  and restyles this exact logic into the new side column rather than
  rebuilding it.
- **`avgTempC` and room min/max thresholds are real and reusable for
  the KPI range bar.** `device-overview.tsx:430-444` computes
  `avgTempC`; `DEFAULT_THRESHOLDS` (`maxTempC: 24, minTempC: 18` in
  `src/server/lib/scoring.ts`) gives the range bar's real 18–24° bounds
  — no fabrication needed for that one ornamental element.
- **Alerts are already computed from real room scoring.**
  `device-overview.tsx:426-429` (`roomsTooHot`, `roomsTooCold`) derive
  from `scoreRoom()` badges — the KPI alert card and the bottom-left
  toast (Phase 6) both read from this, not from invented
  battery/offline copy.
- **No battery, power, energy, cost, or valve-open-% data exists
  anywhere in the schema or Tuya integration.** Confirmed via
  `src/server/db/schema.ts`, `device-state-store.ts`,
  `tuya-poller.ts`, `real-client.ts` — these design elements are
  dropped (Decisions D1, D9 in `plan-brief.md`).
- **Smart plugs exist in production with zero Tuya wiring.**
  `src/server/db/seed-production.ts:132-174` seeds 6 real plug devices
  (productKey `fgwhjm9j`), but `src/server/lib/tuya/dp-codes.ts`
  contains only the valve's setpoint DP (`ogx8u5z6: 4`), and
  `real-client.ts:188-207`'s reading-decode loop has no plug branch at
  all (plug readings always resolve `temperatureC`/`setpointC` to
  `null` and never read an on/off state). Phase 5 builds plug DP
  discovery + decode + write path from scratch.
- **Existing write-mutation pattern to mirror exactly**:
  `src/server/lib/valve-control.ts` (DB lookup → DP_CODE_MAP guard →
  gateway lookup → key decrypt → `client.sendSetpoint`) and
  `src/server/api/routers/device.ts:22-71` (`setpoint` mutation's
  try/catch + error-message-string `switch` → `TRPCError` mapping).
  Phase 5's plug mutation follows both verbatim.
- **Chart conventions to reuse, not invent**: `var(--color-chart-1..5)`
  series colors, `var(--s-grid-line)` dashed `CartesianGrid`, the
  `Tooltip` `contentStyle` block keyed off `var(--popover)` /
  `var(--border)` / `var(--popover-foreground)` — see
  `room-temperature-panel.tsx:70-104`.
- **One root font today**: `Geist` via `next/font/google` in
  `src/app/layout.tsx:4,17-20`, registered as `--font-geist-sans` and
  consumed through Tailwind's `--font-sans` in `globals.css:8-10`. No
  mono/display font exists yet.
- **The app deliberately avoids Tailwind's `dark:` variant** for its
  `--s-*` tokens (`globals.css:92` comment, Turbopack-safety reason) —
  new dashboard tokens should follow the same CSS-custom-property
  pattern, not `dark:`-prefixed classes.
- **`@dnd-kit` drag-and-drop must survive the redesign.** Two
  independent `DndContext`s in `device-overview.tsx` (widget reorder:
  `~668-699`; room/device reorder: `~825-918`) persist via
  `dashboardLayout.save` with the serialize-on-save guard
  (`device-overview.tsx:164-200`) — Phase 2–4 restyle the rendered
  cards/widgets in place, they do not touch this state machine.
- **Two real routes exist**: `/` and `/setup`. The design's 4-glyph nav
  rail is built with exactly those two wired (Dashboard, Setup) plus a
  decorative (non-interactive) logo mark and user-avatar glyph — no
  dead links are introduced.

## Desired End State

`src/app/page.tsx` renders the new command-center shell: a 74px icon
rail (Dashboard/Setup wired, logo + avatar decorative), a header with
live clock + site selector + status pill, a 5-card KPI row backed
entirely by real `device.overview`/`automation.list` data, a climate
chart + side column (room temp lines, devices-by-room donut,
automations toggle widget), a restyled device grid with working
search/type/status filters, real plug on/off control, and a
real-derived bottom-left alert toast. The existing `/setup` page and
its shared `page-shell.tsx` are visually untouched. The app stays
dark-only on this one page regardless of the global theme setting.

## What We're NOT Doing

- Battery percentage, power draw (kW/kWh/€), and valve open-%
  gauge — no real data source exists; not fabricated (Decisions D1,
  D9).
- Camera card / camera feed — omitted entirely (Decision D2).
- Light-mode styling for the new dashboard chrome — dark-only
  (Decision D5). The rest of the app (Setup, modals) keeps its
  existing light/dark theming untouched.
- Modifying `src/components/page-shell.tsx` or the global `--s-*`
  token set — the redesign's new tokens are scoped to the dashboard
  page only (Decision D4).
- Adding new nav-rail destinations or pages — only `/` and `/setup`
  are wired; no new routes are created (Decision D6).
- KPI sparklines / trend deltas (e.g. "+3") that would require
  historical aggregate data this app doesn't currently store.
- Rebuilding the `@dnd-kit` widget/room reorder state machines —
  restyled in place only.

## Implementation Approach

Visual-first, bottom-up: build the new dashboard-scoped design tokens
and page shell first (Phase 1), then layer in each section in the
same top-to-bottom order as the design spec, reusing existing
data-fetching and interaction logic wherever it already exists
(KPI math, donut, FilterBar, DnD) and adding new backend surface only
where the design calls for real interactivity the app doesn't have
yet (plug control, Phase 5). Interactivity beyond what already exists
today is layered on last (Decision D12) — Phase 4 ships the plug
toggle as a visual, real-state-reflecting but non-interactive control;
Phase 5 makes it functional.

## Critical Implementation Details

**Token scoping.** New colors/typography tokens live in a
`.command-center { --cc-*: ...; }` block in `globals.css`, applied via
a wrapper class on the new shell's root element — never registered in
`:root`/`.dark` where they'd leak into Setup, modals, or toasts.
Tailwind v4's CSS-first `@theme` block is not extended; the new tokens
are consumed via `var(--cc-*)` arbitrary values, matching the existing
`--s-*` convention (`globals.css:92`).

**Forced dark.** The command-center shell renders dark unconditionally
— it does not read `next-themes`' `resolvedTheme`. Because `--cc-*`
tokens are defined once (not duplicated under `.dark`), there's
nothing for a theme switch to override; the rest of the app's
light/dark toggle (`src/components/theme-toggle.tsx`) keeps working
unaffected since it only touches `:root`/`.dark` `--s-*`/shadcn tokens.
The design's header "theme toggle" glyph is rendered as a static,
disabled icon with a tooltip ("Dashboard is dark-only") — visual
fidelity without a misleading control.

**Plug DP discovery (Phase 5).** `dp-codes.ts`'s only entry
(`ogx8u5z6: 4`) was confirmed empirically by watching live `dp-refresh`
events (per its inline comment) — there is no documentation of Tuya
DP numbers anywhere in this codebase or repo. Phase 5 repeats that
exact method for the plug's on/off DP: temporarily elevate
`real-client.ts`'s `onData` debug log (already logs `dps` at
`gatewayLogger.debug` — `real-client.ts:61-64`) to surface raw payloads
while physically toggling a real plug, identify which DPS key flips
boolean state (conventionally `"1"`/`switch_1` for Tuya generic
sockets — to be confirmed, not assumed), then encode it in
`DP_CODE_MAP` with a comment matching the valve entry's style.

## Phase 1: Foundation — fonts, scoped tokens, command-center shell

### Overview

Add the two new fonts, define the dashboard-scoped `.command-center`
token block, and build the new page shell (icon rail + header) that
replaces `PageShell` on `/` only.

### Changes Required

#### 1. New fonts in the root layout

**File**: `src/app/layout.tsx`
**Intent**: Make Space Grotesk + JetBrains Mono available app-wide via
`next/font/google`, alongside the existing Geist setup, without
changing any other page's rendered font (they only opt in via the new
CSS variables).
**Contract**: Add `Space_Grotesk` and `JetBrains_Mono` imports next to
the existing `Geist` import (`layout.tsx:4`); register them as
`--font-display` and `--font-mono-display` CSS variables; add both
variable classes to the root `<html>` className alongside
`geist.variable` (`layout.tsx:26`). No other page consumes these
variables until Phase 1's shell components reference them directly via
`var(--font-display)` / `var(--font-mono-display)`.

#### 2. Dashboard-scoped design tokens

**File**: `src/styles/globals.css`
**Intent**: Define every color/spacing/radius token from the design
handoff's "Design Tokens" section, scoped so they cannot leak into any
other page or modal.
**Contract**: Add a new `.command-center { ... }` rule block (after
the existing `.dark` block, before `@layer base`) defining `--cc-bg`,
`--cc-glass-bg`/`--cc-glass-border`, `--cc-text-primary/secondary/muted/faint`,
`--cc-cyan`/`--cc-cyan-dark`, `--cc-emerald`, `--cc-violet`/`--cc-violet-dark`,
`--cc-amber`, `--cc-rose`, and the two background-glow colors, using
the exact values from the README's "Design Tokens" section. Do not add
any of these under `:root` or `.dark`.

#### 3. Command-center shell (icon rail + header)

**File**: `src/app/_components/command-center-shell.tsx` (new)
**Intent**: Full-viewport two-column app shell replacing `PageShell`
on the dashboard route only — 74px icon rail (logo, Dashboard link,
Setup link, decorative settings/avatar glyphs) + main column with the
header (title, "SYSTEM NOMINAL" pill, live clock, site selector,
disabled theme-toggle glyph).
**Contract**: Exports `CommandCenterShell({ children }: { children: ReactNode })`.
Wraps its subtree in `<div className="command-center ...">` so all
`--cc-*` tokens resolve. Rail items: `Dashboard` (`Link href="/"`,
active via `usePathname() === "/"`), `Setup` (`Link href="/setup"`,
active via `usePathname() === "/setup"`), plus two non-interactive
decorative glyphs (logo mark, user avatar) rendered as plain `<div>`s,
never `<button>`/`<Link>`. Reuses the existing `Select`/`SelectTrigger`
components for the site selector (same `useSiteContext()` pattern as
`page-shell.tsx:21-26,36-54`).

#### 4. Live clock

**File**: `src/app/_components/command-center-clock.tsx` (new)
**Intent**: Mono `HH:MM:SS` 24h clock, ticking every second, no SSR/CSR
mismatch.
**Contract**: `"use client"` component. Renders `null` (or a static
placeholder) until mounted (`useEffect` sets a `mounted` flag), then
runs `setInterval(1000)` clearing on unmount. Uses
`var(--font-mono-display)` styling.

#### 5. Wire the new shell into the dashboard route

**File**: `src/app/page.tsx`
**Intent**: Replace `<PageShell>` with `<CommandCenterShell>` on this
route only; `/setup` keeps `PageShell` unchanged.
**Contract**: Swap the import and JSX wrapper; keep the existing
`api.device.overview` prefetch logic untouched.

### Success Criteria

#### Automated

- [ ] `npm run typecheck` passes
- [ ] `npm run check` passes
- [ ] `npm run build` completes

#### Manual

- [ ] `/` renders the new dark icon-rail shell; `/setup` is visually
      unchanged
- [ ] Clicking the Dashboard/Setup rail icons navigates correctly;
      active item shows the cyan indicator
- [ ] Live clock ticks every second with no console hydration warning
- [ ] Site selector still switches sites correctly

## Phase 2: KPI row (5 real-data stat cards)

### Overview

Replace the existing widget-row KPI cards with the design's 5-card
glass layout, each backed by data that already exists in
`device-overview.tsx`'s computed values plus one new query for the
5th card.

### Changes Required

#### 1. Command-center KPI card primitive

**File**: `src/app/_components/cc-kpi-card.tsx` (new)
**Intent**: Glass-styled stat card matching the design tokens, generic
enough for all 5 KPI variants (default/rose-tinted-alert/emerald-tinted-healthy).
**Contract**: `CcKpiCard({ icon, label, value, sub, tone, children })`
where `tone: "default" | "alert" | "healthy"` selects the tinted
background/border variant; `children` allows the range-bar / segment-bar
ornamentation specific to each card.

#### 2. Devices Online card

**Intent**: Real `totalDevices`/`onlineCount`/`offlineCount` from
`device-overview.tsx:421-423` — no trend/sparkline (no historical data
exists).
**Contract**: `value={onlineCount}/{totalDevices}`, `sub` = offline
count.

#### 3. Avg Temperature card

**Intent**: Real `avgTempC` (`device-overview.tsx:441-444`) plus a real
range bar using `DEFAULT_THRESHOLDS.minTempC`/`maxTempC` from
`src/server/lib/scoring.ts` as the bar's bounds and `avgTempC` as the
thumb position — this is genuinely real config, not fabricated.

#### 4. Active Alerts card

**Intent**: Real `roomsTooHot + roomsTooCold` count
(`device-overview.tsx:426-429`); copy lists the actual room names in
an alert state instead of the design's fabricated "Space Heater · low
battery" line (Decision D10).
**Contract**: `tone="alert"` when count > 0; "Review →" scrolls to the
Devices section (`scrollIntoView`) rather than linking anywhere new.

#### 5. Rooms Healthy card

**Intent**: Real `roomsOk` / `roomCount` (`device-overview.tsx:425`),
emerald segment bars — one segment per room, colored by that room's
real `badge`.

#### 6. Active Automations card (5th slot)

**Intent**: Self-determined replacement for the design's fabricated
"Power Draw" card (Decision D11) — genuinely new information not
shown elsewhere on the page.
**Contract**: New `api.automation.list.useQuery({ siteId: activeSiteId })`
call in `device-overview.tsx` (or the new KPI-row component); count
rows where `isEnabled === true`; `sub` shows total rule count.

### Success Criteria

#### Automated

- [ ] `npm run typecheck` passes
- [ ] `npm run check` passes
- [ ] `npm run build` completes

#### Manual

- [ ] All 5 KPI cards show values matching the previous widget row's
      underlying data (cross-check counts)
- [ ] Active Alerts card visually distinguishes itself (rose tint)
      only when `roomsTooHot + roomsTooCold > 0`
- [ ] Active Automations count matches `/setup`'s automation list
      enabled-rule count

## Phase 3: Climate Overview + side column

### Overview

Build the large climate multi-series chart and the two side-column
cards (devices-by-room donut relocated from the old widget row,
automations compact widget).

### Changes Required

#### 1. Climate Overview chart

**File**: `src/app/_components/cc-climate-overview.tsx` (new)
**Intent**: One Recharts `<Line>` series per room with a sensor,
reusing the exact data-fetching pattern from `RoomChart`
(`room-temperature-panel.tsx:19-44`) but combined into a single
multi-series chart instead of one chart per room.
**Contract**: For each room with `primarySensorId`, call
`api.device.temperatureHistory.useQuery({ tuyaDeviceId, range: "24h" })`
and render one `<Line dataKey={room.roomId} stroke={var(--color-chart-N)} />`
on a shared `<LineChart>`; merge timestamps across rooms onto one
x-axis. Reuses the `CartesianGrid`/`Tooltip` styling from
`room-temperature-panel.tsx:70-104`. Renders for however many rooms
have sensors (not hardcoded to 3, unlike the design mock).

#### 2. Devices-by-Room donut (relocated)

**File**: `src/app/_components/cc-devices-by-room.tsx` (new, logic
moved from `device-overview.tsx:518-568`)
**Intent**: Move the existing real `roomDeviceCounts` + `PieChart`
block into the new side column, restyled, with no logic changes.
**Contract**: Accepts `roomDeviceCounts: { name: string; count: number }[]`
as a prop; renders the same `Pie`/`Cell`/`Tooltip` structure, restyled
to the glass-card token set.

#### 3. Automations widget

**File**: `src/app/_components/cc-automations-widget.tsx` (new)
**Intent**: Compact read+toggle list (Decision D8) using real
`automation.list` data and the existing `automation.toggle` mutation.
**Contract**: `api.automation.list.useQuery({ siteId: activeSiteId })`
rows rendered as `name` + mono schedule string (derived from
`daysOfWeek`/`fireHour`/`fireMinute`) + a toggle switch calling
`api.automation.toggle.useMutation({ id, isEnabled })` on change,
mirroring the optimistic-then-reconcile pattern already used by
`SetpointControl` (`device-card.tsx:21-78`).

### Success Criteria

#### Automated

- [ ] `npm run typecheck` passes
- [ ] `npm run check` passes
- [ ] `npm run build` completes

#### Manual

- [ ] Climate chart renders one line per real room with sensor data;
      a room with no sensor shows no line (not a fabricated flat line)
- [ ] Donut segment counts match the per-room device counts shown in
      the Devices section below
- [ ] Toggling an automation here updates its state in `/setup` (or
      wherever automations are otherwise listed) and vice versa

## Phase 4: Devices section (toolbar + restyled card grid)

### Overview

Restyle the existing, already-wired toolbar and device grid; drop the
camera card type; build the plug card's toggle as visual-only (state
reflects real data, not yet interactive — Phase 5 wires it).

### Changes Required

#### 1. Devices section header + toolbar restyle

**File**: `src/app/_components/filter-bar.tsx`
**Intent**: Visual restyle only — search input, type filter buttons,
status segmented control already filter correctly
(`filter-bar.tsx:32-43,91-117`); no behavioral change.
**Contract**: Same props/interface (`FilterBarProps`), restyled
className strings using `--cc-*` tokens instead of `--s-*`.

#### 2. Device card restyle (sensor, valve, plug — no camera)

**File**: `src/app/_components/device-card.tsx`
**Intent**: Restyle per device type per the design: sensor cards keep
their existing sparkline pattern (reuse `RoomSparkline`'s approach from
`room-group.tsx:15-45`, scoped per-device); valve cards drop the % ring
and show target/current temp only (Decision D9) — `SetpointControl`
(`device-card.tsx:21-78`) is kept as-is; plug cards get a visual on/off
indicator reflecting `device.isOn` (added in Phase 5's `DeviceItem`
extension, read here as `device.isOn ?? null` — falls back to a
"state unknown" visual until Phase 5 lands) but the toggle is
**non-interactive** in this phase (Decision D12 — visual fidelity
first).
**Contract**: No prop signature change. Camera device type is not
added to `TYPE_ICON` (`device-card.tsx:15-19`) — cameras never appear
since none exist in `deviceType` (`'sensor' | 'valve' | 'plug'`,
`schema.ts:129`).

#### 3. Room sidebar restyle

**File**: `src/app/_components/room-sidebar.tsx`
**Intent**: Visual restyle only, same `RoomSidebarProps` contract.

### Success Criteria

#### Automated

- [ ] `npm run typecheck` passes
- [ ] `npm run check` passes
- [ ] `npm run build` completes

#### Manual

- [ ] Type filter chips (All/Sensor/Valve/Plug) and status segments
      (All/Online/Offline) still filter the grid exactly as before
- [ ] No camera card appears anywhere in the grid
- [ ] Valve cards show target/current temp with no % ring
- [ ] Plug cards show a visual on/off state but clicking the toggle
      does nothing yet (expected — Phase 5 wires it)

## Phase 5: Plug control backend

### Overview

Give smart plugs real Tuya wiring end-to-end: discover the live on/off
DP, decode plug state during polling, and expose a real
`device.setPlugState` mutation — then make Phase 4's visual toggle
call it.

### Changes Required

#### 1. Discover the plug's on/off DP from a live device

**File**: `src/server/lib/tuya/real-client.ts` (temporary debug step,
no permanent code change from this item alone)
**Intent**: Confirm which DPS key carries plug on/off state, the same
empirical method that produced the valve's `ogx8u5z6: 4` entry.
**Contract**: Temporarily raise the existing `gatewayLogger.debug({ cid: key, cmdByte, dps: d.dps }, "tuya.state-update")` log (`real-client.ts:61-64`) to `info` (or tail logs at debug level), physically toggle a real `fgwhjm9j` plug on/off, and record which `dps` key flips between `true`/`false`. Revert the log level change once confirmed.

#### 2. Encode the confirmed DP

**File**: `src/server/lib/tuya/dp-codes.ts`
**Intent**: Add the plug's productKey → on/off DPS mapping, documented
the same way as the existing valve entry.
**Contract**: Add `fgwhjm9j: <confirmed DP>` to `DP_CODE_MAP` with an
inline comment stating what was confirmed and how (mirroring the
existing comment style).

#### 3. Extend the Tuya client contract for on/off reads + writes

**File**: `src/server/lib/tuya/types.ts`
**Intent**: Add `isOn` to device readings and a switch-write command to
the client interface.
**Contract**: Add `isOn: boolean | null` to `TuyaDeviceReading`
(`types.ts:1-7`). Add `sendSwitch(gateway, command: { dps: number; set: boolean; cid?: string }): Promise<void>` to `TuyaGatewayClient` (`types.ts:9-31`), alongside the existing `sendSetpoint`.

#### 4. Decode plug state during polling + implement the write

**File**: `src/server/lib/tuya/real-client.ts`
**Intent**: Populate `isOn` for plug-type devices in the reading loop;
implement `sendSwitch` mirroring `sendSetpoint` exactly.
**Contract**: In the `fetchGatewayDevices` reading loop
(`real-client.ts:191-207`), add `const isOn = deviceType === "plug" ? dps[String(confirmedDp)] === true ... : null` style decode wired into the pushed `TuyaDeviceReading`. Add a new exported `sendSwitch` implementation calling `state.tuyaGateway.set({ dps, set, shouldWaitForResponse: true, ...(cid ? { cid } : {}) })`, identical in shape to `sendSetpoint` (`real-client.ts:216-228`).

#### 5. Stub client parity

**File**: `src/server/lib/tuya/stub-client.ts`
**Intent**: Keep local/test dev working without a real device.
**Contract**: Add `isOn: true` to the `stub-dev-005` fixture
(`stub-client.ts:32-38`, the "Smart Plug 1" seed device); add a no-op
`sendSwitch` alongside the existing no-op `sendSetpoint`
(`stub-client.ts:48-50`).

#### 6. Persist isOn through the poller and state store

**Files**: `src/server/lib/device-state-store.ts`,
`src/server/workers/tuya-poller.ts`
**Intent**: Carry the new field through the existing poll → store
pipeline.
**Contract**: Add `isOn: boolean | null` to `DeviceState`
(`device-state-store.ts:1-7`). In `pollOnce`'s `deviceStateStore.set(...)`
call (`tuya-poller.ts:57-63`), add `isOn: reading.isOn`.

#### 7. Plug control helper (mirrors `valve-control.ts`)

**File**: `src/server/lib/plug-control.ts` (new)
**Intent**: Same DB lookup → DP_CODE_MAP guard → gateway lookup → key
decrypt → client-call structure as `valve-control.ts`, for plug writes.
**Contract**: `export async function sendPlugCommand(deviceId: string, isOn: boolean): Promise<void>` — identical control flow to
`sendSetpointCommand` (`valve-control.ts:9-69`), calling
`client.sendSwitch(...)` instead of `client.sendSetpoint(...)`, throwing
the same `DEVICE_NOT_FOUND` / `UNSUPPORTED_DEVICE` / `DEVICE_NOT_PAIRED`
/ `GATEWAY_NOT_FOUND` / `GATEWAY_KEY_NOT_SET` / `KEY_DECRYPT_FAILED` /
`COMMAND_FAILED` error strings.

#### 8. `device.overview` exposes `isOn`

**File**: `src/server/api/routers/device.ts`
**Intent**: Surface plug on/off state to the client.
**Contract**: Add `isOn: boolean | null` to the `DeviceItem` interface
(`device.ts:349-365`) and to the `overview` query's item construction
(`device.ts:275-291`): `isOn: state?.isOn ?? null`.

#### 9. New `setPlugState` mutation

**File**: `src/server/api/routers/device.ts`
**Intent**: Real backend control endpoint, mirroring `setpoint`'s exact
error-handling shape.
**Contract**: New `setPlugState: protectedProcedure.input(z.object({ deviceId: z.string(), isOn: z.boolean() })).mutation(...)` placed alongside `setpoint` (`device.ts:22-71`), calling `sendPlugCommand` and mapping the same error-message-string set to the same `TRPCError` codes via the same `switch` pattern.

#### 10. Wire the Phase 4 visual toggle to the real mutation

**File**: `src/app/_components/device-card.tsx`
**Intent**: Make the plug toggle built in Phase 4 functional.
**Contract**: Add a `PlugToggle` sub-component mirroring
`SetpointControl`'s optimistic-update/error-rollback pattern
(`device-card.tsx:21-78`), calling
`api.device.setPlugState.useMutation({ onSuccess, onError })`.

### Success Criteria

#### Automated

- [ ] `npm run typecheck` passes
- [ ] `npm run check` passes
- [ ] `npm run build` completes

#### Manual

- [ ] Toggling a real plug card flips its physical state and the UI
      reflects the new state after the next poll
- [ ] An unsupported/unpaired device returns the expected
      `BAD_REQUEST`/`NOT_FOUND` error surfaced as a toast, not a crash
- [ ] Stub mode (`TUYA_STUB=true`) still runs without errors with the
      plug toggle visually present (no-op)

## Phase 6: Alerts toast

### Overview

Add the fixed bottom-left alert toast, derived entirely from the real
room-alert signal already computed for the KPI row.

### Changes Required

#### 1. Alert toast component

**File**: `src/app/_components/cc-alert-toast.tsx` (new)
**Intent**: Fixed bottom-left dismissible toast, shown only when real
alert data exists (Decision D10 — no fabricated device/battery copy).
**Contract**: `CcAlertToast({ rooms }: { rooms: RoomItem[] })` — derives
its message from rooms with `badge === "Too Hot" | "Too Cold"`
(reusing the same filter as the KPI Active Alerts card); local
`dismissed` state (resets when the underlying alert set changes, so a
new alert re-surfaces); renders nothing when there are zero alerting
rooms.

### Success Criteria

#### Automated

- [ ] `npm run typecheck` passes
- [ ] `npm run check` passes
- [ ] `npm run build` completes

#### Manual

- [ ] Toast appears only when at least one room is in an alert state,
      and lists the real room name(s)
- [ ] Dismissing the toast hides it; it reappears if a new room enters
      an alert state
- [ ] No toast appears when all rooms are OK

## Testing Strategy

Manual verification only, per-phase gates (Decision D13) — no new
automated test suite for this visual redesign. Each phase's "Manual"
checklist above is confirmed by the user before moving to the next
phase, per the standard `/10x-implement` phase-end gate.

## Performance Considerations

The Climate Overview chart (Phase 3) fires one `temperatureHistory`
query per room with a sensor — same query-count pattern already used
by `RoomTemperaturePanel`, so no new load profile is introduced. The
KPI row's new `automation.list` query (Phase 2) is already used
elsewhere in the app (`/setup`) with no pagination concerns at current
scale.

## Migration Notes

No schema or data migration — Phase 5 only adds a new optional field
(`isOn`) to an in-memory store and a `DP_CODE_MAP` entry; both are
purely additive and have no effect on existing sensor/valve devices.

## References

- `Claude Design/design_handoff_tuya_dashboard/README.md` — design spec
- `Claude Design/design_handoff_tuya_dashboard/Tuya Control Center.dc.html` — hi-fi prototype markup
- `Claude Design/design_handoff_tuya_dashboard/original-dashboard-before.png` — before reference
- `context/changes/dashboard-command-center-redesign/plan-brief.md` — decision table

## Progress

### Phase 1: Foundation — fonts, scoped tokens, command-center shell

- [x] 1.1 Add Space Grotesk + JetBrains Mono fonts to `layout.tsx` — 3d2fb6b
- [x] 1.2 Add `.command-center` scoped token block to `globals.css` — 3d2fb6b
- [x] 1.3 Build `command-center-shell.tsx` — 3d2fb6b
- [x] 1.4 Build `command-center-clock.tsx` — 3d2fb6b
- [x] 1.5 Wire new shell into `src/app/page.tsx` — 3d2fb6b

#### Manual

- [x] 1.6 `/` renders new shell; `/setup` unchanged — 3d2fb6b
- [x] 1.7 Rail navigation + active-state styling correct — 3d2fb6b
- [x] 1.8 Live clock ticks with no hydration warning — 3d2fb6b
- [x] 1.9 Site selector still works — 3d2fb6b

### Phase 2: KPI row (5 real-data stat cards)

- [x] 2.1 Build `cc-kpi-card.tsx` primitive — 8eb981a
- [x] 2.2 Devices Online card — 8eb981a
- [x] 2.3 Avg Temperature card with real range bar — 8eb981a
- [x] 2.4 Active Alerts card (real room names, no fabricated copy) — 8eb981a
- [x] 2.5 Rooms Healthy card — 8eb981a
- [x] 2.6 Active Automations card (5th slot, new `automation.list` query) — 8eb981a

#### Manual

- [x] 2.7 All 5 KPI values cross-checked against underlying data — 8eb981a
- [x] 2.8 Active Alerts tints only when alerts exist — 8eb981a
- [x] 2.9 Active Automations count matches `/setup` — 8eb981a

### Phase 3: Climate Overview + side column

- [x] 3.1 Build `cc-climate-overview.tsx` multi-series chart
- [x] 3.2 Build `cc-devices-by-room.tsx` (relocated donut)
- [x] 3.3 Build `cc-automations-widget.tsx` (read+toggle)

#### Manual

- [x] 3.4 Climate chart shows one line per sensor-having room only
- [x] 3.5 Donut counts match Devices section counts
- [x] 3.6 Automation toggle here stays in sync with `/setup`

### Phase 4: Devices section (toolbar + restyled card grid)

- [ ] 4.1 Restyle `filter-bar.tsx` (no behavior change)
- [ ] 4.2 Restyle `device-card.tsx` (sensor/valve/plug, no camera, plug toggle visual-only)
- [ ] 4.3 Restyle `room-sidebar.tsx`

#### Manual

- [ ] 4.4 Type/status filters still work exactly as before
- [ ] 4.5 No camera card anywhere
- [ ] 4.6 Valve cards show temps with no % ring
- [ ] 4.7 Plug toggle visually present, non-functional (expected)

### Phase 5: Plug control backend

- [ ] 5.1 Discover plug on/off DP from a live device
- [ ] 5.2 Encode confirmed DP in `dp-codes.ts`
- [ ] 5.3 Extend `types.ts` (`isOn`, `sendSwitch`)
- [ ] 5.4 Decode plug state + implement `sendSwitch` in `real-client.ts`
- [ ] 5.5 Stub client parity (`stub-client.ts`)
- [ ] 5.6 Persist `isOn` through `device-state-store.ts` + `tuya-poller.ts`
- [ ] 5.7 Build `plug-control.ts` (mirrors `valve-control.ts`)
- [ ] 5.8 Expose `isOn` in `device.overview`
- [ ] 5.9 Add `device.setPlugState` mutation
- [ ] 5.10 Wire Phase 4's visual toggle to the real mutation

#### Manual

- [ ] 5.11 Real plug toggles physically and UI reflects new state after poll
- [ ] 5.12 Unsupported/unpaired device errors surface as toast, not crash
- [ ] 5.13 Stub mode runs without errors

### Phase 6: Alerts toast

- [ ] 6.1 Build `cc-alert-toast.tsx`

#### Manual

- [ ] 6.2 Toast appears only with real alerting rooms, names correct
- [ ] 6.3 Dismiss/reappear behavior correct
- [ ] 6.4 No toast when all rooms OK
