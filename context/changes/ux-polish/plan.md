# UX/UI Polish Implementation Plan

## Overview

Install a design-system foundation (shadcn/ui + sonner + lucide-react + tailwindcss-animate), fix every UX gap surfaced by the baseline audit (silent mutations, plain-text loading, zero-device empty state bug), unify all form components via shadcn primitives, and finish with a full visual redesign: glassmorphism cards, page gradient, dark login, hero section, enhanced empty states, and micro-animations.

## Current State Analysis

Eight hand-rolled components under `src/app/_components/`. No design system, no toast library, no icon library. Icons are Unicode emoji. Loading states are plain text. Success is completely silent — five mutations give zero positive feedback. Three inconsistent error display styles. A critical empty-state bug: `DeviceOverview` with zero devices and no active filters renders nothing. Login page is a light-mode island (`bg-gray-50`) in an otherwise dark app. No CSS variables for colors — every color is a raw Tailwind token. No CSS animation plugin.

## Desired End State

**Dashboard (/):** radial-gradient dark background, glassmorphism device cards with hover lift, skeleton device grid on load, "No devices discovered" empty state (lucide icon + description) when polling returns empty, hero section with subtitle and quick-stats row. Navigation link has an icon.

**Setup (/setup):** skeleton loading for room list and device grid, lucide icons replacing emoji in room-manager, success toast on every room/threshold save, unified error messages (styled, no raw tRPC messages), enhanced empty states with lucide icon + CTA.

**Login (/login):** dark theme matching the app (glassmorphism card on dark background), no more light-mode island.

**Throughout:** shadcn Button/Input/Select/Badge used everywhere, app-level error boundary for uncaught errors, `ErrorMessage` component unifying all three error styles.

### Key Discoveries

- `src/app/_components/setup/room-manager.tsx:111,119,132` — emoji icons `⚙ ✎ ✕` (replace with lucide `Settings`, `Pencil`, `X`)
- `src/app/_components/device-overview.tsx:80-83` — `isEmpty` is filter-gated; zero-device case falls through to silent render
- `src/app/_components/device-overview.tsx:40-45` — exposes raw `error.message` to users
- `src/app/_components/setup/room-manager.tsx:66-69` — best existing error style (red box banner) — generalize into `ErrorMessage` variant
- `src/styles/globals.css` — only `--font-geist-sans` defined; shadcn init will add all color CSS variables here
- `postcss.config.js` — Tailwind v4 via `@tailwindcss/postcss`; shadcn CLI auto-detects v4 and generates v4-compatible output
- Five mutations, all in setup files; none give success feedback; `setDeviceRoom` has the best per-item loading pattern — preserve it
- `src/app/_components/device-card.tsx` — `bg-yellow-100 text-yellow-800` stale badge is light-on-dark, visually broken

## What We're NOT Doing

- No new API routes or tRPC procedures
- No database schema changes
- No Suspense streaming or React Server Component changes — all data fetching patterns stay as-is
- No E2E tests in this slice (visual changes are manual-verified; existing Vitest server tests are unaffected)
- No dark-mode toggle — the app is dark-only
- No framer-motion — animations via `tailwindcss-animate` only
- No shadcn Dialog/Sheet/Dropdown for existing flows — scope is Button, Input, Select, Skeleton, Badge, Sonner
- Automated deploy or CI changes — out of scope (S-06)
- `setDeviceRoom` mutation does not get a success toast — its per-item loading/saving text is sufficient

## Implementation Approach

Four sequential phases, each independently shippable. Phase 1 installs the foundation that all subsequent phases depend on. Phase 2 delivers the priority UX wins (toast, icons, skeleton, empty state fix, error boundary). Phase 3 unifies all interactive components via shadcn. Phase 4 applies the visual redesign. Each phase ends with `npm run ci` passing and a manual visual check before proceeding.

## Critical Implementation Details

- **shadcn init modifies globals.css**: `npx shadcn@latest init` will inject CSS variable declarations into `src/styles/globals.css`. The existing `@theme { --font-sans: ... }` block will be preserved but the file will grow. After init, verify the font variable and `@plugin "@tailwindcss/postcss"` import are intact. Base color: `neutral`. Style: `new-york`.

- **Select API contract change**: shadcn `<Select>` uses `onValueChange: (value: string) => void` — not a DOM event. Null room assignments require a sentinel string value (e.g., `"unassigned"`) since `<SelectItem value="">` doesn't work reliably. Any `assign(deviceId, null)` call must check `value === "unassigned" ? null : value`.

- **Glassmorphism performance**: `backdrop-blur` on 50+ device cards simultaneously can drop frame rate on integrated GPUs. Use `backdrop-blur-[2px]` (very subtle) on individual device cards. Reserve `backdrop-blur-md` for panel-level containers (filter bar, room sections, setup panels). The gradient background blobs must be behind a `fixed -z-10` layer, not a stacking-context sibling to the cards.

- **shadcn Badge with custom color maps**: `device-card.tsx` and `room-group.tsx` both use object maps (`TYPE_BADGE`, `BADGE_STYLE`) that return raw Tailwind color classes. shadcn Badge supports `className` override via `cn()` — use this approach rather than trying to map to shadcn variants, since the health/type colors don't align with shadcn's destructive/secondary/outline vocabulary.

---

## Phase 1: Foundation — shadcn/ui, sonner, lucide-react, tailwindcss-animate

### Overview

Install all new dependencies and wire them into the project. No visible UI changes except the Toaster component in layout. This phase is the prerequisite for all later phases.

### Changes Required

#### 1. shadcn/ui initialization

**File**: project root (CLI command, then `components.json` + `src/styles/globals.css` + `src/lib/utils.ts`)

**Intent**: Run `npx shadcn@latest init` to scaffold the design system foundation. The CLI creates `components.json`, generates `src/lib/utils.ts` with the `cn()` helper, and injects CSS variable declarations into `globals.css`.

**Contract**: Use style `new-york`, base color `neutral`, CSS variables enabled, aliases `@/components` and `@/lib`. After init, `globals.css` must have `:root` and `.dark` blocks with shadcn color variables alongside the existing `@theme { --font-sans: ... }` block. Verify `@plugin "@tailwindcss/postcss"` and font variable survived.

#### 2. shadcn component installs

**Files**: `src/components/ui/button.tsx`, `input.tsx`, `select.tsx`, `skeleton.tsx`, `badge.tsx`, `sonner.tsx`

**Intent**: Install six shadcn components that subsequent phases will use.

**Contract**: Run `npx shadcn@latest add button input select skeleton badge sonner`. Each generates a component file under `src/components/ui/`. `sonner.tsx` re-exports the `Toaster` from the `sonner` package with theme-aware props. lucide-react is installed as a side effect.

#### 3. tailwindcss-animate plugin

**File**: `src/styles/globals.css`

**Intent**: Register `tailwindcss-animate` so its `animate-*` utilities are available in Tailwind v4.

**Contract**: `npm install tailwindcss-animate`, then add `@plugin "tailwindcss-animate"` as the first line of `globals.css` (before `@import "tailwindcss"`). In Tailwind v4, plugins are registered in CSS via `@plugin`, not in a config file.

#### 4. Wire Toaster in root layout

**File**: `src/app/layout.tsx`

**Intent**: Render the sonner `Toaster` once at the app root so toast notifications work on every page.

**Contract**: Import `{ Toaster }` from `@/components/ui/sonner`. Place `<Toaster richColors position="bottom-right" />` as the last child inside the `<body>` element, after the `{children}` render.

### Success Criteria

#### Automated Verification

- `npm run ci` passes (lint + typecheck + tests + build) after init and all installs
- `src/components/ui/button.tsx`, `input.tsx`, `select.tsx`, `skeleton.tsx`, `badge.tsx`, `sonner.tsx` all exist
- `src/lib/utils.ts` exists with the `cn()` export
- `components.json` exists at project root
- `globals.css` contains `:root { --background:` (shadcn color variables present)

#### Manual Verification

- No visual change on any page (foundation only)
- Browser console has no errors on `/` or `/setup`

---

## Phase 2: Core UX Wins

### Overview

Deliver the highest-priority user-facing improvements: icon swap, skeleton loading, empty state fix, success toasts, unified error messages, and error boundary. These are the items to ship if time is tight (per agreed priority).

### Changes Required

#### 1. Lucide icon swap in room-manager

**File**: `src/app/_components/setup/room-manager.tsx`

**Intent**: Replace the three Unicode emoji icon buttons with properly-sized Lucide icons so the setup UI looks professional.

**Contract**: Import `{ Settings, Pencil, X }` from `lucide-react`. Replace `⚙` (line 111) with `<Settings size={14} />`, `✎` (line 119) with `<Pencil size={14} />`, `✕` (line 132) with `<X size={14} />`. The surrounding button `className` stays unchanged.

#### 2. Device list skeleton

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Replace the plain "Loading devices…" text with skeleton cards that match the device card grid layout, so the loading state feels intentional.

**Contract**: Import `{ Skeleton }` from `@/components/ui/skeleton`. The `isLoading` branch (currently line 36-37) renders a grid of 6 skeleton cards. Each skeleton card must use the same container classes as `DeviceCard` (`rounded-lg border border-gray-700 bg-gray-800 p-4 h-32`) with inner `Skeleton` elements representing the name, temperature value, and status line. Grid classes must match the device card grid (`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`).

#### 3. Setup shell skeleton

**File**: `src/app/_components/setup/setup-shell.tsx`

**Intent**: Replace the plain "Loading…" text with skeleton rows for the room list so the setup page loads gracefully.

**Contract**: The `isLoading` branch (line 12-13) renders 4 skeleton rows each shaped like a room-list item: `h-12 rounded-lg` `Skeleton` blocks in a `flex flex-col gap-2` container. Below that, a single wider `h-32 rounded-lg` `Skeleton` for the device grid area.

#### 4. DeviceOverview zero-device empty state fix

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Fix the silent render when the polling returns zero devices with no filters active. Users landing on a fresh dashboard currently see nothing — they need a clear signal.

**Contract**: The current `isEmpty` check (line 80-83) is filter-gated. Add a second guard before the main render: if `data.rooms.length === 0 && data.unassigned.length === 0 && activeFilterCount === 0`, render the empty state (not the `isEmpty` filtered variant). Empty state: a centered `<div>` containing `<Layers size={48} className="mx-auto mb-4 text-gray-600" />` (from lucide-react), `<p className="font-semibold text-white">No devices discovered yet</p>`, `<p className="mt-1 text-gray-400 text-sm">The polling worker will surface devices as they respond on the LAN.</p>`.

#### 5. Success toasts on 4 mutations

**Files**: `src/app/_components/setup/room-manager.tsx`, `src/app/_components/setup/room-threshold-form.tsx`

**Intent**: Give users explicit positive confirmation when setup actions succeed. Currently all five mutations are silent on success.

**Contract**: Import `{ toast }` from `sonner` in both files. Add `toast.success(message)` as the first line of each `onSuccess` handler:
- `createMutation` → `toast.success("Room created")`
- `renameMutation` → `toast.success("Room renamed")`
- `deleteMutation` → `toast.success("Room deleted")`
- `setThreshold mutation` → `toast.success("Thresholds saved")`

`setDeviceRoom` mutation (`device-assignment-grid.tsx`) does NOT get a success toast — its per-item `"Saving…"` inline state is sufficient for the drag-and-drop-like UX.

#### 6. Unified ErrorMessage component

**File**: `src/components/ui/error-message.tsx`

**Intent**: Replace three inconsistent error display styles across the codebase with a single component that has `inline`, `banner`, and `page` variants.

**Contract**: Props: `{ message: string | null | undefined; variant?: "inline" | "banner" | "page" }`. Returns `null` when `message` is falsy. Variants:
- `inline` — `<p className="text-destructive text-sm">{message}</p>` (uses shadcn CSS variable)
- `banner` — `<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm">{message}</div>`
- `page` — centered flex column with `<AlertTriangle size={24} />` from lucide, heading, and message text

After creating the component, replace in:
- `device-overview.tsx:40-45` → `<ErrorMessage variant="inline" message="Failed to load devices. Please try again." />` (remove raw `error.message`)
- `setup-shell.tsx:16-17` → `<ErrorMessage variant="inline" message="Failed to load data." />`
- `room-manager.tsx:66-69` → `<ErrorMessage variant="banner" message={error} />`
- `room-threshold-form.tsx:101` → `<ErrorMessage variant="inline" message={formError} />`
- `device-assignment-grid.tsx:82-83` → `<ErrorMessage variant="inline" message={errorById[device.id]} />`

#### 7. App-level error.tsx

**File**: `src/app/error.tsx`

**Intent**: Catch uncaught runtime errors at the app boundary and show a friendly fallback instead of Next.js's default error page.

**Contract**: `"use client"` directive. Props: `{ error: Error; reset: () => void }`. Renders: centered `<AlertTriangle size={48} className="text-destructive" />`, `<h1>Something went wrong</h1>`, `<p>{error.message}</p>` (sanitized — skip if message looks like an internal stack trace), and a `<Button onClick={reset}>Try again</Button>` using shadcn Button.

### Success Criteria

#### Automated Verification

- `npm run ci` passes after all Phase 2 changes
- TypeScript: no errors on `ErrorMessage` import sites
- `src/components/ui/error-message.tsx` exists
- `src/app/error.tsx` exists with `"use client"` on line 1

#### Manual Verification

- Skeleton device grid appears on dashboard while loading (visible on hard reload)
- Skeleton setup rows appear on /setup while loading
- Room create → toast "Room created" appears bottom-right
- Room rename → toast "Room renamed"
- Room delete → toast "Room deleted"
- Threshold save → toast "Thresholds saved"
- `device-assignment-grid` room select: no toast (only inline saving text)
- Manually break a tRPC call (e.g., kill DB) → `ErrorMessage` renders styled, no raw error.message in DeviceOverview
- Navigate to `/` with no devices seeded → zero-device empty state renders with `Layers` icon
- Emoji icons gone from room-manager — lucide `Settings`, `Pencil`, `X` visible

---

## Phase 3: Component Unification

### Overview

Replace all raw `<button>`, `<input>`, and `<select>` elements with shadcn primitives to eliminate button-size inconsistency, input-style duplication, and the light-mode native select appearance. Extract a shared `PageShell` to eliminate the copy-paste page header pattern.

### Changes Required

#### 1. PageShell component

**File**: `src/components/page-shell.tsx`

**Intent**: Extract the copy-paste page header pattern (`min-h-screen bg-gray-950 px-6 py-8` + `flex justify-between` header row) into a reusable component.

**Contract**: Props: `{ title: string; rightContent?: React.ReactNode; children: React.ReactNode }`. Renders a `<main>` with the page background classes, a `<div className="mb-8 flex items-center justify-between">` header containing `<h1>` and `rightContent`, then `{children}`. Phase 4 will update the background classes here when adding glassmorphism; Phase 3 just moves existing classes in.

After creating:
- `src/app/page.tsx` — replace inline `<main>` + header with `<PageShell title="Tuya Dashboard" rightContent={<Link href="/setup">…</Link>}>`
- `src/app/setup/page.tsx` — replace with `<PageShell title="Room Setup" rightContent={<Link href="/">…</Link>}>`

#### 2. shadcn Button across all components

**Files**: `src/app/_components/setup/room-manager.tsx`, `src/app/_components/setup/room-threshold-form.tsx`, `src/app/login/page.tsx`, `src/app/_components/filter-bar.tsx`

**Intent**: Replace all raw `<button>` elements with the shadcn `Button` component to get a unified size scale and consistent disabled/hover states across the app.

**Contract**: Import `{ Button }` from `@/components/ui/button`. Variant mapping:
- Blue-filled buttons (create room, save, submit) → `<Button>` (default variant)
- Cancel/outline buttons → `<Button variant="outline">`
- Ghost text buttons (clear filters) → `<Button variant="ghost" size="sm">`
- Active filter toggle → `<Button size="sm">` (default)
- Inactive filter toggle → `<Button variant="secondary" size="sm">`
- Destructive delete → `<Button variant="destructive" size="sm">`
- Icon-only action buttons (settings, rename) → `<Button variant="ghost" size="icon">` wrapping the lucide icon

Remove redundant `disabled:opacity-50`, `hover:bg-blue-700`, and `focus:outline-none` classes — shadcn Button handles these via its own styles.

#### 3. shadcn Input across all form files

**Files**: `src/app/_components/setup/room-manager.tsx`, `src/app/_components/setup/room-threshold-form.tsx`, `src/app/login/page.tsx`, `src/app/_components/filter-bar.tsx`

**Intent**: Replace raw `<input>` elements with shadcn `Input` to unify styling and get CSS-variable-based focus rings.

**Contract**: Import `{ Input }` from `@/components/ui/input`. Drop-in replacement — shadcn `Input` accepts all standard HTML input props. Remove the manual `border`, `bg-gray-900`, `focus:ring-1 focus:ring-blue-500` classes — shadcn Input supplies these via `--border` and `--ring` CSS variables. For number inputs in `room-threshold-form.tsx`, add `type="number"` and keep `min`/`max`/`step` props.

#### 4. shadcn Select for room assignment and filter

**Files**: `src/app/_components/setup/device-assignment-grid.tsx`, `src/app/_components/filter-bar.tsx`

**Intent**: Replace native `<select>` elements with shadcn `Select` to get a consistent dark-themed dropdown instead of the browser's native light select.

**Contract**: Import `{ Select, SelectContent, SelectItem, SelectTrigger, SelectValue }` from `@/components/ui/select`. API change: use `value`/`onValueChange` instead of `value`/`onChange`.

For `device-assignment-grid.tsx`: the null room case must use sentinel value `"unassigned"`. Pass `value={device.roomId ?? "unassigned"}`. In `onValueChange`, call `assign(device.id, value === "unassigned" ? null : value)`. Options: one `<SelectItem value="unassigned">Unassigned</SelectItem>` plus one per room.

For `filter-bar.tsx`: room filter uses `value={roomId ?? "all"}` and `onValueChange={(v) => setRoomId(v === "all" ? null : v)}`. The "all rooms" option uses value `"all"`.

#### 5. shadcn Badge for device type and health status

**Files**: `src/app/_components/device-card.tsx`, `src/app/_components/room-group.tsx`

**Intent**: Replace raw `<span>` badge elements with shadcn `Badge` for consistent padding, border-radius, and text sizing.

**Contract**: Import `{ Badge }` from `@/components/ui/badge`. The existing `TYPE_BADGE` and `BADGE_STYLE` color maps return raw bg/text classes — pass these as the `className` prop using `cn()` from `@/lib/utils`:

```tsx
import { cn } from "@/lib/utils";
<Badge className={cn("font-medium", TYPE_BADGE[device.type])}>
  {device.type}
</Badge>
```

shadcn Badge uses `variant` for its own styles but `className` overrides work fine. Keep the existing color maps — they're correct, just switch the rendered element.

### Success Criteria

#### Automated Verification

- `npm run ci` passes after all Phase 3 changes
- No TypeScript errors on any Select import site (sentinel value pattern is typed correctly)
- `src/components/page-shell.tsx` exists

#### Manual Verification

- Dashboard and setup pages render identically to Phase 2 end state (PageShell extraction is transparent)
- Room manager: all buttons visually consistent, delete is destructive-red
- Setup form: number inputs accept decimal values, save/cancel button sizes match
- Device assignment select: dropdown opens with dark styling, "Unassigned" option works, null assignment submits correctly
- Room filter select: "All rooms" shows all devices, selecting a room filters correctly
- Device type badges and health badges render with correct colors

---

## Phase 4: Visual Redesign

### Overview

Full visual uplift: glassmorphism card treatment, radial-gradient page background, hero section on dashboard, dark login page, enhanced empty states with Lucide icons, stale badge dark fix, and CSS animation on card interactions. This phase changes the visual character of the app from "functional dark UI" to "polished dashboard."

### Changes Required

#### 1. Background gradient and color blobs

**File**: `src/app/layout.tsx`

**Intent**: Give the app a rich dark background with subtle colored blobs that make the glassmorphism effect on cards meaningful — backdrop-blur needs something behind it to blur.

**Contract**: Inside `<body>`, before `{children}`, add a `<div className="fixed inset-0 -z-10 overflow-hidden bg-gray-950">` containing two absolutely-positioned blur blobs:
- `<div className="absolute -top-40 -left-20 h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-3xl" />`
- `<div className="absolute -bottom-40 -right-20 h-[500px] w-[500px] rounded-full bg-purple-600/8 blur-3xl" />`

Remove `bg-gray-950` from the `PageShell` `<main>` after adding it to the fixed layer, so the page body is transparent and the blobs show through.

#### 2. Glassmorphism card treatment

**Files**: `src/app/_components/device-card.tsx`, `src/app/_components/setup/device-assignment-grid.tsx`, `src/app/_components/setup/room-manager.tsx`, `src/app/_components/setup/room-threshold-form.tsx`, `src/app/_components/filter-bar.tsx`

**Intent**: Convert all cards from solid `bg-gray-800` to frosted glass panels that interact with the gradient background.

**Contract**: Replace the canonical card pattern (`rounded-lg border border-gray-700 bg-gray-800`) with `rounded-xl border border-white/10 bg-white/5 backdrop-blur-[2px]`. Use `backdrop-blur-[2px]` (not `backdrop-blur-sm` = 4px) on individual device cards to limit per-card GPU cost. Panel-level containers (filter bar, room-manager container, setup sections) can use `backdrop-blur-sm`.

Add to `device-card.tsx`: `transition-all duration-200 hover:border-white/20 hover:bg-white/8` for hover lift.

`room-threshold-form.tsx` nested form panel: `rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm` (slightly darker than parent card).

#### 3. Card enter animation

**File**: `src/app/_components/device-card.tsx`

**Intent**: Device cards fade-and-slide in on first render using tailwindcss-animate utilities.

**Contract**: Add `animate-in fade-in slide-in-from-bottom-2 duration-300` to the outer `<div>` of `DeviceCard`. These classes come from the `tailwindcss-animate` plugin registered in Phase 1.

#### 4. Hero section on dashboard

**File**: `src/app/page.tsx` (via `PageShell` or inline)

**Intent**: Elevate the dashboard header from a plain `<h1>` to a hero section with subtitle, giving the app a product identity.

**Contract**: Below the `<h1>Tuya Dashboard</h1>`, add `<p className="mt-1 text-gray-400 text-sm">LAN-only device monitoring — no cloud required</p>`. Add a quick-stats row beneath: three stat chips showing total device count, online count, and room count — derived from the existing `data` returned by `api.device.overview.useQuery()`. Stats chips: `<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-gray-300 text-xs">`. Show skeleton pills during loading.

#### 5. Dark login page

**File**: `src/app/login/page.tsx`

**Intent**: Unify login with the app's dark theme — it is currently a light-mode island.

**Contract**: Change `<main className="... bg-gray-50">` to `bg-transparent` (the fixed background from Phase 4.1 shows through). Card: `bg-white` → `bg-white/5 backdrop-blur-sm border border-white/10`. All `text-gray-900` labels → `text-white`. All `text-gray-700` labels → `text-gray-300`. Input styling: shadcn Input already adapts to dark via CSS variables (Phase 3). Login error banner: uses `ErrorMessage variant="banner"` (Phase 2). Submit button: shadcn Button default (Phase 3).

#### 6. Enhanced empty states with Lucide

**Files**: `src/app/_components/device-overview.tsx`, `src/app/_components/setup/room-manager.tsx`, `src/app/_components/setup/device-assignment-grid.tsx`

**Intent**: Upgrade existing placeholder text to visually complete empty states with a large icon, descriptive text, and where applicable a CTA button.

**Contract**: Each empty state: centered `<div className="flex flex-col items-center justify-center py-16 text-center">` containing:
- Lucide icon at `size={48}` with `className="mb-4 text-gray-600"`
- `<p className="font-semibold text-white">` — empty state heading
- `<p className="mt-1 max-w-xs text-gray-400 text-sm">` — helpful description

Icon mapping:
- `DeviceOverview` (zero devices, no filter) → `Layers` icon. Already added in Phase 2 — Phase 4 adds the centered layout and description text.
- `DeviceOverview` (filtered, no results) → `Search` icon + "No devices match your filters" + `<Button variant="ghost" onClick={clearFilters}>Clear filters</Button>`
- `RoomManager` (no rooms) → `Building2` icon + "No rooms yet" + "Add a room below to start organizing your devices."
- `DeviceAssignmentGrid` (no devices) → `Wifi` icon + "No devices discovered" + "Devices will appear here once the polling worker finds them on the LAN."

#### 7. Stale badge dark fix

**File**: `src/app/_components/device-card.tsx`

**Intent**: Fix the `bg-yellow-100 text-yellow-800` stale badge that renders as a light chip inside a dark card — visually jarring.

**Contract**: Replace `rounded bg-yellow-100 px-1 text-xs text-yellow-800` with `rounded bg-yellow-900/40 px-1 text-xs text-yellow-300 border border-yellow-700/40`.

#### 8. Room-threshold-form skeleton

**File**: `src/app/_components/setup/room-threshold-form.tsx`

**Intent**: The form loads existing threshold values before rendering inputs (line 44-45 has `isLoading` check). Replace plain "Loading…" text with skeleton inputs matching the form layout.

**Contract**: The `isLoading` branch renders three `<Skeleton className="h-9 w-24 rounded-md" />` elements in the same `flex gap-4` layout as the actual number inputs, plus a `<Skeleton className="h-9 w-20 rounded-md" />` for the save button position.

### Success Criteria

#### Automated Verification

- `npm run ci` passes after all Phase 4 changes
- No TypeScript errors on any Phase 4 files
- `next build` completes without warnings about missing `backdrop-blur` or animation classes

#### Manual Verification

- Dashboard background: dark with subtle blue and purple blobs visible (most visible with glassmorphism cards)
- Device cards: frosted glass effect on dashboard (bg-white/5 + border-white/10 + backdrop-blur visible)
- Device cards: hover state lifts (border brightens, slight bg change, smooth transition)
- Device cards: animate-in on first page load (fade + slide from bottom)
- Dashboard hero: subtitle "LAN-only device monitoring" visible, stats chips show device/room counts
- Login page: dark card on dark background — no white background visible
- Empty state (zero devices): large `Layers` icon + text centered on dashboard
- Empty state (no rooms in setup): `Building2` icon + text visible
- Empty state (no devices in assignment grid): `Wifi` icon + text visible
- Stale badge: dark yellow chip (not white/yellow) on device card
- Threshold form loading: skeleton inputs instead of plain "Loading…"
- All pages: no horizontal scroll on desktop

---

## Testing Strategy

### Unit / Integration Tests

No new tests introduced in this slice. The existing `vitest run` suite tests server-side tRPC procedures — none of these are touched by UI-only changes. All four phases must keep `npm run ci` green.

### Manual Testing Steps

1. **Phase 1 gate**: Load `/`, `/setup`, `/login` — no JS errors, no visual regressions
2. **Phase 2 gate**: Create/rename/delete a room → toast appears. Save threshold → toast appears. Disconnect DB → `ErrorMessage` renders (not raw tRPC error). Hard-reload `/` with no devices → zero-device empty state shows
3. **Phase 3 gate**: Test every form interaction (room create, room rename, threshold save, device assign, filter, login). Verify Select dropdowns open with dark styling. Verify null assignment ("Unassigned") submits correctly
4. **Phase 4 gate**: Visual review at 1440px and 1280px. Verify glassmorphism visible. Verify login is dark. Verify hero stats correct. Verify all empty states show icons

## Performance Considerations

`backdrop-blur` is GPU-composited — limit to `backdrop-blur-[2px]` on individual device cards (up to 50 on screen). If frame rate visibly drops during scroll, remove `backdrop-blur` from `device-card.tsx` while keeping it on panel-level containers (filter bar, setup sections). The `fixed -z-10` gradient layer is painted once and does not repaint on scroll.

## Migration Notes

No database changes. No API changes. The `cn()` utility from `src/lib/utils.ts` (created in Phase 1) is a required import for any file using shadcn Badge with className overrides. Existing components that do not use shadcn components do not need to import `cn()`.

## References

- Research: `context/changes/ux-polish/research.md`
- shadcn/ui Tailwind v4 guide: https://ui.shadcn.com/docs/installation/next (v4 section)
- `src/app/_components/setup/device-assignment-grid.tsx:26-42` — per-item loading pattern to preserve
- `src/app/_components/setup/room-manager.tsx:21-24` — `invalidate()` helper pattern

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Foundation — shadcn/ui, sonner, lucide-react, tailwindcss-animate

#### Automated

- [x] 1.1 `npm run ci` passes after init and all installs — a9e00cc
- [x] 1.2 `src/components/ui/button.tsx`, `input.tsx`, `select.tsx`, `skeleton.tsx`, `badge.tsx`, `sonner.tsx` all exist — a9e00cc
- [x] 1.3 `src/lib/utils.ts` exists with `cn()` export — a9e00cc
- [x] 1.4 `components.json` exists at project root — a9e00cc
- [x] 1.5 `globals.css` contains `:root { --background:` (shadcn color variables) — a9e00cc

#### Manual

- [ ] 1.6 No visual change on any page — foundation only
- [ ] 1.7 Browser console has no errors on `/` or `/setup`

### Phase 2: Core UX Wins

#### Automated

- [x] 2.1 `npm run ci` passes after all Phase 2 changes
- [x] 2.2 TypeScript: no errors on `ErrorMessage` import sites
- [x] 2.3 `src/components/ui/error-message.tsx` exists
- [x] 2.4 `src/app/error.tsx` exists with `"use client"` on line 1

#### Manual

- [x] 2.5 Skeleton device grid visible on hard reload of dashboard
- [x] 2.6 Skeleton setup rows visible on hard reload of /setup
- [x] 2.7 Room create → toast "Room created" bottom-right
- [x] 2.8 Room rename → toast "Room renamed"
- [x] 2.9 Room delete → toast "Room deleted"
- [x] 2.10 Threshold save → toast "Thresholds saved"
- [x] 2.11 Device assign: no toast (only inline "Saving…" text)
- [x] 2.12 DeviceOverview query error renders `ErrorMessage` — no raw error.message
- [x] 2.13 Zero-device dashboard shows `Layers` icon empty state
- [x] 2.14 room-manager shows lucide icons (no emoji)

### Phase 3: Component Unification

#### Automated

- [ ] 3.1 `npm run ci` passes after all Phase 3 changes
- [ ] 3.2 No TypeScript errors on any Select import site
- [ ] 3.3 `src/components/page-shell.tsx` exists

#### Manual

- [ ] 3.4 All pages render identically to Phase 2 end state after PageShell extraction
- [ ] 3.5 Delete button is destructive-red; save button is default-blue; cancel is outline — across all forms
- [ ] 3.6 Device assignment select: dark dropdown, Unassigned option submits null correctly
- [ ] 3.7 Room filter select: dark dropdown, All rooms / room filter works correctly

### Phase 4: Visual Redesign

#### Automated

- [ ] 4.1 `npm run ci` passes after all Phase 4 changes
- [ ] 4.2 No TypeScript errors on any Phase 4 file
- [ ] 4.3 `next build` completes without warnings

#### Manual

- [ ] 4.4 Dashboard: color blobs visible, glassmorphism device cards (frosted border + bg)
- [ ] 4.5 Device card hover: border brightens, smooth transition
- [ ] 4.6 Device cards: fade-in + slide-from-bottom animation on first load
- [ ] 4.7 Hero section: subtitle and stats chips visible
- [ ] 4.8 Login page: dark card on dark background — no white visible
- [ ] 4.9 Zero-device empty state: large centered icon + text
- [ ] 4.10 No-rooms empty state: `Building2` icon + text
- [ ] 4.11 Stale badge: dark yellow chip (not white)
- [ ] 4.12 Threshold form loading: skeleton inputs not plain text
