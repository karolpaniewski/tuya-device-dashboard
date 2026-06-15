# S-17 Visual & UX Redesign — Implementation Plan

## Overview

Visual and UX overhaul of the Tuya Device Dashboard. Zero backend changes — pure frontend. Five deliverables: (1) full dark/light mode with toggle and no FOUC, (2) semantic CSS vars replacing hardcoded glass-morphism colors, (3) device-type icons on every tile, (4) prominent per-room temperature charts in an overview panel, (5) donut KPI card showing device distribution per room.

## Current State Analysis

- `src/app/layout.tsx:25` — `<html className="dark">` hardcoded; no ThemeProvider; `next-themes@0.4.6` is installed but unused
- `src/styles/globals.css:56–123` — `:root` (light) and `.dark` CSS vars already defined for shadcn tokens; no surface-specific vars for glass effects yet
- `src/app/_components/device-card.tsx` — hardcoded `bg-white/5`, `border-white/10`, `text-white`; no device-type icon, only a text badge
- `src/app/_components/room-group.tsx` — sparkline at 56px height, no theming; single blue line `#60a5fa` hardcoded
- `src/app/_components/device-overview.tsx` — KPI row (4 cards) and room grid exist; no temperature overview panel; no pie chart
- `src/components/page-shell.tsx` — header with site selector and `{rightContent}` slot; no theme toggle
- Background blobs in `layout.tsx:27–30` hardcoded for dark (`bg-blue-600/10`, `bg-purple-600/8`)

## Desired End State

1. `<html>` has no hardcoded `dark`; class is set by an inline FOUC-prevention script reading `localStorage('theme')` before React hydrates
2. All components use Tailwind `dark:` variant pairs instead of hardcoded glass colors — each color has a light default and a `dark:` override
3. `src/components/theme-toggle.tsx` exists; imported into `PageShell` header next to site selector
4. Every `DeviceCard` shows a `Thermometer` (sensor) / `Gauge` (valve) / `Plug` (plug) icon from `lucide-react` alongside the type badge
5. A `RoomTemperaturePanel` component renders above the room grid in `device-overview.tsx` — responsive grid of 200px charts, one per room with axes and tooltip
6. KPI row has a 5th card with a `PieChart` from recharts showing device count per room

### Key Discoveries

- `next-themes` is already installed — wiring is ThemeProvider in layout + inline script for FOUC, not a new install
- `@custom-variant dark (&:is(.dark *))` is registered in globals.css — `dark:` Tailwind prefix works when `.dark` is on `<html>`
- `api.device.temperatureHistory` is already queried by `room-group.tsx` — the overview panel can reuse the same query (or lift it to device-overview level)
- `recharts` v3.8.1 installed; `PieChart`, `Pie`, `Cell`, `Tooltip` are available for the donut card
- chart colors `--chart-1` through `--chart-5` defined in both modes — use them for the pie chart segments
- Lucide icons `Thermometer`, `Gauge`, `Plug` are available in `lucide-react@1.17.0`

## What We're NOT Doing

- No backend changes (zero tRPC / Drizzle / schema modifications)
- No custom SVG icons — only lucide-react
- No automation history widget (blocked on S-11 + S-12)
- No new npm installs (all libraries already present)
- No changes to mobile layout — S-08 must not regress

## Implementation Approach

**Phase ordering rationale**: Theme infrastructure must land first — without ThemeProvider and CSS vars, subsequent components can't be audited correctly. Light-mode color audit is second — establishes a correct visual baseline in both modes before new features are added on top. Device icons are third (isolated, self-contained). Temperature panel and pie chart are fourth and fifth — new UI features that compose on the corrected foundation.

**Color migration strategy**: Use Tailwind `dark:` variant pairs rather than CSS custom properties for glass surface colors. Pattern: `bg-white shadow-sm dark:bg-white/5 dark:shadow-none` replaces `bg-white/5`. This keeps Tailwind as the single source of truth without new utility classes.

**Chart theming**: Chart line color changes from hardcoded `#60a5fa` to `var(--color-chart-1)` — this token already resolves correctly in both modes via globals.css.

---

## Phase 1: Theme Infrastructure

### Overview

Wire next-themes ThemeProvider, add FOUC-prevention inline script, define surface CSS vars, add theme toggle to PageShell header.

### Changes Required

#### 1. CSS vars for page background and blobs

**File**: `src/styles/globals.css`

**Intent**: Add surface-level CSS vars that control the full-page background color and gradient blob colors in light vs dark mode. The existing shadcn token set does not cover the full-bleed background or the decorative blobs.

**Contract**: Append to `:root {}` block:
```css
--page-bg: oklch(0.97 0 0);   /* gray-50 equivalent */
--blob-1: rgb(37 99 235 / 0.05);
--blob-2: rgb(147 51 234 / 0.04);
```
Append to `.dark {}` block:
```css
--page-bg: oklch(0.145 0 0);  /* gray-950 */
--blob-1: rgb(37 99 235 / 0.1);
--blob-2: rgb(147 51 234 / 0.08);
```

#### 2. ThemeProvider + FOUC script + background vars

**File**: `src/app/layout.tsx`

**Intent**: Remove hardcoded `dark` class; let next-themes manage it. Prevent theme flash on page load with an inline script. Update background div to use the new CSS vars so it adapts to both modes.

**Contract**:
- Import `ThemeProvider` from `next-themes`; wrap `{children}` (inside existing providers, outside `Toaster`)
- `ThemeProvider` props: `attribute="class"`, `defaultTheme="dark"`, `storageKey="theme"`, `disableTransitionOnChange`
- Add inline `<script>` in `<head>` (before `<body>`) that reads `localStorage.getItem('theme')` and sets `document.documentElement.classList` synchronously. next-themes exports a ready-made script string for this — use `suppressHydrationWarning` on `<html>`.
- Remove `dark` from `<html className={...}>` — leave only the font variable class
- Background `<div>`: change `bg-gray-950` → `bg-[var(--page-bg)]`; change blob colors to `bg-[var(--blob-1)]` and `bg-[var(--blob-2)]`

#### 3. Theme toggle component

**File**: `src/components/theme-toggle.tsx` *(new)*

**Intent**: Client component with a single icon button that cycles dark → light → system; uses next-themes `useTheme`. Shows `Sun` when in dark mode (clicking switches to light), `Moon` when in light mode.

**Contract**: Export `ThemeToggle` — a `<Button variant="ghost" size="icon">` containing a `Sun` or `Moon` icon from lucide-react. Reads `resolvedTheme` from `useTheme()`.

#### 4. Toggle in PageShell header

**File**: `src/components/page-shell.tsx`

**Intent**: Add `ThemeToggle` to the header row so it's always visible on every page.

**Contract**: Import `ThemeToggle`; render it inside the `<div className="flex items-center gap-3">` (line 26), after the site selector and before `{rightContent}`. Also change `text-white` on `<main>` (line 23) and `<h1>` (line 25) to `text-foreground` — these will be the first semantic-color changes.

### Success Criteria

#### Automated Verification
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification
- Toggle button visible in header on all pages
- Clicking cycles dark → light → dark
- Refreshing the page (in light mode) does not flash dark before going light (no FOUC)
- Background adapts: dark = near-black with blue/purple blobs; light = gray-50 with subtle blobs

**Pause here for manual verification before proceeding to Phase 2.**

---

## Phase 2: Light Mode Color Audit

### Overview

Replace all hardcoded glass-morphism colors (`bg-white/5`, `border-white/10`, `text-white`, `text-gray-4xx`) with Tailwind `dark:` variant pairs so every component renders correctly in both modes.

### Changes Required

#### 1. DeviceCard — online/offline glass

**File**: `src/app/_components/device-card.tsx`

**Intent**: The card's glass appearance (`bg-white/[0.13]`, `border-white/20`) is invisible or muddy on a light background. Replace every hardcoded glass color with a light default + `dark:` override.

**Contract** — replace the `cn()` class blocks at lines 99–104:
- Online card: `bg-white border-gray-200 shadow-sm hover:border-gray-300 hover:bg-gray-50 dark:border-white/20 dark:bg-white/[0.13] dark:shadow-none dark:hover:border-white/30 dark:hover:bg-white/[0.18]`
- Offline card: `border-gray-100 bg-gray-50 opacity-50 dark:border-white/10 dark:bg-white/[0.04]`

Also update inline text colors:
- `text-white` (device name, setpoint span) → `text-foreground`
- `text-gray-400` (offline name) → `text-gray-500 dark:text-gray-400`
- `text-gray-500` (timestamp) → `text-gray-600 dark:text-gray-500`
- `text-gray-600` (offline dot) → keep for dot; offline dot bg: `bg-gray-300 dark:bg-gray-600`
- `bg-yellow-900/40 text-yellow-300` (stale badge) → add `dark:` prefixes; light: `bg-yellow-100 text-yellow-700 border-yellow-300`

#### 2. RoomGroup — room card + sparkline

**File**: `src/app/_components/room-group.tsx`

**Intent**: Room card header and sparkline wrapper are dark-only glass. Sparkline line color is hardcoded.

**Contract**:
- Room card outer wrapper (if glass-styled): add light defaults + dark: overrides
- Sparkline container border/bg: `border-gray-200 bg-gray-50 dark:border-white/5 dark:bg-white/[0.02]`
- `stroke="#60a5fa"` on the Recharts `Line` → `stroke="var(--color-chart-1)"` — this token resolves to the appropriate blue in both modes
- Room name and badge text: `text-foreground`

#### 3. RoomSidebar — sidebar items

**File**: `src/app/_components/room-sidebar.tsx`

**Intent**: Sidebar uses dark-only button variants and `text-white`.

**Contract**: Replace any hardcoded white/gray text with semantic tokens (`text-foreground`, `text-muted-foreground`). Active room button: ensure contrast in both modes (already using shadcn Button variants which use CSS vars — verify they work correctly).

#### 4. FilterBar — search and filter controls

**File**: `src/app/_components/filter-bar.tsx`

**Intent**: Filter bar may use hardcoded dark glass for its wrapper or labels.

**Contract**: Audit and replace any `text-white`, `bg-white/X`, `border-white/X` with light defaults + `dark:` overrides. Filter button active states should use `bg-blue-600 text-white dark:...` pattern if applicable.

#### 5. DeviceModal — modal glass

**File**: `src/app/_components/device-modal.tsx`

**Intent**: Modal reading cards use `border-white/10 bg-white/5` glass pattern.

**Contract**: Replace all glass patterns with `bg-white border-gray-200 shadow-sm dark:bg-white/5 dark:border-white/10 dark:shadow-none`. Text colors: `text-white` → `text-foreground`, gray text variants → semantic Tailwind equivalents. Chart grid and axis text in Recharts: use `currentColor` or CSS var instead of hardcoded dark values.

#### 6. DeviceOverview — KPI cards

**File**: `src/app/_components/device-overview.tsx`

**Intent**: KPI cards use glass pattern; metric values are `text-white`.

**Contract**: KPI card wrappers: apply same glass-to-solid migration pattern. All `text-white` on metric values and labels → `text-foreground`. Unassigned room section glass → same pattern.

#### 7. Setup components

**Files**: `src/app/_components/setup/room-manager.tsx`, `setup/device-table.tsx`, `setup/site-manager.tsx`, `setup/room-threshold-form.tsx`

**Intent**: Setup components share the dark glass aesthetic.

**Contract**: Apply the same audit pass — `text-white` → `text-foreground`, glass bg/border → light defaults + dark: overrides. Table rows and headers: `bg-white dark:bg-white/5`, `border-gray-200 dark:border-white/10`.

### Success Criteria

#### Automated Verification
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification
- In light mode: all text is legible (dark on light background), cards have white background with gray border and shadow, no "invisible" elements
- In dark mode: appearance is identical to before this phase (no regressions)
- WCAG AA contrast verified visually for key text elements in both modes

**Pause here for visual review in both modes before proceeding.**

---

## Phase 3: Device Type Icons

### Overview

Add Thermometer / Gauge / Plug icons from lucide-react to every device tile (DeviceCard) and to the type column in the setup device table.

### Changes Required

#### 1. DeviceCard icon in type badge

**File**: `src/app/_components/device-card.tsx`

**Intent**: The type badge currently shows text only (`sensor`, `valve`, `plug`). Adding the corresponding icon makes device type instantly recognizable without reading.

**Contract**: Import `Thermometer`, `Gauge`, `Plug` from `lucide-react`. Add a map at the top of the file:
```ts
const TYPE_ICON = {
  sensor: Thermometer,
  valve: Gauge,
  plug: Plug,
} as const;
```
Inside the `<Badge>` at line 128, render `<Icon size={12} className="shrink-0" />` before the type text. Icon inherits Badge text color via `currentColor`.

#### 2. DeviceTable icon in Type column

**File**: `src/app/_components/setup/device-table.tsx`

**Intent**: The setup table has a Type column showing text. Add the same icon before the text for visual consistency.

**Contract**: Import the same `TYPE_ICON` map (or define inline). In the Type cell render: `<span className="flex items-center gap-1"><Icon size={14} />{device.deviceType}</span>`.

### Success Criteria

#### Automated Verification
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification
- Each device tile shows correct icon (Thermometer for sensor, Gauge for valve, Plug for plug) in the badge
- Icons visible in both dark and light mode
- Device table type column shows matching icon
- No layout shift on device cards (icon fits within existing badge)

---

## Phase 4: Temperature Overview Panel

### Overview

Add a `RoomTemperaturePanel` above the room card grid in `device-overview.tsx`. Shows a responsive grid of full-featured line charts (200px height, axes, tooltip) — one per room with active sensors.

### Changes Required

#### 1. RoomTemperaturePanel component

**File**: `src/app/_components/device-overview.tsx` *(or extract to `room-temperature-panel.tsx`)*

**Intent**: The existing 56px sparklines in room cards are too small to read trends. This panel gives facility managers the at-a-glance temperature trend for each room on the main view — the "Grafana-style monitoring feel" from PRD.

**Contract**:
- New component `RoomTemperaturePanel` accepts `rooms` (array of room overviews with sensors)
- For each room with at least one sensor: renders a card with room name + 200px `ResponsiveContainer` + `LineChart` with `CartesianGrid`, `XAxis` (time labels), `YAxis`, `Tooltip`
- Data source: `api.device.temperatureHistory` with `range: "24h"` — same query as used in `room-group.tsx`; fetch per room (same `staleTime: 60_000`)
- Rooms without sensors: render a "No sensors" placeholder card (same grid slot, gray dashed border)
- Layout: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- Chart colors: `stroke="var(--color-chart-1)"` for temperature line (adapts to both modes)
- Axis text color: `fill="currentColor"` in axis tick style
- Position in device-overview: render `<RoomTemperaturePanel />` between the KPI row and the `<FilterBar>` / room grid section

#### 2. Collapsible toggle (optional but recommended)

**Intent**: For facilities with many rooms, the panel might push the room grid too far down. A toggle button ("Show / Hide Overview") lets users collapse it.

**Contract**: Simple `useState` boolean in `device-overview.tsx` controlling panel visibility. State does NOT need to persist between sessions. Render a `<Button variant="ghost" size="sm">` with `ChevronDown`/`ChevronUp` icon next to the panel heading.

### Success Criteria

#### Automated Verification
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification
- Panel renders above room cards with correct room names
- Each room chart shows 24h temperature data (or "No sensors" placeholder)
- Panel is responsive: 1 col on mobile, 2 on tablet, 3 on desktop
- Charts use theme-appropriate colors in both dark and light mode
- Collapsible toggle hides/shows panel; room grid accessible either way
- 30s auto-refetch does not cause chart flicker

---

## Phase 5: Pie Chart KPI Card

### Overview

Add a 5th KPI card in `device-overview.tsx` containing a donut chart showing device count per room. Uses Recharts `PieChart` with `Pie` (inner radius → donut shape) and `Tooltip`.

### Changes Required

#### 1. Donut KPI card in device-overview

**File**: `src/app/_components/device-overview.tsx`

**Intent**: The 4-card KPI row shows aggregate numbers. A donut chart showing distribution of devices per room gives spatial context without additional clicking — answers "where are my devices?" at a glance.

**Contract**:
- Extend the KPI grid from `grid-cols-2 sm:grid-cols-4` to `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` to accommodate the 5th card
- 5th card contains:
  - Card heading: "By Room" (or "Rooms")
  - `<ResponsiveContainer width="100%" height={80}>` wrapping `<PieChart>`
  - `<Pie data={roomDeviceCounts} dataKey="count" nameKey="name" innerRadius={24} outerRadius={36} cx="50%" cy="50%">`
  - `<Cell>` per room using `var(--color-chart-1)` through `var(--color-chart-5)` (cycle if > 5 rooms)
  - `<Tooltip>` showing room name + device count
  - `<Legend>` omitted (names would overflow card) — names appear in tooltip only
- Data: `rooms` from the `device.overview` query already provides `deviceCount` per room. Compute `roomDeviceCounts = rooms.map(r => ({ name: r.roomName, count: r.devices.length }))` from the already-available data

### Success Criteria

#### Automated Verification
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification
- Donut chart renders in 5th KPI card with correct room distribution
- Tooltip shows room name + device count on hover
- Chart segments use distinct colors from chart-1 through chart-5 CSS vars
- KPI row responsive: on mobile shows 2 cols (pie chart wraps to new row); on lg shows all 5
- Chart colors adapt correctly in both dark and light modes

---

## Testing Strategy

### Automated
- `npm run typecheck` — after every phase
- `npm run lint` — after every phase
- `npm run build` — full production build after Phase 5 to catch any SSR/client boundary issues

### Manual
1. **Theme toggle**: dark → light → dark cycle; localStorage persists on refresh; no FOUC
2. **WCAG contrast**: in light mode, text legibility on all cards (informal check — no automated tool required)
3. **Mobile (375px)**: open Chrome DevTools device emulator; confirm no horizontal scroll, KPI row wraps cleanly, overview panel collapses to 1 col
4. **Dark mode regression**: full dashboard in dark mode must look identical to pre-S-17 (no unintended style changes)
5. **Device icons**: all three types (sensor, valve, plug) visible in mixed-device room
6. **Temperature panel**: 24h data displays; "No sensors" placeholder for sensor-less rooms
7. **Pie chart**: hover shows correct room + count; colors distinct

## Performance Considerations

- `api.device.temperatureHistory` queries in `RoomTemperaturePanel` fire per room — with 5 rooms that's 5 parallel queries, same pattern as before (room-group sparklines fire the same query). No change in request count or latency profile.
- Recharts `PieChart` at 80px height is lightweight — no concern.

## References

- PRD: `context/foundation/prd-v2.md`
- next-themes docs: https://github.com/pacocoursey/next-themes
- CSS vars in globals.css: `src/styles/globals.css:56–123`
- Existing sparkline pattern: `src/app/_components/room-group.tsx:20–50`
- Existing modal chart pattern: `src/app/_components/device-modal.tsx:301–423`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Theme Infrastructure

#### Automated
- [x] 1.1 `npm run typecheck` passes
- [x] 1.2 `npm run lint` passes

#### Manual
- [x] 1.3 Toggle button visible in header on all pages
- [x] 1.4 dark → light → dark cycle works
- [x] 1.5 No FOUC on refresh in light mode
- [x] 1.6 Background adapts (dark = near-black blobs; light = gray-50 subtle blobs)

### Phase 2: Light Mode Color Audit

#### Automated
- [ ] 2.1 `npm run typecheck` passes
- [ ] 2.2 `npm run lint` passes

#### Manual
- [ ] 2.3 Light mode: all text legible, cards white with gray border
- [ ] 2.4 Dark mode: appearance unchanged from pre-S-17

### Phase 3: Device Type Icons

#### Automated
- [ ] 3.1 `npm run typecheck` passes
- [ ] 3.2 `npm run lint` passes

#### Manual
- [ ] 3.3 Correct icon per device type in DeviceCard badge
- [ ] 3.4 Icons visible in both modes
- [ ] 3.5 Device table type column shows icon
- [ ] 3.6 No layout shift on device cards

### Phase 4: Temperature Overview Panel

#### Automated
- [ ] 4.1 `npm run typecheck` passes
- [ ] 4.2 `npm run lint` passes

#### Manual
- [ ] 4.3 Panel renders above room cards with room names
- [ ] 4.4 24h charts show data; "No sensors" placeholder for sensor-less rooms
- [ ] 4.5 Responsive: 1 col mobile / 2 tablet / 3 desktop
- [ ] 4.6 Theme-correct chart colors in both modes
- [ ] 4.7 Collapsible toggle works

### Phase 5: Pie Chart KPI Card

#### Automated
- [ ] 5.1 `npm run typecheck` passes
- [ ] 5.2 `npm run lint` passes
- [ ] 5.3 `npm run build` succeeds (full production build)

#### Manual
- [ ] 5.4 Donut chart renders with correct room distribution
- [ ] 5.5 Tooltip: room name + device count on hover
- [ ] 5.6 Chart segments use distinct colors
- [ ] 5.7 KPI row responsive on mobile and lg viewports
- [ ] 5.8 Chart colors adapt in both modes
