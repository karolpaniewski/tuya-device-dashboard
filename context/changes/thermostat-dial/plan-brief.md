# Thermostat Dial + Shared-Layout Transition — Plan Brief

> Full plan: `context/changes/thermostat-dial/plan.md`

## What & Why

Replace the device card's +/− setpoint buttons and the device modal's
linear slider with an interactive drag-to-rotate circular thermostat dial
(valve devices only), and make clicking a device card visually expand into
the modal instead of an instant pop-up. The PRD frames this explicitly as a
craft/quality-of-interaction pass — the existing controls work correctly,
but read as generic admin tooling rather than a premium product.

## Starting Point

Setpoint control exists today in two different interaction models: the
card's +/− buttons commit immediately on each click; the modal's slider
defers commit behind a separate "Set" button. The modal is a Base UI
Dialog that always opens centered with a generic fade — there's no
concept of "expand from element X," and no animation/gesture library is
installed in this codebase yet.

## Desired End State

A user drags the dial (compact on the card, larger in the modal) with
touch or mouse to set a valve's temperature, watching the background shift
from cool blue to warm orange, with the exact same 5–35°C clamp and 0.5°C
step the old controls enforced. Clicking any device card morphs it into
the full detail modal and back, respecting the user's reduced-motion
preference. Sensor/plug devices are unaffected except for gaining the
same expand/collapse transition.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Animation library | Framer Motion (`layoutId` shared layout) | Purpose-built for the card→modal morph, and its pan/drag primitives also solve the dial's gesture in the same dependency — consolidates two open decisions into one. | Plan |
| Dial rendering | SVG | Matches the codebase's existing SVG-based charting (Recharts) and CSS-variable-driven theming; composes naturally with Framer Motion. | Plan |
| Dial gesture capture | Framer Motion's pan primitives | No second gesture dependency once Framer Motion is already in the stack for the transition. | Plan |
| Base UI Dialog coexistence | Keep Base UI Dialog, layer Framer Motion on top | Preserves all of Base UI's existing focus-trap/Escape/backdrop accessibility work for free; only the visual layer changes. | Plan |
| Dial boundary behavior | Hard stop at 5°C/35°C | Matches today's button clamp exactly, and is more faithful to the PRD's own Nest-hardware reference than elastic give. | Plan |
| Rapid-click handling | Ignore clicks during in-flight transition | Simplest, lowest-risk; the ~300ms window is barely perceptible. | Plan |
| Reduced-motion detection | A shared `useReducedMotion` hook | Single source of truth, reused by both the dial's color transition and the card↔modal morph. | Plan |
| Testing scope | Unit-test only the pure angle/color math | Matches this project's own established convention (no React component tests exist anywhere; gesture-driven UI E2E is notoriously flaky). | Plan |

## Scope

**In scope:**
- A reusable `ThermostatDial` SVG component (compact + large sizes)
- Wiring it into the device card (replacing +/− buttons) and the device modal (replacing the slider + "Set" button), for valve devices
- Optional haptic tick on supported devices while dragging
- A Framer Motion shared-layout expand/collapse transition between every device card and its modal, for all device types
- A shared `prefers-reduced-motion` hook respected by both the dial and the transition

**Out of scope:**
- Dial-ifying any other control, or the transition on any other UI surface (room cards, settings cards, Map View)
- A full design-system animation overhaul
- Canvas rendering, elastic over-rotation, or Playwright E2E coverage of the gesture/transition itself

## Architecture / Approach

`framer-motion` is added as the one new dependency, covering both the
dial's drag gesture (via its pan primitives feeding new pure angle-math
functions) and the card↔modal transition (via `layoutId` shared-layout
animation). The card's own root element gets the `layoutId` — not the
outer dnd-kit-controlled wrapper, which already owns `transform`/
`transition` for drag-reorder and would conflict if targeted. The Base UI
Dialog primitive (`DialogContent`) gains an opt-in `layoutId` prop so only
`DeviceModal` opts into the morph behavior; every other dialog in the app
keeps its existing centered-fade default unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation | `framer-motion` dependency, pure angle/color math, reduced-motion hook — unit-tested, no UI | Low — pure functions, no integration surface yet |
| 2. Dial component + wiring | `ThermostatDial`, replacing old controls in both card and modal | Medium — immediate-commit drag UX must match existing mutation/error-revert behavior exactly |
| 3. Shared-layout transition | Card↔modal morph for all device types | Highest — Base UI Dialog coexistence, dnd-kit/Framer-Motion targeting, rapid-click debouncing |

**Prerequisites:** None beyond the current codebase — no external service signup, no new paid dependency.
**Estimated effort:** Fits within the PRD's 3-week after-hours budget; roughly one phase per multi-day work session, with Phase 3 likely the longest given its integration risk.

## Open Risks & Assumptions

- Framer Motion's `layoutId` animating an element that doesn't unmount (the card stays mounted, faded, while the modal is open) is a less common usage than the typical "list item → detail page" example — needs careful manual verification that opacity/visibility states don't get stuck.
- The opt-in `layoutId` prop added to the shared `DialogContent` primitive must be verified not to regress any other dialog in the app (Settings cards, room-move confirmation) — covered explicitly in Phase 3's manual verification.

## Success Criteria (Summary)

- Dragging the dial (card or modal) produces the exact same setpoint result, clamp, and step as the old controls, with a visible blue→orange color response.
- Clicking a device card morphs smoothly into its modal and back, respecting reduced-motion, without breaking any other dialog or dnd-kit's existing drag-reorder.
- Sensor and plug devices are functionally unchanged aside from the new transition.
