# Handoff: Temperature Dial (modern thermostat knob)

## Overview
An interactive, dark-themed temperature control dial for a desktop/web climate app.
The user sets a target temperature by dragging the circular dial or scrolling the
mouse wheel. The dial's color shifts along a "comfort gradient" (cool blue → sage
green at ~20° → warm amber) and a glowing handle marks the current value. Three mode
pills (Cool / Auto / Heat) and a status line round out the control.

## About the Design Files
The file in this bundle (`Temperature Dial.dc.html`) is a **design reference created
in HTML** — a working prototype showing the intended look and behavior. It is **not
production code to copy directly**. It uses an internal "Design Component" runtime
(`<helmet>`, atomic utility classes, a `Component extends DCLogic` class) that will
**not** exist in your codebase.

Your task is to **recreate this design in the target codebase's existing environment**
(React, Vue, Svelte, SwiftUI, etc.) using its established patterns, component
primitives, and styling approach. If no environment exists yet, pick the most
appropriate framework and implement it there. The geometry/math below is the part
worth copying verbatim; the rest should be expressed idiomatically in your stack.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, geometry, and interaction
model are specified. Recreate pixel-faithfully, substituting your codebase's primitives
where sensible (e.g. your own Button component for the mode pills).

## Screens / Views

### Single view — Temperature Dial
- **Purpose**: Let the user set a target temperature and HVAC mode.
- **Layout**: Full-height dark scene, vertically + horizontally centered column,
  `gap: 24px` between groups, `padding: 48px 24px`. Top to bottom:
  1. **Header** (centered column, `gap: 8px`): kicker label + room name.
  2. **Dial** (relative box `460 × 460px`): ambient glow layer, the SVG dial, and a
     centered text overlay (absolute, `inset: 0`, `pointer-events: none`).
  3. **Mode pills** (horizontal row, `gap: 8px`).
  4. **Hint text**.

#### Components

**Kicker label** — text "Set temperature"
- 11px, weight 600, `letter-spacing: .24em`, uppercase, color `rgba(255,255,255,.38)`.

**Room name** — text (default "Living Room")
- 15px, weight 600, `letter-spacing: .01em`, color `rgba(255,255,255,.9)`.

**The dial (SVG)** — `viewBox="0 0 360 360"`, rendered at `460 × 460px`, `touch-action: none`, `cursor: grab` (`grabbing` while active).
- All arcs are centered at (180, 180), radius **R = 138**, `stroke-width: 11`, `stroke-linecap: round`, `fill: none`.
- The active range is a **300° arc with a 60° gap at the bottom**. Using a polar
  convention where 0° = top and angle increases clockwise:
  - `polar(angleDeg, r)` → `x = 180 + r·cos((angle−90)·π/180)`, `y = 180 + r·sin(...)`.
  - Track arc spans **210° → 510°** (i.e. bottom-left, clockwise through left/top/right, to bottom-right).
  - Min temp sits at 210° (bottom-left), max at 510°/150° (bottom-right).
  - Arc path helper:
    ```
    arc(a0, a1, r):
      p0 = polar(a0, r); p1 = polar(a1, r)
      large = (a1 - a0) > 180 ? 1 : 0
      return `M${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`   // sweep=1 (clockwise)
    ```
- **Track**: `arc(210, 510, 138)`, stroke `rgba(255,255,255,.07)`.
- **Tick marks** (33 ticks, optional/toggleable): for `i` in `0..32`,
  `frac = i/32`, `ang = 210 + frac·300`. Each tick is a line from `polar(ang, 150)`
  to `polar(ang, 161)`, `stroke-width: 2`, round caps. Ticks at or below the current
  fraction use the live `color`; the rest use `rgba(255,255,255,.10)`.
- **Active arc**: `arc(210, 210 + f·300, 138)` (empty string when `f ≤ 0`),
  `stroke = color`, `filter: drop-shadow(0 0 9px <glow>)`, `transition: stroke .25s ease`.
- **Handle**: at `polar(210 + f·300, 138)`:
  - Halo ring: `circle r=19`, `fill:none`, `stroke=color`, `stroke-width:2`, `opacity:.28`.
  - Dot: `circle r=11`, `fill:#fff`, `filter: drop-shadow(0 0 7px <glow>)`.

**Ambient glow** — absolute layer behind the SVG, `inset: -30px`, `border-radius: 50%`,
`filter: blur(46px)`, `opacity: .32`, `background: radial-gradient(circle, <glow> 0%, transparent 68%)`, `transition: background .3s ease`.

**Center overlay** (centered column, `pointer-events: none`):
- **Number**: `tempStr` (e.g. "20.0"), Space Grotesk, weight 300, **88px**, `line-height: .9`, `letter-spacing: -.02em`, `font-variant-numeric: tabular-nums`, color `#fff`, `transition: color .25s ease`.
- **Degree glyph** "°": Space Grotesk, weight 300, 40px, `margin-top: 6px`, `opacity: .85`.
- **Unit**: "Celsius" / "Fahrenheit", 13px, weight 600, `letter-spacing: .22em`, uppercase, color `rgba(255,255,255,.42)`, `margin-top: 14px`.
- **Status**: e.g. "Auto · 20.0°", 12px, weight 600, `letter-spacing: .16em`, uppercase, color `rgba(255,255,255,.5)`, `margin-top: 8px`.

**Mode pills** — 3 buttons: "Cool", "Auto", "Heat".
- Base: `background: rgba(255,255,255,.05)`, color `rgba(255,255,255,.55)`, 13px weight 600, padding `10px 22px`, `border-radius: 999px`, no border.
- Hover: `background: rgba(255,255,255,.09)`, color `rgba(255,255,255,.8)`.
- Active (selected): `background: rgba(255,255,255,.95)`, color `#16181a`.

**Hint text** — "Drag the dial or scroll to adjust", 11px, weight 500, `letter-spacing: .06em`, color `rgba(255,255,255,.28)`.

## Interactions & Behavior
- **Drag to set**: on pointer-down on the SVG, capture the dial's center
  (`rect.left + width/2`, `rect.top + height/2`), then on every pointer-move compute
  the angle from center: `ang = atan2(dx, -dy)·180/π`, normalized to `[0,360)`.
  Map angle → fraction `f`:
  - If `150 < ang < 210` (the bottom dead-zone): snap to `f = 1` when `ang < 180`, else `f = 0`.
  - Else `pos = ang ≥ 210 ? ang − 210 : ang + 150`; `f = pos / 300`.
  - `temp = min + f · range`, then clamp + round to nearest **0.5**.
  - Attach `pointermove`/`pointerup` listeners on `window` during the drag; remove on up.
- **Scroll to adjust**: `wheel` handler, `preventDefault()`, `deltaY < 0` → +0.5, else −0.5.
- **Mode select**: clicking a pill sets the active mode; updates status text:
  - heat → `Heating to <t>°`, cool → `Cooling to <t>°`, auto → `Auto · <t>°`.
- **Transitions**: stroke color, number color, glow background all ease ~.25–.3s.
- No loading/error/validation states — value is always clamped in range.

## State Management
- `temp: number` — target temperature in **Celsius internally** (default 20). Fahrenheit
  is a display conversion only: `tempStr = unit==='Fahrenheit' ? (t·9/5+32) : t`, shown to 1 decimal.
- `mode: 'cool' | 'auto' | 'heat'` — default `'auto'`.
- During drag: transient `cx`/`cy` (dial center) and window listeners; no persisted state.

### Derived values (recompute on each render)
- `f = clamp01((temp - min) / range)`
- `hue = 230 - f·205`  → `color = oklch(0.75 0.13 <hue>)`, `glow = oklch(0.72 0.17 <hue>)`
- arc paths, handle position, tick array, status text (see above).

## Design Tokens
**Colors**
- Scene background: `radial-gradient(120% 120% at 50% 0%, #1b1e21 0%, #121416 60%, #0e1011 100%)`
- Primary text: `#e8eaec`; pill-active text / dark fg: `#16181a`
- Text alphas (on white): `.9` room, `.55`/`.8` pill, `.5` status, `.42` unit, `.38` kicker, `.28` hint, `.10`/`.07` track & off-ticks
- Handle dot: `#fff`
- **Dynamic dial color**: `oklch(0.75 0.13 H)` where `H = 230 − f·205`
  (H≈230 cool blue at min → H≈162 sage green at 20° → H≈25 warm amber at max)
- **Dynamic glow**: `oklch(0.72 0.17 H)` (same H, higher chroma)

**Geometry**
- Dial render size: 460px; viewBox 360; center (180,180); R=138; stroke 11
- Arc sweep: 300° active, 60° bottom gap (210°→510°)
- Handle: dot r=11, halo r=19; ticks r 150→161, 33 ticks
- Temperature range default 15–30°C, step 0.5; tunable min 5–20, max 25–40

**Spacing**: scene padding `48px 24px`; group gaps 8/16/24px; pill padding `10px 22px`

**Radius**: pills `999px`; glow/halo circular

**Typography**
- Display number + degree: **Space Grotesk**, weight 300, tabular-nums
- All UI text: **Manrope** (fallback `system-ui, sans-serif`), weights 500–700
- Sizes: number 88, degree 40, room 15, pill 13, unit 13, status 12, kicker 11, hint 11

**Shadows / filters**: active arc `drop-shadow(0 0 9px glow)`; handle `drop-shadow(0 0 7px glow)`; ambient glow `blur(46px)` @ opacity .32

## Configurable props (exposed in the prototype)
- `roomName` (string, default "Living Room")
- `unit` (enum: "Celsius" | "Fahrenheit", default Celsius — display only)
- `minTemp` (int, default 15; range 5–20)
- `maxTemp` (int, default 30; range 25–40)
- `showTicks` (boolean, default true)

## Assets
None. No images or icon files — all visuals are CSS/SVG. Fonts load from Google Fonts
(Manrope, Space Grotesk); swap for your codebase's font pipeline if needed.

## Files
- `Temperature Dial.dc.html` — the full interactive prototype (reference implementation;
  contains the exact arc math, color mapping, and pointer/wheel handlers described above).
