---
project: Tuya Device Dashboard
version: 1
status: draft
created: 2026-06-24
context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

**System purpose:** A dashboard for monitoring and controlling networked heating/climate devices (sensors, valves, plugs) grouped by room, with threshold-based comfort status and alerting.

**Key architecture:** A server-rendered web app with a typed API layer between client and server, a relational database for device/room/site state, and a background polling process that talks to devices over the local network.

**Tech stack:** Next.js, React, a typed RPC layer, a SQL database via an ORM, Tailwind for styling, a component primitives library for dialogs/popovers, and a charting library for temperature history.

**Current user base:** Facility manager / office administrator — a single flat role, full access, 2–5 person org. No multi-role or multi-tenant model exists today.

**Core functionality today:** Devices are shown grouped by room as cards in a list/grid view. Each card shows live temperature, online status, and (for valve devices) a setpoint control — currently a compact pair of +/− buttons, in 0.5°C steps. Clicking a card opens a detail view (a standard dialog overlay, mounted instantly with no transition) containing the same setpoint control as a linear slider, plus temperature history and other device management. There is no animation/interaction library in the current stack — no shared-element transitions, no gesture-driven controls.

## Problem Statement & Motivation

**The gap:** The current setpoint controls (card buttons, modal slider) and the instant dialog-open behavior are functionally adequate but visually and interactionally unremarkable — they read as a generic admin tool rather than a polished, premium product. There is no functional defect being fixed; this is a deliberate craft/quality-of-interaction gap.

**Why now:** This is the first dedicated pass at visual/interaction polish in the app's history — prior work has focused on functional features (device control, threshold alerting, room/site management). The team has identified two specific moments where the gap is most visible: adjusting a device's setpoint, and opening a device's detail view.

**Current workaround:** None — the existing controls work correctly; there is no broken behavior being routed around. The cost is purely perceptual ("doesn't feel like a premium product"), not functional.

## User & Persona

**Role:** Facility manager / office administrator — the existing, sole persona in this app. No new persona is introduced by this change.

**What changes for them:** The same person, performing the same task (checking and adjusting a device's temperature setpoint), experiences it through a more tactile, visually responsive interaction instead of clicking small buttons or dragging a thin slider, and the transition into the device's detail view feels continuous rather than an abrupt pop-up.

**Pain moment (unchanged from today):** Adjusting a device's setpoint or opening its detail view and experiencing it as functionally fine but visually unremarkable.

## Success Criteria

### Primary
The smallest end-to-end slice, proving the whole change works together:
1. User opens the dashboard.
2. User clicks a device card.
3. The card visually expands into the detail view at its full size and position — not an instant pop-up.
4. For valve-type devices, the setpoint control is now an interactive circular dial that responds to a drag gesture (touch or mouse), with a background color that shifts smoothly from cool blue to warm orange as it's turned.
5. The dial produces the exact same setpoint result as today's controls, with the same 5–35°C clamp and 0.5°C step.
6. Closing the detail view reverses the expansion back into the card.

Sensor/plug device cards (no setpoint) still use the same expand/collapse transition on open/close; their existing detail-view content is otherwise unchanged.

### Secondary
A subtle haptic tick (where the device/browser supports it) while dragging the dial, firing at each 0.5°C increment crossed. Nice-to-have; not required for this change to count as working.

### Guardrails
- The dial must produce the exact same setpoint result as the current controls, with the same 5–35°C clamp and 0.5°C step — visual polish must not introduce input lag or an incorrect value reaching the device.
- Sensor/plug device cards (no setpoint) are unaffected by the dial work and continue to open via the same expand/collapse transition, with their existing detail-view content (history, other management controls) unchanged.
- The detail view's existing content (history view, other management tabs, temperature chart) continues to render and function exactly as today — the transition wraps entrance/exit only, it does not alter what's inside.
- The expand/collapse transition and the dial's color transitions respect the user's system-level reduced-motion preference — when set, the detail view opens/closes instantly and color changes apply immediately rather than animating.

**Timeline:** roughly three weeks of after-hours work or less — a circular dial control with drag-gesture handling, an entrance/exit transition wrapping the existing card-to-detail-view open/close, and wiring the dial to the existing setpoint behavior.

## User Stories

### US-01: Admin adjusts a valve's setpoint via the new thermostat dial, with an expanding detail view

- **Given** an admin is viewing the dashboard with at least one valve device card
- **When** they click the device card, watch it expand into the full detail view, then drag the circular dial to a new setpoint
- **Then** the background shifts color smoothly as they drag, the same setpoint result is produced as today (same 5–35°C clamp, 0.5°C step), and closing the detail view reverses the expansion back into the card

Previously: clicking the card opened an instant pop-up with no transition, and the setpoint was set via small +/− buttons (on the card) or a linear slider (in the detail view).

#### Acceptance Criteria
- The dial-set value matches exactly what the old +/− buttons / slider would have sent for the same gesture endpoint
- Sensor/plug device cards and their detail views are visually and functionally unaffected except for gaining the expand/collapse transition
- The detail view's other content (history, management controls, temperature chart) still works unchanged after the transition completes
- A failed setpoint update surfaces the same error feedback as today, not a silently stuck dial
- With reduced-motion enabled, the same flow works with instant (non-animated) transitions

## Scope of Change

- [new] An interactive circular thermostat dial that responds to a drag gesture (touch or mouse) to adjust a valve device's setpoint, shown at a compact size on the dashboard device card and at a larger, primary-control size in the device detail view. The card-sized dial remains fully interactive (not just a display) and is sized with a generous drag tolerance so it stays usable despite being compact; the detail-view dial is the primary, most precise control. (must-have)
  > Socrates: Counter-argument considered: a drag-to-rotate gesture on a small card-sized dial is error-prone/fiddly, undermining the "premium feel" goal. Resolution: keep the card dial interactive, but require a generous touch target / drag tolerance in its design; the detail-view dial remains the primary precise control.
- [new] The dial's background fill shifts smoothly from cool blue to warm orange as the setpoint value increases, contained to the dial's own shape and visually distinct from the separate room-status indicator shown elsewhere on the card. (must-have)
  > Socrates: Counter-argument considered: blue→orange could clash with the existing cold/hot status-color language used elsewhere in the app. Resolution: accepted the risk — the gradient lives inside the dial's own contained shape, distinct in context/shape from the status indicator, so confusion in practice is unlikely.
- [modified] The setpoint control changes from a small button pair (on the card) and a linear slider (in the detail view) to the dial described above, while producing the exact same setpoint result, with the same 5–35°C clamp and 0.5°C step. (must-have)
  > Socrates: Counter-argument considered: this might be trivially obvious and not worth a dedicated scope item, since it's just "don't break the existing contract." Resolution: kept explicit anyway — this project's convention is to state preserved contracts as defensive guardrails even when "obviously" true, so it's testable in planning rather than assumed.
- [modified] Clicking a device card expands it into the detail view's size and position, instead of an instant pop-up. The transition animates the card's outer position/size consistently across all card types; each card's internal content (dial vs. no dial, different readouts) fades in/out rather than attempting to literally reshape mismatched internal layouts between card types. (must-have)
  > Socrates: Counter-argument considered: sensor, valve, and plug cards have different internal content/heights — a shared expand transition could look smooth for one card type and visually broken for another. Resolution: scope the transition to the card's outer position/size only; internal content fades rather than reflows.
- [modified] Closing the detail view reverses the transition back into the originating card, with its duration explicitly capped (e.g. well under a third of a second) so it never feels sluggish to a user who wants to close quickly. The detail view's existing content continues to render and function exactly as today — the transition wraps entrance/exit only and does not alter what's inside. (must-have)
  > Socrates: Counter-argument considered: (1) if the reverse-transition duration is too long, users who just want to dismiss the detail view quickly will feel friction instead of polish. Resolution: cap the animation duration explicitly. (2) A separate scope item stating detail-view internals are preserved was judged redundant once "wraps entrance/exit only" is stated here — merged rather than kept as a near-duplicate item.
- [preserved] Sensor and plug device types (no setpoint) are unaffected — no dial appears on their cards or detail view. (must-have)
  > Socrates: Counter-argument considered: since the dial is only ever built for valve devices, this might be redundant/trivially true by construction. Resolution: kept as an explicit preservation item anyway, matching this project's established convention for preserved behavior.
- [new] While dragging the dial, a subtle haptic tick fires at each 0.5°C increment crossed, where the device/browser supports it. No audio — feedback is private to the person touching the device and never disturbs others nearby. (nice-to-have)
  > Socrates: Counter-argument considered: sound effects in a shared office environment could be seen as unprofessional or annoying. Resolution: dropped the audio option entirely; kept haptic-only feedback, which doesn't have the shared-office downside.

## Constraints & Compatibility

- **No data migration:** this change touches no backend or data model — no new fields, no new endpoints, no persisted user preference.
- **No new external contract:** the dial produces the exact same setpoint result that the existing controls already produce, with the same input shape, clamp, and step — the existing control path is reused, not replaced underneath.
- **No backward-compatibility risk:** there are no existing external consumers, exports, or integrations touching the setpoint control path, so nothing downstream can break from this change.
- The device detail view's existing content — history view, other management controls, temperature chart — all continue working exactly as today; only the view's open/close presentation and its setpoint control (for valve devices) change.
- No special deployment window or release-process change — this change goes through the same quality gate as every other change in this project.

## Business Logic Changes

**No domain logic change.** This is a pure visualization/interaction change: the setpoint update behavior, device control behavior, and the existing threshold-based status logic are all unchanged. Nothing new is decided for the user — the dial and the expand/collapse transition only change how an existing decision (the setpoint value) is captured and how an existing view (the device detail view) is presented.

## Access Control Changes

No access control changes — current model preserved: single flat role, full access for the one effective user type. This is a pure UI/interaction feature; auth and roles are untouched.

## Non-Goals

- No change to product type (web app) or user base/scale (small, 2–5 person org) — this feature doesn't alter either.
- No hard deadline; after-hours-only work.
- Avoid: extending the dial or the expand/collapse transition to other controls — no dial-ification of other inputs (e.g. other threshold settings, schedule times) and no expand/collapse transition for other UI surfaces (e.g. room cards, settings cards). Scoped strictly to the device card/detail-view setpoint control and its open/close transition.
- Avoid: a full design-system animation overhaul — other existing transitions (notifications, dropdowns, dialogs elsewhere in the app) are untouched by this change.

## Open Questions

No open questions — shaping captured all required elements (Access Control, Business Logic, Timeline-cost, Non-Goals, Constraints & Preserved Behavior) with no gaps.
