# Handoff: Tuya Device Dashboard Redesign

## Overview
A futuristic redesign of the **Tuya Device Control Center** — a smart-home IoT dashboard for monitoring and controlling sensors, radiator valves, smart plugs, and cameras across rooms. The redesign replaces the original flat dark UI with a glassmorphic "command center" aesthetic: deep-black canvas, neon-cyan accents, Swiss-grid data layout, live telemetry, and tactile controls.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype demonstrating intended look, layout, and behavior. **They are NOT production code to copy verbatim.** Your task is to **recreate this design inside the target app's existing environment** (React, Vue, SwiftUI, native, etc.) using its established component library, theming, routing, and data layer. If the app has no front-end framework yet, pick the most appropriate one and implement there. Wire all values (device counts, temps, power, statuses) to the real Tuya data source — the numbers shown are realistic sample data.

- `Tuya Control Center.dc.html` — the design prototype. Open in a browser to see it live. It is a self-contained streaming component; read the markup for exact structure, inline styles, and SVG charts.
- `original-dashboard-before.png` — screenshot of the OLD dashboard for before/after reference.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all specified below. Recreate the UI as closely as your component system allows; pull exact tokens from the "Design Tokens" section.

## Layout (single screen)
Full-viewport app shell, two columns:
- **Left rail** — fixed `74px` wide, vertical icon nav (logo mark, 4 nav glyphs, settings, user avatar). Glass background, `1px` right border. Active item has cyan fill + glow + a `3px` cyan indicator bar on its left edge.
- **Main column** — `flex:1`, padding `24px 30px 60px`, vertical stack with `18px` gaps, containing the sections below in order.

The page background is deep black `#05070c` with three layered radial-gradient glows (cyan top-right, violet bottom-left, emerald bottom-right) and one slow-drifting blurred cyan orb.

### Sections (top → bottom)
1. **Header** — Title "Device Control Center" + a green "SYSTEM NOMINAL" status pill; sub-line in mono: date · room count · device count. Right side: site selector pill ("All Sites"), a **live clock** (mono, updates every second), and a theme toggle button.
2. **KPI row** — CSS grid, `repeat(5, 1fr)`, `14px` gap. Five glass stat cards:
   - **Devices Online** — `24 / 26`, "+3" trend, cyan sparkline.
   - **Avg Temperature** — `21.4 °C`, range bar 18°–24° with a glowing thumb at current.
   - **Active Alerts** — `1` (rose-tinted card), "Space Heater · low battery", pulsing dot, "Review →" button.
   - **Rooms Healthy** — `3 / 3` (emerald-tinted), check icon, three emerald segment bars.
   - **Power Draw** — `1.84 kW`, "12.6 kWh today · €3.21", violet area sparkline.
3. **Climate + Side** — grid `1.95fr 1fr`, `14px` gap:
   - **Climate Overview** (left, large) — glass card with a multi-series SVG line chart (3 rooms: Living Room=cyan w/ area fill, Kitchen=emerald, Bedroom=violet), y-axis 18–24°, x-axis time labels (12h window), gridlines, "LIVE" pill, legend with current temps, animated shimmer sweep, pulsing "now" endpoint marker.
   - **Side column** (right) — two stacked cards:
     - **Devices by Room** donut (SVG, 3 segments: Living Room 12 / Kitchen 8 / Bedroom 6 = 26 total), center label, legend list.
     - **Automations** — 3 rows (Morning Warm-up, Away · Eco Mode, Night Setback) each with an icon chip, name, schedule (mono), and an on/off toggle.
4. **Devices** — section header ("Devices" + mono count), a toolbar (search field, type filter chips: All/Sensors/Valves/Plugs, status segmented control: All/Online/Offline), then a grid `repeat(4, 1fr)`, `14px` gap, of 8 device cards:
   - 2× **Sensor** cards (Living Room, Bedroom): big temp value, % RH, sparkline, battery bar.
   - 2× **Valve** cards (Radiator LR/BR): circular SVG gauge showing % open, target + current temp.
   - 2× **Plug** cards (TV, Desk): watts, kWh today, **interactive ON/OFF toggle**.
   - 1× **Plug · Space Heater** — OFFLINE state (rose dot/pulse, "OFFLINE" tag, dimmed, disabled toggle, "battery low · 11%").
   - 1× **Camera** (Hallway): striped placeholder feed with "REC" badge, resolution, "VIEW →".
5. **Toast** (fixed, bottom-left) — rose alert: "1 device needs attention · Space Heater · low battery & offline", Dismiss action.

## Interactions & Behavior
- **Live clock**: `setInterval` 1s, formats `HH:MM:SS` (24h).
- **Plug toggles** (TV, Desk): clicking flips ON/OFF — track turns cyan with glow, knob slides `20px` right, label switches color/text. Transition `.25s cubic-bezier(.4,0,.2,1)`.
- **Filter chips** (All/Sensors/Valves/Plugs): clicking sets active visual state (cyan fill+border). In the prototype these are visual-only; **in production, wire them to actually filter the device grid** by device type.
- **Status segmented control** (All/Online/Offline): same — active segment highlighted; **wire to filter by online status in production**.
- **Hover states**: device cards and KPI cards brighten their border to `rgba(34,211,238,0.35)` on hover; rail items get a faint white bg.
- **Ambient animations**: pulsing live/status dots (`pulse` 2s), climate-card shimmer sweep (`sweep` 7s), background orb drift (`drift` 18s).
- **Tweakable props** (exposed in the prototype, optional in production): `showAutomations` (bool), `liveAnimation` (bool, gates the pulse animations), `siteLabel` (string).

## State Management
- `time: string` — current clock, ticked every 1s.
- `plugs: { tv: boolean, desk: boolean }` — toggle states.
- `filter: 'all' | 'sensor' | 'valve' | 'plug'` — active type filter.
- `status: 'all' | 'online' | 'offline'` — active status filter.
- Production additionally needs: device list (id, name, type, room, online, primary value/unit, secondary metric, battery, power, kWh, valve %, target/current temp, sparkline series), per-room temperature time-series for the climate chart, room→device counts for the donut, automations list, and an alerts list.

## Design Tokens
**Colors**
- Canvas bg: `#05070c`
- Glass card: `linear-gradient(155deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))`, border `1px solid rgba(255,255,255,0.08)`
- Text primary: `#f4f7fa`; secondary: `#cdd6df` / `#aeb8c2`; muted: `#8b96a3`; faint/mono labels: `#5d6876` / `#7a8694`
- Accent cyan: `#22d3ee` (dark variant `#0891b2`, `#0e7490`)
- Emerald (online/healthy): `#34d399`
- Violet (secondary series/power): `#a78bfa` (dark `#6d28d9`)
- Amber (valves/warm): `#fbbf24`
- Rose (alerts/offline): `#fb7185`
- Glow pattern: `box-shadow: 0 0 8–22px rgba(<accent>, 0.3–0.6)` on dots, knobs, logo.

**Typography**
- Display/UI: **Space Grotesk** (400/500/600/700). H1 `26px/700`, section H2 `15–18px/600`, big stat numbers `34–38px/700` with `letter-spacing:-0.03em`, body `12–13px`.
- Data/labels/timestamps: **JetBrains Mono** (`.mono` class), `9–15px`, letter-spacing `0.04–0.08em`, often uppercase.

**Spacing & shape**
- Card padding: KPI/device `17–18px`, large panels `20–22px`.
- Radii: cards `18–20px`, chips/buttons `8–12px`, pills `999px`, inner tiles `9–13px`.
- Grid gaps: `14px` (cards), `18px` (main sections).
- Toggle: track `44×24px` r12, knob `18px` circle, `20px` travel.

**Charts** are inline SVG (line/area with gradient fills, donut via `stroke-dasharray` on circles, radial valve gauges, sparkline polylines). Recreate with your charting lib (Recharts, visx, Chart.js, native SVG) keeping the same colors and stroke widths (`2–2.4px` lines, rounded joins/caps).

## Assets
- No raster assets required. All icons are simple geometric SVGs (squares, circles, diamonds) — replace with your icon set's equivalents (grid/dashboard, rooms, devices, alerts, settings).
- Camera feed is a CSS striped placeholder — swap for the real video/snapshot stream.
- Fonts loaded from Google Fonts (Space Grotesk, JetBrains Mono) — use your app's font pipeline.

## Files
- `Tuya Control Center.dc.html` — the hi-fi design prototype (open in browser; read source for exact markup/styles/SVG).
- `original-dashboard-before.png` — the previous dashboard, for before/after context.
