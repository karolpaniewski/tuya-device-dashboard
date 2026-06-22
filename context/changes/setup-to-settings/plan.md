# Setup → Settings Reorganization Implementation Plan

## Overview

Reorganize `/setup` from a flat-tabs CRUD admin panel into a command-center-styled settings experience: a grid of six setting cards (Rooms, Devices, Automations, Sites, Display/Appearance, Default Thresholds), each opening a popup with that section's full content. The four existing CRUD screens move into popups with no behavior change; two sections (Display/Appearance, Default Thresholds) are net-new.

## Current State Analysis

- `/setup` (`src/app/setup/page.tsx`) renders `SetupShell` inside the legacy `PageShell`, which provides a light/dark `ThemeToggle`. `SetupShell` (`src/app/_components/setup/setup-shell.tsx`) is a `Tabs` container for four full-page CRUD screens: `room-manager.tsx`, `device-table.tsx`, `automation-manager.tsx` (+ `automation-form.tsx`), `site-manager.tsx`. All styled with `--s-*` tokens, which support both light and dark.
- The dashboard route (`/`) already renders `CommandCenterShell` (`src/app/_components/command-center-shell.tsx`), which is dark-only (`--cc-*` tokens, scoped to a `.command-center` class, no light variant) and **already has a "Settings" rail link pointing at `/setup`** — the new dark-only direction is consistent with an icon that already exists in the shipped redesign.
- A `Dialog` primitive (`src/components/ui/dialog.tsx`, wraps `@base-ui/react/dialog`) already exists and is already used once today: a nested "move room to site" confirmation inside `room-manager.tsx` (`room-manager.tsx:271-314`). It is currently styled with `--s-*` tokens.
- The per-room threshold override form (`room-threshold-form.tsx`) is **not** in a dialog today — it renders inline inside a room row in `room-manager.tsx` when expanded. No popup-in-popup pattern needs to be invented for this; the existing inline pattern carries forward unchanged.
- Site deletion (`site.ts:50-88`) has no reassignment-confirmation flow — it hard-blocks (`SITE_NOT_EMPTY`) if any room/gateway references the site. The "site reassignment confirmation" risk named in the PRD is the *room*-side "move to site" dialog (`room-manager.tsx:271-314`), which already exists and already nests — it is not a new flow to build.
- Room comfort thresholds: `DEFAULT_THRESHOLDS` (`src/server/lib/scoring.ts:3-7`) is a hardcoded object, imported directly by two independent consumers — `device.ts:18,400-401` (scoring fallback) and `device-overview.tsx:39,549,558,566,572` (fleet-wide average-temperature gauge labels). Per-room overrides already live in their own table (`roomThresholds`, `schema.ts:198-225`), unrelated to `DEFAULT_THRESHOLDS`.
- A singleton-row config pattern already exists: `dashboardLayout` (`schema.ts:296-307`) plus `dashboardLayoutRouter` (`dashboard-layout.ts`) — `get` returns an in-code fallback constant when no row exists, `save` does `insert().onConflictDoUpdate()` keyed on a literal `id: "default"`. This is the direct precedent for the new Default Thresholds table/router.
- No settings/preference/display/appearance concept exists anywhere in `schema.ts` or `src/server/api/routers/` today (confirmed via grep — zero matches).
- No `localStorage` usage exists in any component today (only `next-themes`' own internal `theme` key, set via the anti-FOUC script in `layout.tsx:42-46`).
- No E2E/Playwright tests exist in this repo. All existing coverage is Vitest, router-level (`room.test.ts`, `device.test.ts`, `dashboard-layout.test.ts`, etc.).

### Key Discoveries

- **Portals break `.command-center` CSS-variable scoping.** `DialogContent`/`DialogBackdrop` render via `DialogPrimitive.Portal` (`dialog.tsx:11-13`), which mounts outside the page's React/DOM subtree (base-ui's default portal target is `document.body`). `--cc-*` custom properties are scoped to the `.command-center` class (`globals.css:197`) and only cascade through the actual DOM tree — a popup portaled to `<body>` is a sibling of `.command-center`, not a descendant, so it will **not** see `--cc-*` values unless `.command-center` is reapplied directly on the popup's own backdrop/content elements.
- `DialogContent` has a single hardcoded width (`max-w-lg`, `dialog.tsx:41`) and uses `--s-border-card`/`--s-bg-card` (`dialog.tsx:42`) — both need to become parameterized/overridable for the settings popups.
- The dashboard's glass-card visual pattern (`cc-climate-overview.tsx:75-81`) is a `rounded-[20px] border` with `--cc-glass-bg`/`--cc-glass-border` — this is the look the new `SettingsCard` face and popup chrome should match.

## Desired End State

Opening `/setup` shows a command-center-styled grid of six cards. Clicking any card opens a popup with that section's full, working content. Rooms/Devices/Automations/Sites behave exactly as they do today, just relocated and restyled. Display/Appearance lets the admin toggle dashboard card density (comfortable/compact), persisted in the browser. Default Thresholds lets the admin set the app-wide fallback min/max/anomaly-gap values that `device.ts`'s scoring already falls back to when a room has no override.

**Verification**: `npm run ci` passes; manually clicking through all six cards confirms each popup opens, its content matches today's CRUD functionality (where applicable), and the dashboard reflects an admin-edited default threshold and density change.

## What We're NOT Doing

- No change to the flat single-admin auth model, or to any tRPC procedure's *behavior* for Rooms/Devices/Automations/Sites — only their presentation (popup vs. full-page tab) and visual styling change.
- No new reassignment/confirmation flow for site deletion — it keeps hard-blocking on non-empty sites, unchanged.
- No light-mode variant of `--cc-*` tokens, and no `ThemeToggle` on the Settings page — Settings adopts the dashboard's dark-only treatment.
- No density effect on the Settings page itself — density only affects the dashboard's card spacing.
- No Playwright/E2E test setup — coverage stays Vitest/router-level, consistent with the rest of the repo.
- No mobile-specific redesign — existing 375px support must not regress, verified manually, not rebuilt.

## Implementation Approach

Build bottom-up: data layer first (Phase 1, fully testable in isolation), then the navigation skeleton wired to existing components unchanged (Phase 2, proves the popup mechanics work before any visual rework), then restyle existing CRUD in place (Phase 3), then the two net-new sections last (Phases 4–5), since they depend on Phase 1's router and Phase 2's card/popup shell.

## Critical Implementation Details

**Portal scoping.** Every settings popup must apply the `command-center` class directly on the `DialogBackdrop`/`DialogContent` elements that get portaled (not just rely on a `.command-center` ancestor in the page shell) — otherwise `--cc-*` tokens silently resolve to nothing and the popup renders unstyled. Build this once into a shared `SettingsCard` component (Phase 2) so all six popups get it automatically, rather than repeating the class at each of the six call sites.

## Phase 1: Default-thresholds data layer

### Overview

Move the room-scoring default thresholds from a hardcoded constant to a DB-backed singleton value, following the existing `dashboardLayout` precedent exactly. The hardcoded constant becomes the in-code fallback-of-last-resort, not removed.

### Changes Required:

#### 1. Schema: new singleton table

**File**: `src/server/db/schema.ts`

**Intent**: Add a new table holding the app-wide default thresholds as a single row, mirroring `dashboardLayout`'s shape and purpose.

**Contract**: New table (name: `defaultThresholds`), columns: `id` (text PK, literal `"default"`), `minTempC` (real, not null), `maxTempC` (real, not null), `anomalyGapC` (real, not null), `createdAt`, `updatedAt`. Same `minTempC < maxTempC` check constraint pattern already used on `roomThresholds` (`schema.ts:220-223`).

#### 2. Migration

**File**: `drizzle/` (generated)

**Intent**: Generate and review the migration for the new table.

**Contract**: Run `npm run db:generate`; confirm the generated SQL only adds the new table (no unrelated diffs).

#### 3. New settings router

**File**: `src/server/api/routers/settings.ts` (new)

**Intent**: Expose get/set for the default-thresholds singleton, following `dashboardLayoutRouter`'s get/save shape (`dashboard-layout.ts:9-60`) and `room.ts`'s `setThreshold` validation (`room.ts:287-331`).

**Contract**: `settingsRouter` with `getDefaultThresholds` (query, no input, returns `{ minTempC, maxTempC, anomalyGapC }` — DB row if present, else the in-code `DEFAULT_THRESHOLDS` constant from `scoring.ts`) and `setDefaultThresholds` (mutation, input `{ minTempC, maxTempC, anomalyGapC: number.min(0) }`, validates `minTempC < maxTempC` with the same `BAD_REQUEST` pattern as `room.ts:306-311`, then `insert().onConflictDoUpdate()` keyed on `id: "default"`).

#### 4. Router registration

**File**: `src/server/api/root.ts`

**Intent**: Register the new router.

**Contract**: Add `settings: settingsRouter` to the `createTRPCRouter({...})` call, alphabetically ordered per the existing convention.

#### 5. Wire the DB-backed default into scoring

**File**: `src/server/api/routers/device.ts`

**Intent**: Replace the direct `DEFAULT_THRESHOLDS` fallback with the DB-backed value, keeping the constant as the final fallback if no row exists yet.

**Contract**: At `device.ts:400`, fetch the `defaultThresholds` row once per request (not per-room) before the per-room loop; fallback chain becomes `roomOverride ?? dbDefault ?? DEFAULT_THRESHOLDS`. `scoreRoom()`'s signature (`scoring.ts:15`) is unchanged.

#### 6. Wire the DB-backed default into the dashboard gauge

**File**: `src/app/_components/device-overview.tsx`

**Intent**: The fleet-wide average-temperature gauge (lines 546-575) currently reads the static `DEFAULT_THRESHOLDS` import for its min/max labels; it should reflect the admin-configured default instead.

**Contract**: Replace the static import (line 39) with `api.settings.getDefaultThresholds.useQuery()`; use the query result in place of `DEFAULT_THRESHOLDS.minTempC`/`maxTempC` at lines 549, 558, 566, 572. Handle the loading state by keeping the static constant as the value until the query resolves (avoids a layout flash).

### Success Criteria:

#### Automated Verification:

- [ ] Migration applies cleanly: `npm run db:push`
- [ ] Type checking passes: `npm run typecheck`
- [ ] New `settings.test.ts` passes: `npx vitest run src/server/api/routers/settings.test.ts` — covers get-with-no-row (returns constant), set-then-get (returns saved value), and min<max validation rejecting an invalid input
- [ ] Existing suite still passes: `npm run test`

#### Manual Verification:

- [ ] Dashboard's "Avg Temperature" gauge still renders correctly with no DB row present (fresh DB)
- [ ] After calling `setDefaultThresholds` (via a temporary script or the Phase 5 UI once built), the gauge's min/max labels update to the new values

---

## Phase 2: Settings shell & navigation skeleton

### Overview

Replace the tabs container with a command-center-styled grid of six cards, each opening a popup. Wire all six cards now, four of them opening the *existing* manager components unchanged — proving the navigation/popup mechanics before any visual rework of the CRUD internals.

### Changes Required:

#### 1. Page shell swap

**File**: `src/app/setup/page.tsx`

**Intent**: Match the dashboard's shell so `/setup` renders dark-only, consistent with the rail link that already points here.

**Contract**: Replace `PageShell` with `CommandCenterShell` (same usage pattern as `src/app/page.tsx:14-18`); drop the "← Dashboard" link (redundant — the rail nav already covers it) and the implicit `ThemeToggle` that came from `PageShell`.

#### 2. Widen `DialogContent` for a wide variant

**File**: `src/components/ui/dialog.tsx`

**Intent**: Devices needs more horizontal room than the other five cards.

**Contract**: Add an optional `size?: "default" | "wide"` prop to `DialogContent`, mapping to `max-w-lg` (default, unchanged) vs. `max-w-4xl` (wide). No change to `DialogBackdrop`/`DialogHeader`/etc.

#### 3. Shared settings card + popup wrapper

**File**: `src/app/_components/setup/settings-card.tsx` (new)

**Intent**: One component owning both the clickable card face (icon, title, one-line description, glass styling matching `cc-climate-overview.tsx`'s pattern) and its `Dialog`/`DialogTrigger`/`DialogContent`, so the portal-scoping fix (Critical Implementation Details) and the wide-variant choice are made once, not six times.

**Contract**: `SettingsCard({ icon, title, description, size?, children })` renders the card face as `DialogTrigger`, and `DialogContent` with `className="command-center"` plus the existing glass-card classes baked in, `size` forwarded to the Phase-2.2 prop. `children` is the popup body (the section's content).

#### 4. Settings grid

**File**: `src/app/_components/setup/settings-shell.tsx` (replaces `setup-shell.tsx`)

**Intent**: Render the six `SettingsCard`s in a responsive grid, replacing the `Tabs` container.

**Contract**: A CSS grid (2–3 columns desktop, 1 column at 375px — reuse the existing mobile-breakpoint convention from the dashboard) rendering six `SettingsCard`s: Rooms → `<RoomManager />`, Devices → `<DeviceTable />` with `size="wide"`, Automations → `<AutomationManager />`, Sites → `<SiteManager />`, Display/Appearance → placeholder pending Phase 4, Default Thresholds → placeholder pending Phase 5. Delete `setup-shell.tsx` once `settings-shell.tsx` is wired in.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Lint passes: `npm run check`
- [ ] Existing suite still passes: `npm run test`

#### Manual Verification:

- [ ] `/setup` shows a six-card grid styled dark-only, matching the dashboard's visual language
- [ ] Clicking Rooms/Devices/Automations/Sites opens a popup containing the existing (not-yet-restyled) manager — confirms popup mechanics and the `--cc-*` portal fix both work
- [ ] Devices' popup is visibly wider than the other three
- [ ] 375px viewport: grid collapses to one column, cards remain tappable

---

## Phase 3: Restyle existing CRUD inside their popups

### Overview

Convert the four existing manager components (plus their nested sub-components) from `--s-*` to `--cc-*` tokens, now that they render inside `.command-center`-scoped popups. No structural change to nesting — Rooms' inline threshold form and Sites' nested move-confirmation dialog keep their current shape.

### Changes Required:

#### 1. Rooms

**File**: `src/app/_components/setup/room-manager.tsx`, `src/app/_components/setup/room-threshold-form.tsx`

**Intent**: Restyle to `--cc-*` tokens; the existing nested move-to-site `Dialog` (`room-manager.tsx:271-314`) also needs `className="command-center"` applied directly (it's a second portal, independent of the Phase-2 `SettingsCard` fix), since it stacks on top of the Rooms popup.

**Contract**: Replace every `--s-*` reference with the equivalent `--cc-*` token (background/border/text-muted families); no change to component logic, props, or the inline threshold-form nesting.

#### 2. Devices

**File**: `src/app/_components/setup/device-table.tsx`

**Intent**: Restyle to `--cc-*` tokens within the wide popup.

**Contract**: Same token-swap approach as Rooms; no change to sort/search/pagination logic.

#### 3. Automations

**File**: `src/app/_components/setup/automation-manager.tsx`, `src/app/_components/setup/automation-form.tsx`

**Intent**: Restyle to `--cc-*` tokens; the form needs to scroll internally rather than expand the popup unboundedly.

**Contract**: Token-swap as above, plus a `max-h-[...] overflow-y-auto` on the form's body so a long rule-creation form scrolls inside the popup instead of growing past the viewport.

#### 4. Sites

**File**: `src/app/_components/setup/site-manager.tsx`

**Intent**: Restyle to `--cc-*` tokens. No new confirmation flow — `delete` keeps throwing `SITE_NOT_EMPTY` unchanged.

**Contract**: Token-swap as above.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Lint passes: `npm run check`
- [ ] Existing suite still passes: `npm run test`

#### Manual Verification:

- [ ] All four popups visually match the dashboard's dark glass aesthetic — no leftover `--s-*`-styled elements
- [ ] Rooms: expanding a room's inline threshold form still works, still inline (no popup-in-popup)
- [ ] Rooms: "move to site" nested dialog renders correctly styled, stacked above the Rooms popup
- [ ] Automations: the rule-creation form scrolls internally without the popup itself growing off-screen
- [ ] Sites: deleting a non-empty site still shows the existing blocked-deletion error, unchanged
- [ ] 375px viewport: all four popups remain usable (no horizontal overflow, controls remain tappable)

---

## Phase 4: Display/Appearance settings section

### Overview

New settings card letting the admin toggle dashboard card density (comfortable/compact), persisted in the browser, affecting only the dashboard — not the Settings page itself.

### Changes Required:

#### 1. Density persistence + apply

**File**: `src/app/_components/density-provider.tsx` (new), used in `src/app/page.tsx` or `command-center-shell.tsx`

**Intent**: Read/write a `localStorage` key for density, expose it to the dashboard's card components via a `data-density` attribute on the `.command-center` root.

**Contract**: `localStorage` key `cc-density`, values `"comfortable" | "compact"`, default `"comfortable"`. Sets `data-density={value}` on the element already carrying the `command-center` class (`command-center-shell.tsx:77`). A small number of dashboard card components (e.g. `cc-climate-overview.tsx`, `device-card.tsx`) gain a `[data-density="compact"]` CSS variant reducing padding/gap — scope this to the card components already using the glass-card pattern, not every pixel of the dashboard.

#### 2. Settings card content

**File**: `src/app/_components/setup/display-settings.tsx` (new)

**Intent**: The popup body for the Display/Appearance card — a comfortable/compact toggle.

**Contract**: Reads/writes the same `localStorage` key via the Phase-4.1 provider's hook; no server round-trip (this preference is browser-local per the PRD).

#### 3. Wire into settings grid

**File**: `src/app/_components/setup/settings-shell.tsx`

**Intent**: Replace the Phase-2 placeholder with the real component.

**Contract**: Display/Appearance card's `children` becomes `<DisplaySettings />`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Existing suite still passes: `npm run test`

#### Manual Verification:

- [ ] Toggling density in the popup, then closing it and returning to the dashboard, shows visibly different card spacing
- [ ] Reloading the page preserves the chosen density (browser-local persistence confirmed)
- [ ] The Settings page itself looks unchanged regardless of the density setting

---

## Phase 5: Default Thresholds settings section

### Overview

New settings card exposing the Phase 1 router's get/set for the app-wide default thresholds.

### Changes Required:

#### 1. Settings card content

**File**: `src/app/_components/setup/default-thresholds-form.tsx` (new)

**Intent**: A form mirroring `room-threshold-form.tsx`'s three fields (min/max/anomaly-gap °C), wired to `api.settings.getDefaultThresholds`/`setDefaultThresholds`.

**Contract**: Same min<max client-side validation pattern as `room-threshold-form.tsx`; on save, invalidates any query that already reads `settings.getDefaultThresholds` (the dashboard gauge from Phase 1.6) so it reflects the change without a manual refresh.

#### 2. Wire into settings grid

**File**: `src/app/_components/setup/settings-shell.tsx`

**Intent**: Replace the Phase-2 placeholder with the real component.

**Contract**: Default Thresholds card's `children` becomes `<DefaultThresholdsForm />`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Full CI gate passes: `npm run ci`

#### Manual Verification:

- [ ] Changing the default thresholds in the popup, then returning to the dashboard, updates the "Avg Temperature" gauge's min/max labels without a manual page refresh
- [ ] A room with no per-room override reflects the new default in its scoring (OK / Too Cold / Too Hot) after the next poll cycle
- [ ] Saving an invalid value (min ≥ max) is rejected with a clear inline error, consistent with the existing per-room threshold form's validation UX

---

## Testing Strategy

### Unit Tests:

- `settings.test.ts` (new): get-with-no-row fallback, set-then-get round-trip, min<max validation rejection — mirrors `dashboard-layout.test.ts` and `room.test.ts`'s `setThreshold` tests.
- `device.test.ts`: extend existing scoring tests to cover the new `roomOverride ?? dbDefault ?? DEFAULT_THRESHOLDS` fallback chain (currently only tests `roomOverride ?? DEFAULT_THRESHOLDS`).

### Integration Tests:

- None beyond the router-level tests above — no E2E suite in scope (see What We're NOT Doing).

### Manual Testing Steps:

1. Walk through all six settings cards on desktop, confirming each popup opens and its content is fully functional (not just visually present).
2. Repeat at a 375px viewport width.
3. Change the default thresholds and density settings, confirm both effects are visible elsewhere in the app (dashboard gauge, dashboard card spacing) without a manual reload.
4. Confirm no existing CRUD action (create/rename/delete/move/assign room/device/automation/site) regresses.

## Performance Considerations

Settings popups should open without perceptible lag (PRD NFR: <300ms perceived) — since all four existing managers already mount today on tab-switch with acceptable performance, converting their container from tab-panel to dialog-popup is not expected to introduce new mount cost; verify manually rather than adding new instrumentation.

## Migration Notes

The new `defaultThresholds` table starts empty; `getDefaultThresholds` falls back to the existing hardcoded constant until the admin saves a value via Phase 5's form — no backfill needed, consistent with how `dashboardLayout` already handles its own empty-table startup state.

## References

- Related research: shape-notes.md `## Current System`, `## Business Logic`; `context/foundation/prd-v3.md` (`## Scope of Change`, `## Constraints & Compatibility`, `## Business Logic Changes`)
- Singleton-config precedent: `src/server/api/routers/dashboard-layout.ts`, `src/server/db/schema.ts:296-307`
- Existing nested-dialog precedent: `src/app/_components/setup/room-manager.tsx:271-314`
- Glass-card visual precedent: `src/app/_components/cc-climate-overview.tsx:74-81`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Default-thresholds data layer

#### Automated

- [x] 1.1 Migration applies cleanly: `npm run db:push` (substituted `db:migrate` — `db:push` fails on a pre-existing FK issue in this repo's local db.sqlite unrelated to this change; see user decision in session) — 7f874d2
- [x] 1.2 Type checking passes: `npm run typecheck` — 7f874d2
- [x] 1.3 New `settings.test.ts` passes — 7f874d2
- [x] 1.4 Existing suite still passes: `npm run test` — 7f874d2

#### Manual

- [x] 1.5 Dashboard gauge renders correctly with no DB row present — 7f874d2
- [x] 1.6 Gauge updates after `setDefaultThresholds` is called — 7f874d2

### Phase 2: Settings shell & navigation skeleton

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 6743960
- [x] 2.2 Lint passes: `npm run check` (same pre-existing drizzle-metadata diagnostics noted in Phase 1; no new errors from any Phase 2 file — confirmed via targeted `biome check` on each touched file) — 6743960
- [x] 2.3 Existing suite still passes: `npm run test` — 6743960

#### Manual

- [x] 2.4 Six-card grid renders, dark-only, matches dashboard visual language — 6743960
- [x] 2.5 Clicking Rooms/Devices/Automations/Sites opens a working popup — 6743960
- [x] 2.6 Devices popup is visibly wider than the others — 6743960
- [x] 2.7 375px viewport: grid collapses to one column, cards remain tappable — 6743960

### Phase 3: Restyle existing CRUD inside their popups

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck`
- [x] 3.2 Lint passes: `npm run check` (verified via targeted `biome check` on each touched file)
- [x] 3.3 Existing suite still passes: `npm run test`

#### Manual

- [x] 3.4 All four popups visually match the dashboard's dark glass aesthetic
- [x] 3.5 Rooms: inline threshold form still works, still inline
- [x] 3.6 Rooms: nested "move to site" dialog renders correctly, stacked above the popup
- [x] 3.7 Automations: rule-creation form scrolls internally
- [x] 3.8 Sites: blocked-deletion error still shows for non-empty sites
- [x] 3.9 375px viewport: all four popups remain usable

### Phase 4: Display/Appearance settings section

#### Automated

- [ ] 4.1 Type checking passes: `npm run typecheck`
- [ ] 4.2 Existing suite still passes: `npm run test`

#### Manual

- [ ] 4.3 Toggling density visibly changes dashboard card spacing
- [ ] 4.4 Density choice persists across reload
- [ ] 4.5 Settings page itself is unaffected by density

### Phase 5: Default Thresholds settings section

#### Automated

- [ ] 5.1 Type checking passes: `npm run typecheck`
- [ ] 5.2 Full CI gate passes: `npm run ci`

#### Manual

- [ ] 5.3 Changing defaults updates the dashboard gauge without manual refresh
- [ ] 5.4 A room with no override reflects the new default after next poll
- [ ] 5.5 Invalid input (min ≥ max) is rejected with a clear inline error
