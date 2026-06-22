# Visual Design-System Pass Implementation Plan

## Overview

Finish the visual/dark-mode token migration that S-17 (`visual-ux-redesign`) started but didn't reach everywhere. Fix the shared `Dialog` primitive and other shared UI components that are still hardcoded dark-only, remove a dead orphaned modal, consolidate duplicated badge-color lookup tables, and tighten information density on the main dashboard. Desktop-only; Setup (`src/app/_components/setup/`) stays out of scope per the frame's locked boundary.

## Current State Analysis

S-17 migrated theme infra, `layout.tsx`, `page-shell.tsx`, `device-card.tsx`, `room-group.tsx`, `room-sidebar.tsx`, `filter-bar.tsx`, `device-modal.tsx`, `device-overview.tsx`, and `device-table.tsx` (icons only) to the `--s-*` token system + `dark:`-aware semantic Tailwind tokens, but several gaps survived that pass:

- The **shared `ui/dialog.tsx` component itself** is hardcoded dark-only (`bg-gray-900/95`, `text-white`, `border-white/10`). It's consumed by `device-modal.tsx` and `setup/room-manager.tsx`, so the bug has app-wide leverage — fixing this one file fixes every dialog built on it.
- `temperature-history-modal.tsx` bypasses the shared Dialog entirely (imports `@base-ui/react/dialog` directly) and is fully hardcoded dark-only, including inline hex colors for its Recharts chart. Investigation during planning found this component is **dead code**: it was wired to a `device-card.tsx` click handler at original build time (S-09, "reachable from every device card"), but that trigger no longer exists — `device-card.tsx`'s click now opens `DeviceModal`, which has its own correctly-themed "History" tab (`device-modal.tsx:306-432`, already using `var(--color-chart-1)` tokens). No file in `src/` imports `TemperatureHistoryModal`.
- `device-modal.tsx:211` has a raw `bg-blue-600` button bypassing the shared `Button` component; `:201` has a raw `accent-blue-500` range-input accent.
- `ui/sonner.tsx`'s `Toaster` is hardcoded `theme="dark"` (sonner.tsx:31) and is rendered in `layout.tsx:51` **outside** `<ThemeProvider>` — even if it read the theme, it isn't in a position to.
- `ui/error-message.tsx`'s `"page"` variant hardcodes `text-white` (error-message.tsx:23).
- Several raw-gray "offline/dim" colors were left behind where the `--s-text-muted` / `--s-text-dim` / `--s-bg-off` tokens (already defined for exactly this purpose in `globals.css`) should have been used: `device-card.tsx` lines 159-160, 175, 196; `room-group.tsx:121`; `device-overview.tsx` lines 760, 764, 807, 811.
- Device-type and room-status badge colors are defined as literal Tailwind-class lookup tables, duplicated verbatim across files: `TYPE_BADGE` (`device-card.tsx:14-18`, also independently in `setup/device-table.tsx:25-28` — out of scope, left alone), and the room-status pair `BADGE_STYLE` (`room-group.tsx:14-18`) / `BADGE_DOT` (`room-sidebar.tsx:17-21`), which encode the same OK/Too Cold/Too Hot semantics as two independent maps.
- Macro-level spacing on the dashboard is loose relative to the rest of the app's "data-dense" aesthetic target (`prd-v2.md:65`): `device-overview.tsx:651` and `:787` both use `gap-8` between major sections; `room-group.tsx:82`'s device grid uses `gap-4` with `min-h-[80px]` per card; `filter-bar.tsx:62` uses `px-4 py-3`.

### Key Discoveries:

- `room-temperature-panel.tsx:46-119` and `device-modal.tsx:330-432`'s `TemperatureChart` are the two existing, correctly-themed Recharts implementations in this codebase — both use `var(--color-chart-1)` for the primary line, `var(--muted-foreground)` for tick labels, and `var(--popover)`/`var(--border)`/`var(--popover-foreground)` for the tooltip. Any chart-theming work should match this exact pattern, not invent a new one.
- `Toaster` in `layout.tsx:51` sits as a sibling of `<ThemeProvider>`, not a descendant — `useTheme()` inside `sonner.tsx` would return no context. The Toaster must move inside the `ThemeProvider` block to read `resolvedTheme`.
- No `Card` UI primitive exists in `src/components/ui/` — every card hand-rolls `bg-[var(--s-bg-card)]`/`border-[var(--s-border-card)]` directly, consistently. This plan does not introduce one (see Out of Scope).

## Desired End State

Every shared dialog, toast, and error surface renders correctly in both light and dark mode. The dead `temperature-history-modal.tsx` is removed. Device-type and room-status badge colors are each defined once and imported, not copy-pasted, in the in-scope dashboard files. The dashboard's main content areas use the same tightened spacing scale the rest of the redesigned surfaces already use.

Verify by: toggling light/dark mode (the existing toggle in `page-shell.tsx`) while a `DeviceModal` and a toast are open, and visually comparing the dashboard's spacing against `room-group.tsx`'s existing tighter areas (e.g. `room-sidebar.tsx`).

## What We're NOT Doing

- Setup (`src/app/_components/setup/**`) — out of scope per the frame's locked boundary (S-22 territory). `setup/device-table.tsx`'s duplicate `TYPE_BADGE` copy is deliberately left untouched.
- Mobile layout/breakpoints — desktop-only, same boundary S-17 drew.
- Restructuring the dashboard layout (sidebar/grid/filter-bar arrangement) — "density" here means tightening spacing within the existing layout, not changing it (that's S-15's territory).
- Extracting a shared `Card` component — the existing hand-rolled `--s-bg-card` pattern is already consistent in practice; extracting now is a refactor with no visible fix behind it.
- Restoring/re-wiring `TemperatureHistoryModal` as a feature — confirmed dead and superseded by `device-modal.tsx`'s History tab; deleted, not revived.
- Automation-history widget — S-12 is parked, unaffected by this pass.
- Any accent/status text color that appears only once per file and isn't part of a duplicated lookup table (e.g. individual `text-emerald-400`/`text-green-400` online indicators) — these are intentionally theme-invariant and not part of the confirmed gaps.

## Implementation Approach

Order phases so foundational, highest-leverage fixes land first: the shared `Dialog`/`Toaster`/`ErrorMessage` primitives (Phase 1) affect every consumer, so fixing them before touching consumers avoids re-verifying the same visual bug twice. Dead-code removal and `device-modal.tsx`'s remaining one-off raw styles (Phase 2) come next since `device-modal.tsx` directly depends on the now-fixed `Dialog`. Token cleanup for offline/dim states (Phase 3) and badge consolidation (Phase 4) are independent of each other and of Phase 1/2, but follow them so the "what's already token-based" baseline is fully corrected before consolidating. Density tightening (Phase 5) is purely cosmetic spacing and is independent of all visual-correctness fixes, so it's last.

## Phase 1: Shared primitives — Dialog, Toaster, ErrorMessage

### Overview

Fix the three shared `src/components/ui/*` components that are hardcoded dark-only or otherwise theme-unaware, since every consumer inherits the fix automatically.

### Changes Required:

#### 1. Dialog component

**File**: `src/components/ui/dialog.tsx`

**Intent**: Replace the hardcoded dark colors in `DialogContent` (`bg-gray-900/95`, `border-white/10`), `DialogTitle` (`text-white`), `DialogDescription` (`text-white/50`), `DialogHeader` (`border-white/10`), and `DialogClose` (`text-white/40`/`text-white/80`) with the existing semantic/`--s-*` tokens already used elsewhere in this codebase for card-like surfaces (`--s-bg-card`, `--s-border-card`, `text-foreground`, `text-muted-foreground`).

**Contract**: Public props/exports of `Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription`, `DialogHeader`, `DialogClose` are unchanged — only the `className` token values inside each function body change.

#### 2. Toaster theme wiring

**File**: `src/components/ui/sonner.tsx`, `src/app/layout.tsx`

**Intent**: Make toasts follow the app's actual light/dark theme instead of being forced dark. `sonner.tsx` should read the resolved theme via `next-themes`' `useTheme()` and pass it to `<Sonner theme={...}>` instead of the literal `"dark"`. For `useTheme()` to have a theme to read, `<Toaster />` must render as a descendant of `<ThemeProvider>`, so move it from `layout.tsx:51` (currently a sibling, after `</TRPCReactProvider>`) to inside the `<ThemeProvider>` block (alongside `<SessionProvider>{children}</SessionProvider>`).

**Contract**: `Toaster`'s external props (`position`, `richColors`, etc., passed at the `layout.tsx` call site) are unchanged. `next-themes`' `resolvedTheme` is `"light" | "dark" | undefined` — fall back to `"dark"` (the app's existing default) when `undefined`, matching `ThemeProvider`'s `defaultTheme="dark"`.

#### 3. ErrorMessage page variant

**File**: `src/components/ui/error-message.tsx`

**Intent**: Replace the hardcoded `text-white` in the `"page"` variant's heading (line 23) with `text-foreground`, matching how every other text color in this component (`text-destructive`, `text-muted-foreground`) is already theme-aware.

**Contract**: `ErrorMessage`'s props (`message`, `variant`) are unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] Open a `DeviceModal` in light mode — dialog background, title, description, and close button all read correctly (no white-on-white or invisible text)
- [ ] Open a `DeviceModal` in dark mode — no visual regression from current dark-mode appearance
- [ ] Trigger a toast (e.g. rename a device) in light mode — toast background/text match light theme, not forced dark
- [ ] Trigger a toast in dark mode — no visual regression
- [ ] Trigger an `ErrorMessage` `"page"` variant in light mode (e.g. a tRPC query error state) — heading text is readable

---

## Phase 2: Dead code removal + device-modal one-off fixes

### Overview

Remove the unreachable `temperature-history-modal.tsx` and fix the two raw-styled elements remaining in `device-modal.tsx`, which now sits on top of the Phase-1-fixed `Dialog`.

### Changes Required:

#### 1. Delete dead modal

**File**: `src/app/_components/temperature-history-modal.tsx`

**Intent**: Delete the file. Confirmed unreferenced anywhere in `src/` (no import of `TemperatureHistoryModal` exists outside its own definition); its functionality is fully covered by `device-modal.tsx`'s existing "History" tab.

**Contract**: File removal only — no other file imports it, so no call-site changes are needed.

#### 2. Device-modal raw button and slider accent

**File**: `src/app/_components/device-modal.tsx`

**Intent**: Replace the raw `<button className="rounded-lg bg-blue-600 ... text-white hover:bg-blue-500 ...">` (line 211) with the shared `Button` component (`~/components/ui/button`, already imported pattern used elsewhere in this file's sibling components), using its default variant so it inherits theme-aware colors automatically. Replace the raw `accent-blue-500` on the setpoint `<input type="range">` (line 201) with a token-based or `accent-primary`-equivalent color consistent with the shared `Button`'s default color.

**Contract**: The button's `onClick={handleSetpoint}`, `disabled={setpointSaving}`, and text content (`"Sending…"` / `"Set"`) behavior is unchanged — only the element type/className changes to route through `Button`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No remaining references: `grep -r "TemperatureHistoryModal" src/` returns empty

#### Manual Verification:

- [ ] Open a valve device's `DeviceModal`, confirm the "Set" button renders with the shared Button's styling and still submits the setpoint correctly
- [ ] Confirm the setpoint slider is usable and visually consistent in both light and dark mode

---

## Phase 3: Offline/dim-state token cleanup

### Overview

Replace raw gray Tailwind classes used for "offline"/"dim"/"muted" states with the `--s-text-muted` / `--s-text-dim` / `--s-bg-off` tokens that already exist in `globals.css` for this exact purpose, but were missed in a few spots during S-17.

### Changes Required:

#### 1. Device card offline state

**File**: `src/app/_components/device-card.tsx`

**Intent**: Replace the offline-state raw grays — the badge fallback `bg-gray-700 text-gray-400` (line 160), the offline temperature `text-gray-500` (line 175), and the offline status label `text-gray-600` (line 196) — with the existing `--s-text-muted`/`--s-text-dim` tokens, matching how the rest of this same component already handles the offline state (e.g. line 112's `border-[var(--s-border-alt)] bg-[var(--s-bg-off)]`).

**Contract**: Online-state colors (`text-emerald-400`, `bg-emerald-400`, the `TYPE_BADGE` lookup) are untouched — this only touches the `device.isOnline === false` branches.

#### 2. Room group device count

**File**: `src/app/_components/room-group.tsx`

**Intent**: Replace `text-gray-500` (line 121, the `(devices.length)` count) with `text-[var(--s-text-dim)]`, matching the muted-text token used elsewhere in this same file (e.g. line 118's unassigned-room heading).

**Contract**: No structural change — className token swap only.

#### 3. Device overview empty states

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Replace the empty-state raw grays at lines 760/764 (zero-devices state: `text-gray-600` icon, `text-gray-400` message) and 807/811 (filtered-empty state: same pair) with `text-[var(--s-text-dim)]` / `text-[var(--s-text-muted)]`, consistent with how empty/dim states are tokenized elsewhere in this codebase.

**Contract**: No structural change — className token swaps only, same four call sites.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] Set a device offline (or view an existing offline device) in light mode — offline badge/text/temperature are legible, not too-dark-to-read
- [ ] View the zero-devices and filtered-empty-results states in both light and dark mode — icon and message are legible in both

---

## Phase 4: Badge/status color consolidation

### Overview

Extract the duplicated device-type and room-status badge-color lookup tables into shared constant modules, removing duplication without changing the rendered colors (status semantics stay theme-invariant per the locked decision).

### Changes Required:

#### 1. Room-status color map

**File**: `src/lib/room-status-colors.ts` (new)

**Intent**: Define one shared module exporting the OK/Too Cold/Too Hot color mapping in both forms currently needed: a full badge class string (today's `BADGE_STYLE` shape in `room-group.tsx:14-18`) and a dot-only class string (today's `BADGE_DOT` shape in `room-sidebar.tsx:17-21`). Colors are copied verbatim from the existing maps — this is deduplication, not a recolor.

**Contract**: Export two `Record<"OK" | "Too Cold" | "Too Hot", string>` constants (e.g. `ROOM_STATUS_BADGE_CLASSES`, `ROOM_STATUS_DOT_CLASSES`), keyed identically to the existing `badge` prop type already shared by `RoomGroup` and `RoomSidebar` (`"OK" | "Too Cold" | "Too Hot" | null`).

#### 2. Consume shared room-status map

**File**: `src/app/_components/room-group.tsx`, `src/app/_components/room-sidebar.tsx`

**Intent**: Delete the local `BADGE_STYLE` (room-group.tsx:14-18) and `BADGE_DOT` (room-sidebar.tsx:17-21) constants; import and use the new shared module's exports in their place.

**Contract**: No change to either component's rendered output or props.

#### 3. Device-type color map

**File**: `src/lib/device-type-colors.ts` (new)

**Intent**: Define one shared module exporting the sensor/valve/plug badge color mapping, copied verbatim from `device-card.tsx`'s current `TYPE_BADGE` (lines 14-18). `setup/device-table.tsx`'s identical-looking copy is deliberately NOT migrated to this module — Setup stays out of scope for this pass, so that file keeps its own independent copy.

**Contract**: Export one `Record<"sensor" | "valve" | "plug", string>` constant (e.g. `DEVICE_TYPE_BADGE_CLASSES`).

#### 4. Consume shared device-type map

**File**: `src/app/_components/device-card.tsx`

**Intent**: Delete the local `TYPE_BADGE` constant; import and use the new shared module's export in its place.

**Contract**: No change to `DeviceCard`'s rendered output or props.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] Compare a room's status badge (sidebar dot + room-group badge) before/after — colors are pixel-identical
- [ ] Compare device-type badges on `DeviceCard` before/after — colors are pixel-identical
- [ ] Confirm `setup/device-table.tsx`'s badges are visually unchanged (its own copy wasn't touched)

---

## Phase 5: Density tightening

### Overview

Apply the specific spacing reductions identified during research to bring the main dashboard's macro-level spacing in line with the rest of the app's data-dense aesthetic, without restructuring the layout.

### Changes Required:

#### 1. Device overview section spacing

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Reduce the two top-level section gaps from `gap-8` to `gap-6` — the outer container (line 651) and the content wrapper between the filter bar and device list (line 787).

**Contract**: No structural change — Tailwind gap-scale value swap only, at the two named lines.

#### 2. Room device grid spacing

**File**: `src/app/_components/room-group.tsx`

**Intent**: Reduce the device grid's gap from `gap-4` to `gap-3` and the minimum card-row height from `min-h-[80px]` to `min-h-[64px]` (line 82).

**Contract**: No structural change — className value swap only.

#### 3. Filter bar padding

**File**: `src/app/_components/filter-bar.tsx`

**Intent**: Tighten the filter bar's container padding from `px-4 py-3` to `px-3 py-2` (line 62).

**Contract**: No structural change — className value swap only.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] View the dashboard at a typical desktop viewport — spacing feels tighter without feeling cramped; no overlapping or cut-off content
- [ ] Confirm device cards within a room grid still have enough internal room for their content (icon, badge, temperature, setpoint control) at the reduced `min-h`
- [ ] Spot-check on a smaller desktop viewport (e.g. 1366×768) for any newly-cramped areas

---

## Testing Strategy

### Unit Tests:

- No new unit-testable logic is introduced (pure styling/token/structural changes); existing test suites (if any) should continue to pass unmodified.

### Integration Tests:

- N/A — this is a styling-only pass with no API/data-layer changes.

### Manual Testing Steps:

1. Toggle light/dark mode via the existing toggle in `page-shell.tsx` and walk through: dashboard home, a sensor `DeviceModal`, a valve `DeviceModal` (including its History tab and Set button), a triggered toast, and an empty-state view (zero devices, filtered-to-zero).
2. Confirm `setup/*` pages are visually unchanged (out of scope — regression check only).
3. Confirm `TemperatureHistoryModal` is gone and nothing references it (`grep -r "TemperatureHistoryModal" src/`).
4. Compare badge colors (device-type and room-status) before/after Phase 4 — must be pixel-identical, not just "close."
5. Visually compare dashboard density against `room-sidebar.tsx`'s existing tight spacing as a reference point.

## Performance Considerations

None — this pass changes only CSS classes and removes one unused component; no runtime/data-fetching behavior changes.

## Migration Notes

N/A — no data model or schema changes.

## References

- Frame brief: `context/changes/dashboard-ux-redesign/frame.md`
- Change record: `context/changes/dashboard-ux-redesign/change.md`
- S-17 plan (prior token migration scope): `context/changes/visual-ux-redesign/plan.md`
- S-09 plan (original `TemperatureHistoryModal` build): `context/changes/temperature-history/plan.md`
- Existing correct chart-theming pattern: `src/app/_components/room-temperature-panel.tsx:46-119`, `src/app/_components/device-modal.tsx:330-432`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared primitives — Dialog, Toaster, ErrorMessage

#### Automated

- [x] 1.1 Type checking passes — 2c0fcc7
- [x] 1.2 Linting passes — 2c0fcc7
- [x] 1.3 Build succeeds — 2c0fcc7

#### Manual

- [x] 1.4 DeviceModal readable in light mode (background/title/description/close) — 2c0fcc7
- [x] 1.5 DeviceModal no regression in dark mode — 2c0fcc7
- [x] 1.6 Toast follows light theme — 2c0fcc7
- [x] 1.7 Toast no regression in dark mode — 2c0fcc7
- [x] 1.8 ErrorMessage page variant readable in light mode — 2c0fcc7

### Phase 2: Dead code removal + device-modal one-off fixes

#### Automated

- [x] 2.1 Type checking passes — 4ff0174
- [x] 2.2 Linting passes — 4ff0174
- [x] 2.3 Build succeeds — 4ff0174
- [x] 2.4 No remaining references to TemperatureHistoryModal — 4ff0174

#### Manual

- [x] 2.5 Valve DeviceModal "Set" button styled via shared Button, setpoint still submits — 4ff0174
- [x] 2.6 Setpoint slider usable and consistent in both themes — 4ff0174

### Phase 3: Offline/dim-state token cleanup

#### Automated

- [x] 3.1 Type checking passes — e94bda5
- [x] 3.2 Linting passes — e94bda5
- [x] 3.3 Build succeeds — e94bda5

#### Manual

- [x] 3.4 Offline device badge/text/temperature legible in light mode — e94bda5
- [x] 3.5 Empty-state views legible in both light and dark mode — e94bda5

### Phase 4: Badge/status color consolidation

#### Automated

- [x] 4.1 Type checking passes — 72e3dcf
- [x] 4.2 Linting passes — 72e3dcf
- [x] 4.3 Build succeeds — 72e3dcf

#### Manual

- [x] 4.4 Room status badge + sidebar dot colors pixel-identical before/after — 72e3dcf
- [x] 4.5 Device-type badge colors pixel-identical before/after — 72e3dcf
- [x] 4.6 Setup device-table badges visually unchanged — 72e3dcf

### Phase 5: Density tightening

#### Automated

- [x] 5.1 Type checking passes — 97eded7
- [x] 5.2 Linting passes — 97eded7
- [x] 5.3 Build succeeds — 97eded7

#### Manual

- [x] 5.4 Dashboard spacing tighter without feeling cramped at typical desktop viewport — 97eded7
- [x] 5.5 Device card content still fits at reduced min-h — 97eded7
- [x] 5.6 No newly-cramped areas at 1366×768 — 97eded7
