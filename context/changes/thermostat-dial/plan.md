# Thermostat Dial + Shared-Layout Transition Implementation Plan

## Overview

Replace the device card's +/− setpoint buttons and the device modal's linear
slider with an interactive circular thermostat dial (valve devices only),
and make clicking a device card visually expand into the modal instead of
mounting an instant dialog. Both ship together, per the PRD's Primary
success criterion. This is a pure visualization/interaction change — no
domain logic, no backend, no data model changes.

## Current State Analysis

- Setpoint control exists in two places today, with two different
  interaction models: `device-card.tsx`'s `SetpointControl` (lines 34-91)
  is a compact +/− button pair with immediate-commit behavior (each click
  mutates right away). `device-modal.tsx`'s valve setpoint block (lines
  187-220) is a linear `<input type="range">` with **deferred commit** — it
  holds a local `setpointInput` string and only mutates when the user
  clicks the separate "Set" button. The new dial needs to behave like the
  card's immediate-commit model in both places; the modal's "Set" button
  and `setpointInput`/`handleSetpoint` state become unnecessary once the
  dial is wired in for valve devices.
- The device modal is a Base UI `Dialog` (`device-modal.tsx:39-45`,
  wrapping `DialogContent` from `src/components/ui/dialog.tsx:28-58`).
  `DialogContent`'s `Popup` is **always centered** via hardcoded
  `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` plus a
  generic scale/opacity fade driven by Base UI's own
  `data-[starting-style]`/`data-[ending-style]` attributes. It has no
  concept of "expand from element X" — and `DialogContent` is shared by
  every dialog in the app (Settings cards, room-move confirmation, etc.),
  so its centering behavior cannot simply be removed without affecting
  every other dialog.
- The modal is rendered as a sibling at the end of `device-overview.tsx`'s
  tree (`device-overview.tsx:1091-1098`, conditional on `selectedDevice`),
  not nested inside the card tree. The card itself lives several levels
  deep: `RoomGroup` → `SortableDeviceCard` → `DeviceCard`.
- `SortableDeviceCard` (`sortable-device-card.tsx:27-40`) already fully
  owns its outer `<div>`'s `transform`/`transition` inline styles via
  `@dnd-kit/sortable`'s `useSortable`, for drag-reorder. Applying Framer
  Motion's `layoutId` to that same element would fight dnd-kit for control
  of the same CSS properties. `DeviceCard`'s own root `<div>`
  (`device-card.tsx:226-238`) is a separate, untouched element one level
  in — that's the correct target for the shared-layout `layoutId`.
- No animation/gesture library is installed (`framer-motion` confirmed
  absent from `package.json`; current published version is `12.41.0`).
  `@dnd-kit` is translate-based drag-and-drop, not rotation/angle-from-
  center — it doesn't help with the dial's gesture.
- No `prefers-reduced-motion` precedent exists anywhere in this codebase
  (only an unrelated dark-mode `matchMedia` check in `layout.tsx:44`).
- No React component tests exist anywhere in this codebase — only
  pure-function tests (e.g. `src/lib/sparkline-data.test.ts`,
  `src/lib/map-coordinates.test.ts`) and tRPC router tests. This matches
  the PRD's own testing-scope decision: unit-test the pure math, verify
  the gesture/visual behavior manually.

### Key Discoveries:

- `device-card.tsx:217` already computes `supportsSetpoint = deviceType === "valve" && device.setpointC !== null` — the existing gate for when a setpoint control renders. The dial reuses this exact condition.
- `device-modal.tsx:76-84`'s existing `setpoint` mutation already does optimistic local-state update on success (`setOptimisticSetpoint(r.setpointC)`) and toast-based error feedback (`onError: (e) => toast.error(e.message)`) — the dial's error handling should produce the same toast, not a new error UX.
- `device-card.tsx:46-55`'s `SetpointControl` mutation reverts local state on error (`onError: () => setLocalSetpoint(initialSetpoint)`) — the dial must do the same: snap back to the last-known value, not stay at the failed drag position.
- CSS custom properties (`var(--cc-*)`) are used pervasively for theming (`device-card.tsx` alone references `--cc-cyan`, `--cc-amber`, `--cc-emerald`, `--cc-rose`, `--cc-text-*`) — the dial's blue/orange gradient stops should follow this same convention rather than hardcoded hex values.

## Desired End State

A user can drag the thermostat dial (on the card, compact; in the modal,
larger) with touch or mouse to set a valve's temperature, seeing the
background shift from cool blue to warm orange as they turn it, with the
exact same 5–35°C clamp and 0.5°C step the old controls enforced. Clicking
any device card visually expands it into the full detail modal instead of
an instant pop-up, and closing the modal reverses the animation back into
the card. Users with `prefers-reduced-motion` enabled get instant
transitions and immediate color changes instead of animated ones. Sensor
and plug device cards are functionally unaffected, gaining only the
expand/collapse transition.

**Verification:** drag the dial on a valve's card and in its modal; confirm
the resulting setpoint matches the dragged position exactly and persists
across a page reload; confirm a failed setpoint update snaps the dial back
and shows the existing error toast; confirm the card→modal transition runs
in both directions and respects reduced-motion; confirm rapid double-clicks
on different cards don't produce a visually broken transition; confirm
sensor/plug cards and their modals are otherwise unchanged.

## What We're NOT Doing

- No dial-ification of any other control (humidity thresholds, automation
  schedule times, etc.) — scoped strictly to the device setpoint control.
- No shared-layout transition for any other UI surface (room cards,
  settings cards, the Map View's device nodes) — scoped strictly to the
  device card ↔ device modal pair.
- No full design-system animation overhaul — other existing transitions
  (toasts, dropdowns, other dialogs) are untouched.
- No Canvas-based rendering for the dial — SVG only, per the architecture
  decision.
- No elastic/over-rotation behavior past the 5–35°C boundary — hard stop
  only, matching the existing buttons' clamp and the PRD's own Nest
  reference (real Nest hardware has a hard mechanical limit).
- No Playwright E2E coverage of the drag gesture or the visual transition
  itself — manual verification only, matching this project's established
  convention for gesture-driven interactions.
- No changes to sensor/plug device behavior beyond gaining the expand/
  collapse transition — their modal content and card layout are untouched.

## Implementation Approach

Three phases, each independently shippable: (1) pure math + the new
dependency, fully unit-tested, no UI; (2) the dial component wired into
both existing control surfaces, replacing the old controls for valve
devices; (3) the harder shared-layout transition, wired in last since it
touches every device type and has the most integration risk (Base UI
Dialog coexistence, the dnd-kit/Framer-Motion targeting concern, rapid-
click debouncing). This mirrors the project's established "foundation →
component → riskiest integration last" pattern.

## Critical Implementation Details

**Framer Motion / dnd-kit coexistence**: Apply `layoutId` (and any
`motion.div` wrapper needed for the shared-layout animation) to
`DeviceCard`'s own root `<div>` (`device-card.tsx:226`), never to
`SortableDeviceCard`'s wrapper (`sortable-device-card.tsx:28`). The latter
already owns `transform`/`transition` via dnd-kit's `useSortable` for
drag-reorder — letting Framer Motion's layout animation target the same
element will fight dnd-kit for control of the same CSS properties.

**Base UI Dialog positioning override**: `DialogContent`
(`src/components/ui/dialog.tsx:28-58`) hardcodes centered fixed
positioning for every dialog in the app. Do not modify this shared
primitive's default behavior. `DeviceModal` needs its own positioning path
for the `Popup` when the shared-layout animation is active (e.g. an
opt-in prop on `DialogContent`, or a parallel non-centered render path
used only by `DeviceModal`) so other dialogs (Settings cards, room-move
confirmation, etc.) keep their existing centered-fade behavior unchanged.

**Card stays mounted during the transition**: Framer Motion's `layoutId`
matches elements with the same id across the tree, but the card does not
unmount when the modal opens (it must still be in the DOM for the close
animation to morph back into). The standard pattern: keep the card
mounted but fade its opacity to 0 while the modal (sharing its
`layoutId`) is open, and restore it on close — not a literal unmount/
remount of the card.

## Phase 1: Foundation — dial math, color interpolation, reduced-motion hook

### Overview

Add `framer-motion`, and build the pure, unit-tested building blocks every
later phase depends on: converting a pointer's angle around the dial's
center into a clamped setpoint value (and back), interpolating a setpoint
into a blue→orange color, and a shared hook for detecting the user's
reduced-motion preference. No UI changes in this phase.

### Changes Required:

#### 1. Add the `framer-motion` dependency

**File**: `package.json`

**Intent**: Bring in the library chosen for both the dial's drag gesture
and the card↔modal shared-layout transition.

**Contract**: Add `framer-motion` (`^12.41.0`) to `dependencies`. Run the
project's install command to update the lockfile.

#### 2. Dial angle/setpoint math

**File**: `src/lib/dial-math.ts` (new)

**Intent**: Isolate the one piece of genuinely new math — converting a
drag gesture's position relative to the dial's center into a setpoint
value, and the inverse (setpoint → angle, for rendering the dial's initial
rotation) — as pure functions, independently testable without mounting
any component or simulating a pointer event.

**Contract**: Export `angleToSetpoint(angleDeg: number, min: number, max: number, step: number): number`, mapping a 0–360° angle to a clamped, step-rounded value in `[min, max]`. Export the inverse `setpointToAngle(value: number, min: number, max: number): number`. Export `pointerToAngle(pointerX: number, pointerY: number, centerX: number, centerY: number): number` computing the angle (0–360°) of a pointer position relative to a center point — this is the one function with a non-obvious contract (uses `Math.atan2`, normalizes the result to a consistent 0–360° range starting from a defined "12 o'clock = minimum value" orientation matching the PRD's Nest-inspired framing).

#### 3. Setpoint → color interpolation

**File**: `src/lib/dial-math.ts` (same file)

**Intent**: Map a setpoint value to the blue→orange gradient color described in the PRD, as a pure function.

**Contract**: Export `setpointToColor(value: number, min: number, max: number): string`, returning a CSS color (e.g. an `oklch()` or `hsl()` interpolation between a defined cool-blue and warm-orange stop) proportional to where `value` sits in `[min, max]`. Use existing `--cc-*` custom-property values as the interpolation endpoints where a suitable pair exists, or define two new custom properties in `globals.css` following the same naming convention if not.

#### 4. Reduced-motion hook

**File**: `src/lib/use-reduced-motion.ts` (new)

**Intent**: One shared, SSR-safe source of truth for the user's reduced-motion preference, reused by both the dial's color transitions and the shared-layout transition in Phase 3.

**Contract**: Export `useReducedMotion(): boolean`, wrapping `window.matchMedia('(prefers-reduced-motion: reduce)')` with a safe initial value when `window` is unavailable (SSR), and a change-listener so the value updates live if the user toggles the OS setting while the app is open.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` (Biome) passes
- [ ] New unit tests pass: `angleToSetpoint` / `setpointToAngle` round-trip and clamping behavior (in-range, below-min, above-max, step-rounding)
- [ ] New unit tests pass: `pointerToAngle` against known geometric positions (12/3/6/9 o'clock equivalents)
- [ ] New unit tests pass: `setpointToColor` returns the cool-blue stop at `min`, the warm-orange stop at `max`, and an intermediate value at the midpoint
- [ ] `npm run test` passes (no regressions)

#### Manual Verification:

- [ ] `framer-motion` installs cleanly and the app still builds/runs with no console errors introduced

## Phase 2: Thermostat dial component, wired into card and modal

### Overview

Build the `ThermostatDial` component and replace the existing +/− buttons
(card) and slider (modal) with it, for valve devices only. Includes the
optional haptic tick.

### Changes Required:

#### 1. `ThermostatDial` component

**File**: `src/app/_components/thermostat-dial.tsx` (new)

**Intent**: A reusable circular dial, rendered at two sizes (compact for the card, large for the modal), that the user drags with touch or mouse to set a value, calling the Phase 1 math functions and respecting the reduced-motion hook for its color transition.

**Contract**: `ThermostatDial({ value, min, max, step, size, disabled, onChange }: { value: number | null; min: number; max: number; step: number; size: "compact" | "large"; disabled?: boolean; onChange: (next: number) => void })`. Renders an SVG circle/arc with a draggable handle, using Framer Motion's pan gesture (`onPan` or `useMotionValue` + `onPan`) to feed `pointerToAngle` → `angleToSetpoint`, calling `onChange` on each committed step change during the drag (immediate-commit, matching the card's existing model — not deferred to a separate "Set" action). The dial's fill color uses `setpointToColor`; when `useReducedMotion()` is true, color changes apply immediately (no CSS transition) instead of animating. Hard-stops at `min`/`max` — no rotation past the boundary regardless of how far the pointer travels beyond it. On a supported device (`'vibrate' in navigator`), calls `navigator.vibrate(<short duration>)` once per `step` increment crossed during the drag (skipped entirely if unsupported — no fallback needed, this is nice-to-have only).

#### 2. Wire into the device card

**File**: `src/app/_components/device-card.tsx`

**Intent**: Replace `SetpointControl`'s +/− buttons with the compact `ThermostatDial` for valve devices, keeping the exact same mutation, optimistic-update, and error-revert behavior `SetpointControl` already has.

**Contract**: Inside the existing `supportsSetpoint` branch (`device-card.tsx:310-319`), render `<ThermostatDial size="compact" value={displayed} min={5} max={35} step={0.5} onChange={...} />` in place of the `−`/`+` `Button` pair, calling the same `api.device.setpoint.useMutation` already defined in `SetpointControl` on each `onChange`. Remove the now-unused `Button` import if nothing else in this file still needs it (check `PlugToggle` and other usages first).

#### 3. Wire into the device modal

**File**: `src/app/_components/device-modal.tsx`

**Intent**: Replace the valve setpoint slider + "Set" button with the large `ThermostatDial`, removing the now-unnecessary deferred-commit state.

**Contract**: Replace the block at `device-modal.tsx:187-220` with `<ThermostatDial size="large" value={optimisticSetpoint} min={5} max={35} step={0.5} onChange={...} />`, wiring `onChange` directly to the existing `setpoint` mutation (`device-modal.tsx:76-84`) the same way the card does. Remove `setpointInput`, `setSetpointInput`, `handleSetpoint`, and the "Set" `Button` — they become dead code once the dial commits immediately on drag, matching the card's interaction model.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` (Biome) passes
- [ ] `npm run test` passes (no regressions)
- [ ] `npm run build` succeeds

#### Manual Verification:

- [ ] Dragging the card's compact dial (touch and mouse) changes a valve's setpoint, matches the 5–35°C clamp and 0.5°C step, and the resulting value persists across a page reload
- [ ] Dragging the modal's large dial produces the same result, with the "Setpoint" reading card in the modal's Overview tab updating to match
- [ ] The dial's background shifts from cool blue to warm orange as the value increases, on both sizes
- [ ] A failed setpoint update (simulate by triggering an error in the mutation) snaps the dial back to the last-known value and shows the existing error toast — not a silently stuck dial
- [ ] Sensor and plug device cards/modals are visually and functionally unchanged
- [ ] With the OS/browser reduced-motion setting enabled, the dial's color changes apply instantly with no animation

## Phase 3: Shared-layout card→modal transition

### Overview

Wire Framer Motion's `layoutId` shared-layout animation between the device
card and the device modal, for all device types, respecting reduced-
motion and debouncing rapid clicks during the in-flight transition.

### Changes Required:

#### 1. Card-side `layoutId` and visibility handling

**File**: `src/app/_components/device-card.tsx`

**Intent**: Make the card participate in the shared-layout animation, and fade out (not unmount) while its corresponding modal is open, per the Critical Implementation Details note above.

**Contract**: Add a `motion.div` (Framer Motion) as `DeviceCard`'s root element (replacing the plain `<div>` at `device-card.tsx:226`), with `layoutId={`device-card-${device.id}`}`. Accept a new prop (e.g. `isExpanded?: boolean`) that fades the card's opacity to 0 while its modal is open, restoring it on close. Preserve all existing props/styling/click-handling on this element unchanged.

#### 2. Modal-side `layoutId` and Base UI Dialog positioning override

**File**: `src/app/_components/device-modal.tsx`, `src/components/ui/dialog.tsx`

**Intent**: Make the modal's popup share the card's `layoutId` and grow from the card's position instead of Base UI's default centered-fade, without changing any other dialog's behavior in the app.

**Contract**: Add an opt-in prop to `DialogContent` (e.g. `layoutId?: string`) that, when present, renders the `Popup` as a `motion.div` with that `layoutId` and skips the hardcoded centering classes — falling back to today's centered-fade behavior when the prop is absent, so every other dialog in the app (Settings, room-move confirmation, etc.) is unaffected. `DeviceModal` passes `layoutId={`device-card-${device.id}`}` through to `DialogContent`.

#### 3. Click-debounce during in-flight transition

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Prevent a second card click from interrupting an in-flight transition, per the resolved edge-case decision.

**Contract**: Track a brief "transition in flight" boolean (set on card click, cleared after the transition's fixed duration, e.g. via `onAnimationComplete` if Framer Motion exposes it for this animation, or a matching `setTimeout`) and ignore additional card clicks while it's true. The transition duration is capped at well under a third of a second per the PRD's guardrail.

#### 4. Reduced-motion respected for the transition

**File**: `src/app/_components/device-modal.tsx` (or wherever the `layoutId` `motion.div` is configured)

**Intent**: When `useReducedMotion()` is true, the modal should appear/disappear instantly at its centered position (today's default Base UI behavior) rather than morphing from the card.

**Contract**: When the reduced-motion hook reports `true`, skip passing `layoutId` through (or pass a Framer Motion transition config with `duration: 0`), so the existing Base UI centered-fade takes over instead of the shared-layout morph.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` (Biome) passes
- [ ] `npm run test` passes (no regressions)
- [ ] `npm run build` succeeds

#### Manual Verification:

- [ ] Clicking any device card visually expands it into the modal at the card's former position/size, for all three device types
- [ ] Closing the modal reverses the animation back into the originating card, and the card is fully visible again afterward (not stuck faded)
- [ ] The modal's other content (History tab, temperature chart, room assignment) works exactly as before once the transition completes
- [ ] Rapidly clicking a different card while one is mid-transition does not produce a visually broken state (card stuck invisible, modal stuck mid-animation, etc.)
- [ ] With the OS/browser reduced-motion setting enabled, the modal opens/closes instantly at its centered position instead of morphing
- [ ] Every other dialog in the app (a Settings card, the room-move confirmation) still opens/closes with its original centered-fade behavior, unaffected by this change
- [ ] Drag-and-drop reordering of device cards (existing dnd-kit behavior) still works exactly as before

## Testing Strategy

### Unit Tests:

- `angleToSetpoint` / `setpointToAngle` — round-trip correctness, clamping at `min`/`max`, step-rounding.
- `pointerToAngle` — known geometric angle positions resolve correctly.
- `setpointToColor` — endpoint and midpoint interpolation correctness.

### Integration Tests:

- None planned — this is a pure frontend interaction/animation change with no new backend surface; the existing `device.setpoint` mutation and its tests are unchanged and unaffected.

### Manual Testing Steps:

1. Open the dashboard; drag a valve's card-level dial through its full range; confirm the displayed value, the background color, and the persisted setpoint after a reload all match the dragged position.
2. Click that valve's card; confirm it visually expands into the modal; drag the modal's larger dial; confirm the same setpoint result and color behavior; close the modal and confirm it morphs back into the card.
3. Trigger a setpoint mutation failure (e.g. temporarily disconnect the device or simulate a server error) while dragging; confirm the dial snaps back and the existing error toast appears.
4. Enable the OS/browser's reduced-motion setting; repeat steps 1–2; confirm color changes and the modal open/close are instant, not animated.
5. Click two different device cards in quick succession; confirm no visually broken intermediate state.
6. Open a Settings card and the room-move confirmation dialog; confirm both still use their original centered-fade behavior.
7. Drag-reorder a couple of device cards; confirm dnd-kit's existing behavior is unaffected.
8. Open a sensor and a plug device's card and modal; confirm both are functionally unchanged aside from the expand/collapse transition.

## Performance Considerations

The dial's drag handling should use Framer Motion's motion values (which update outside React's render cycle) rather than `useState` for the high-frequency pointer-move updates, committing to the `setpoint` mutation only on meaningful step changes (not on every pixel of pointer movement) to avoid flooding the mutation with requests during a single drag gesture.

## Migration Notes

Not applicable — no data model or backend changes.

## References

- PRD: `context/foundation/prd.md` (v1) — thermostat-dial change
- Stack assessment: `context/foundation/stack-assessment.md`
- Existing immediate-commit setpoint pattern: `src/app/_components/device-card.tsx:34-91`
- Existing deferred-commit setpoint pattern (being replaced): `src/app/_components/device-modal.tsx:187-220`
- Existing Base UI Dialog primitive: `src/components/ui/dialog.tsx`
- dnd-kit sortable wrapper (do not target with layoutId): `src/app/_components/sortable-device-card.tsx`
- Existing pure-function + unit test convention: `src/lib/sparkline-data.ts`, `src/lib/map-coordinates.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — dial math, color interpolation, reduced-motion hook

#### Automated

- [x] 1.1 `npm run typecheck` passes
- [x] 1.2 `npm run lint` (Biome) passes
- [x] 1.3 `angleToSetpoint` / `setpointToAngle` unit tests pass
- [x] 1.4 `pointerToAngle` unit tests pass
- [x] 1.5 `setpointToColor` unit tests pass
- [x] 1.6 `npm run test` passes

#### Manual

- [ ] 1.7 `framer-motion` installs cleanly; app builds/runs with no new console errors

### Phase 2: Thermostat dial component, wired into card and modal

#### Automated

- [ ] 2.1 `npm run typecheck` passes
- [ ] 2.2 `npm run lint` (Biome) passes
- [ ] 2.3 `npm run test` passes
- [ ] 2.4 `npm run build` succeeds

#### Manual

- [ ] 2.5 Card dial drag (touch + mouse) sets value correctly, clamp/step match, persists across reload
- [ ] 2.6 Modal dial drag matches card behavior; Overview tab's Setpoint reading updates
- [ ] 2.7 Dial background shifts blue→orange with value, on both sizes
- [ ] 2.8 Failed setpoint update snaps dial back and shows existing error toast
- [ ] 2.9 Sensor/plug cards and modals unchanged
- [ ] 2.10 Reduced-motion: dial color changes apply instantly

### Phase 3: Shared-layout card→modal transition

#### Automated

- [ ] 3.1 `npm run typecheck` passes
- [ ] 3.2 `npm run lint` (Biome) passes
- [ ] 3.3 `npm run test` passes
- [ ] 3.4 `npm run build` succeeds

#### Manual

- [ ] 3.5 Card visually expands into modal at card's position/size, all device types
- [ ] 3.6 Closing reverses the animation; card fully visible afterward
- [ ] 3.7 Modal's other content (History tab, chart, room assignment) works after transition
- [ ] 3.8 Rapid clicks on different cards don't produce a broken visual state
- [ ] 3.9 Reduced-motion: modal opens/closes instantly at centered position
- [ ] 3.10 Other dialogs (Settings card, room-move confirmation) unaffected
- [ ] 3.11 Drag-and-drop card reordering still works
