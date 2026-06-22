---
date: 2026-06-10T13:25:19+00:00
researcher: Claude Sonnet 4.6
git_commit: 00e1002a690d894233446f106e348f8971c0e5a8
branch: main
repository: 10xdevs
topic: "UX/UI Polish — baseline audit for skeleton states, empty states, toast feedback, error UX, visual consistency"
tags: [research, ux-polish, ui, loading-states, empty-states, toast, error-handling, icons, tailwind]
status: complete
last_updated: 2026-06-10
last_updated_by: Claude Sonnet 4.6
---

# Research: UX/UI Polish Baseline

**Date**: 2026-06-10T13:25:19+00:00
**Researcher**: Claude Sonnet 4.6
**Git Commit**: 00e1002a690d894233446f106e348f8971c0e5a8
**Branch**: main
**Repository**: 10xdevs

## Research Question

What is the current state of UI infrastructure, loading/error/empty state handling, mutation feedback, and visual consistency in the codebase? Identify all gaps that the UX/UI polish slice (S-14) must address.

## Summary

The app is a hand-rolled dark-theme dashboard with **zero design-system dependencies**. No shadcn/ui, no toast library, no icon library. Loading states are plain text, error states leak raw API messages, success is silent, and navigation is two bare Links. The visual layer is coherent in palette but un-tokenized — every color is a hardcoded Tailwind class. Eight bespoke components cover the entire UI surface. The polish slice can deliver maximum impact with minimal disruption: the component count is small, the dark palette is already solid, and the main gaps are additive (install sonner + lucide-react, add Skeleton, add proper empty states).

---

## Detailed Findings

### Area 1: UI Infrastructure

**No component library installed.**
- No `components.json`, no `src/components/ui/` directory, no shadcn/ui packages.
- All 8 UI components are hand-built under `src/app/_components/`.

**No toast / notification library.**
- `package.json` contains no sonner, react-hot-toast, @radix-ui/react-toast, or react-toastify.
- Zero toast imports anywhere in `src/`.
- Current feedback: inline state strings rendered in JSX.

**No icon library.**
- No lucide-react, heroicons, react-icons, or phosphor-icons in `package.json`.
- Icons today: Unicode emoji — `⚙` (U+2699), `✎` (U+270E), `✕` (U+2715) in `src/app/_components/setup/room-manager.tsx:111,119,132`.

**Tailwind CSS v4** (not v3).
- No `tailwind.config.ts` — configuration lives in `src/styles/globals.css` via `@theme` directive.
- Plugin: `@tailwindcss/postcss` in `postcss.config.js`.
- **No CSS custom properties for colors** — the entire UI uses raw Tailwind color tokens (`bg-gray-950`, `bg-blue-600`, etc.). There are no `--color-*` variables. Only `--font-geist-sans` is defined.
- Content paths: auto-detected by v4 (no explicit `content: []` needed).

**Design tokens defined (`src/styles/globals.css`):**
```css
@theme {
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, ...;
}
```
That's it. No color tokens. No spacing tokens.

---

### Area 2: Loading / Error / Empty States

#### Loading States

Every component that fetches data uses the same pattern: `if (isLoading) return <p>Loading…</p>`.

| Component | File:Line | What renders |
|---|---|---|
| DeviceOverview | `src/app/_components/device-overview.tsx:36-37` | `<p className="text-gray-400 text-sm">Loading devices…</p>` |
| SetupShell | `src/app/_components/setup/setup-shell.tsx:12-13` | `<p className="text-gray-400 text-sm">Loading…</p>` |
| RoomThresholdForm | `src/app/_components/setup/room-threshold-form.tsx:44-45` | `<p className="text-gray-500 text-sm">Loading…</p>` |

**Gap**: No skeleton screens, no animated placeholders, no Suspense boundaries. `text-gray-400` vs `text-gray-500` is inconsistent.

Pages use `api.*.prefetch()` server-side (`src/app/page.tsx:8`, `src/app/setup/page.tsx:8-9`), so on first load the data is hydrated — but background refetches (every 30s on the device overview) will briefly show loading state.

**No `loading.tsx` files.** No `Suspense` boundaries anywhere in `src/app/`.

#### Error States

| Component | File:Line | What renders |
|---|---|---|
| DeviceOverview | `src/app/_components/device-overview.tsx:40-45` | `<p className="text-red-400 text-sm">Failed to load devices: {error.message}</p>` — raw API message |
| SetupShell | `src/app/_components/setup/setup-shell.tsx:16-17` | `<p className="text-red-400 text-sm">Failed to load data.</p>` — generic |
| RoomThresholdForm | `src/app/_components/setup/room-threshold-form.tsx:101` | `<p className="text-red-400 text-sm">{formError}</p>` |
| RoomManager | `src/app/_components/setup/room-manager.tsx:66-69` | `<p className="rounded bg-red-900 px-3 py-2 text-red-200 text-sm">{error}</p>` — best styled |
| DeviceAssignmentGrid | `src/app/_components/setup/device-assignment-grid.tsx:82-83` | `<p className="text-red-400 text-xs">{errorById[device.id]}</p>` — per-device |

**Gaps:**
- DeviceOverview exposes raw `error.message` (tRPC internal detail) to users.
- No retry button anywhere.
- No `error.tsx` page-level fallback — an uncaught error would show Next.js default error page.
- No `ErrorBoundary` component in the codebase.
- Three different visual styles for errors with no shared component.

#### Empty States

| Component | File:Line | Coverage |
|---|---|---|
| RoomManager | `src/app/_components/setup/room-manager.tsx:147-150` | `<li className="text-gray-500 text-sm">No rooms yet — add one below.</li>` ✓ |
| DeviceAssignmentGrid | `src/app/_components/setup/device-assignment-grid.tsx:87-91` | `<p className="text-gray-500 text-sm">No devices discovered yet.</p>` ✓ |
| DeviceOverview (filtered) | `src/app/_components/device-overview.tsx:80-83` | `isEmpty` only true when `activeFilterCount > 0 && filteredRooms.length === 0` |

**Critical gap**: When `activeFilterCount === 0` and there are no rooms/devices (fresh setup or polling failure), `DeviceOverview` renders nothing — no message, no hint. The `isEmpty` flag is filter-aware only (`device-overview.tsx:80-83`).

---

### Area 3: Mutation Feedback Patterns

**5 mutations across 3 files.** All in `/setup/` — the main dashboard (`/`) is entirely read-only.

#### Mutation inventory

| Mutation | File:Line | onSuccess | onError |
|---|---|---|---|
| `room.create` | `room-manager.tsx:26-31` | clear input, `invalidate()` | `setError(e.message)` |
| `room.rename` | `room-manager.tsx:34-39` | `setEditingId(null)`, `invalidate()` | `setError(e.message)` |
| `room.delete` | `room-manager.tsx:42-44` | `invalidate()` | `setError(e.message)` |
| `room.setDeviceRoom` | `device-assignment-grid.tsx:26-31` | invalidate room.list + device.overview | `setErrorById(…)` (per-device) |
| `room.setThreshold` | `room-threshold-form.tsx:36-41` | `onClose()`, invalidate device.overview | `setFormError(e.message)` |

Note: `device.setpoint` mutation is defined server-side (`src/server/api/routers/device.ts`) but **not called from any UI component** — S-04 is blocked.

#### Success feedback gap

**No mutation has a success toast or any positive signal.** Users infer success from:
- The form closing (threshold form)
- The input clearing (room create)
- The list updating after cache refetch

A user saving a threshold and seeing the modal close gets no explicit "Saved!" — they just hope the data updated.

#### Loading feedback (button-level only)

All mutations use `mutation.isPending` to disable buttons and swap text:
- `"Save" → "Saving…"` — `room-threshold-form.tsx:105-108`
- `"Add" → "Adding…"` — `room-manager.tsx:171-177`
- Delete button disabled during delete — `room-manager.tsx:123`
- Per-device select disabled + `"Saving…"` text — `device-assignment-grid.tsx:79-81`

The device assignment grid has the best pattern: per-item loading state via `savingById` map + `onSettled` to clear it (`device-assignment-grid.tsx:33-42`). This pattern should be preserved.

#### Error display inconsistency

Three distinct error display styles, no shared component:
1. **Red box banner** (best): `bg-red-900 px-3 py-2 text-red-200` — `room-manager.tsx:66-69`
2. **Red text below form**: `text-red-400 text-sm` — `room-threshold-form.tsx:101`
3. **Tiny inline red text**: `text-red-400 text-xs` per-device — `device-assignment-grid.tsx:82-83`

All error strings are raw `e.message` from tRPC — potential for internal error detail leaking to users.

#### Cache invalidation pattern

Post-mutation, all components invalidate via `utils.*.invalidate()`. No optimistic updates, no `setData`. The `invalidate()` helper in `room-manager.tsx:21-23` is a clean pattern worth reusing. No `router.refresh()` or `revalidatePath` — purely client-side React Query.

---

### Area 4: Visual Baseline

#### Page structure

Both dashboard and setup share identical page shells:
```tsx
<main className="min-h-screen bg-gray-950 px-6 py-8 text-white">
  <div className="flex items-center justify-between">
    <h1 className="font-bold text-2xl">…</h1>
    <Link className="text-gray-400 text-sm transition-colors hover:text-white" href="…">…</Link>
  </div>
  {/* content */}
</main>
```
This is a copy-paste pattern with no shared `PageHeader` or layout component.

Login page is a **light-mode island**: `bg-gray-50` background, `bg-white` card, `text-gray-900` headings — contradicts the dark theme of every other page.

**No persistent nav component.** Navigation = two bare `<Link>` elements, no active state, no icons.

#### Card anatomy (canonical pattern used in 5 places)

```
rounded-lg border border-gray-700 bg-gray-800 p-4
```

No `shadow-*` classes on any dark card. The only shadow in the app is on the login card (`shadow` — `login/page.tsx`). Cards rely entirely on border + background contrast.

#### Button inconsistencies

Three similar primary button variants, no shared component:
- Login submit: `rounded bg-blue-600 px-4 py-2 font-medium text-sm text-white hover:bg-blue-700 focus:outline-none`
- Room add: `rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50`
- Threshold save: `rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50`

`px-3 py-1.5` vs `px-4 py-2` — unintentional size difference.

#### Color palette audit

The dark palette is internally consistent: `gray-950` (page) → `gray-900` (inputs) → `gray-800` (cards) → `gray-700` (borders/inactive) → `gray-600` (secondary borders) — a clear depth hierarchy.

Problem areas:
- `bg-yellow-100 text-yellow-800` stale badge in `device-card.tsx` — light-on-dark island
- `bg-red-50 text-red-700` login error — light-mode only
- Login page entirely light while rest is dark

Raw color counts (top backgrounds): `bg-gray-800×7`, `bg-blue-600×7`, `bg-gray-900×6`, `bg-gray-950×2`.

#### Typography

Single font: **Geist Sans** via `next/font/google`. No prose classes.

Size hierarchy: `text-2xl` (page h1s) → `text-xl` (room names) → `text-lg` (section headings) → `text-sm` (body, dominant at 38 uses) → `text-xs` (badges, metadata).

---

## Code References

- `src/app/_components/device-overview.tsx:36-45` — loading + error patterns, filter-aware empty state
- `src/app/_components/device-overview.tsx:80-83` — isEmpty gap (filter-only, misses zero-device case)
- `src/app/_components/setup/room-manager.tsx:26-44` — all 3 room mutations, error/success patterns
- `src/app/_components/setup/room-manager.tsx:66-69` — best error display style (red box banner)
- `src/app/_components/setup/room-manager.tsx:111,119,132` — Unicode emoji icons
- `src/app/_components/setup/device-assignment-grid.tsx:26-42` — best mutation pattern (per-item loading)
- `src/app/_components/setup/room-threshold-form.tsx:36-41` — threshold mutation, success = silent close
- `src/app/_components/device-card.tsx:21` — canonical card classes
- `src/app/login/page.tsx` — light-mode island
- `src/styles/globals.css` — only `--font-geist-sans` defined, no color tokens
- `postcss.config.js` — Tailwind v4 setup

---

## Architecture Insights

1. **All mutations live in setup pages.** The main dashboard is purely read-only. Toast feedback will serve the `/setup` flow almost exclusively.

2. **8 components, well-bounded scope.** The polish slice touches all 8 but the surface is manageable. No deep component trees or compound patterns to untangle.

3. **Dark palette hierarchy is already sound.** `gray-950 → 900 → 800 → 700 → 600` is a natural depth scale. The work is adding missing affordances (shadows, rings, hover states), not repainting the palette.

4. **No CSS variables = mass-replace risk.** Any future color change requires grepping the entire `src/` tree. The polish plan should add a minimal set of semantic CSS variables to globals.css (at minimum: `--card`, `--card-foreground`, `--border`, `--muted`) even if shadcn/ui is not installed.

5. **Tailwind v4 note.** v4 has no `tailwind.config.ts` — plugin registration and theme extension go in `globals.css` via `@plugin` and `@theme`. Adding `tailwindcss-animate` requires `@plugin "tailwindcss-animate"` in globals.css, not a config file.

6. **The device-assignment-grid per-item loading pattern is the gold standard** in this codebase. Preserve it; generalize the pattern to the room manager mutations.

7. **Login page theming decision is a prerequisite.** If we add a shared `PageShell` component (the copy-paste page header), the login page either needs to opt out of it or adopt the dark theme. This must be resolved before implementation begins.

---

## Historical Context

- `context/changes/room-health-thresholds/plan.md` — introduced `RoomThresholdForm` and the `formError` state pattern; that component's inline error is the second-worst styled of the three error styles.
- `context/changes/live-device-overview/` — introduced the filter-aware `isEmpty` flag; the zero-device case was not considered a priority at that time.
- `context/changes/device-schema/` — established the Drizzle schema; no UI surface in that change.

---

## Open Questions

1. **shadcn/ui or not?** Installing shadcn/ui (`Button`, `Input`, `Select`, `Skeleton`, `Badge`, `Toaster`) would make the components more consistent and less hand-rolled. Cost: adds `components.json`, a `src/components/ui/` directory, and Radix UI primitives. Benefit: eliminates button/input inconsistencies by convention. Alternative: install just `sonner` + `lucide-react` and manually refactor components — lower dependency footprint, more work. **Owner: user. Block: yes — shapes entire plan scope.**

2. **Login page: dark or keep light?** The login page is intentionally light-mode (white card, gray-50 background — classic login style). Unifying it to dark removes the `bg-white / bg-gray-50` outliers but changes the "landing" visual identity. **Owner: user. Block: no (can default to keeping it light; confirm before implementing).**

3. **Shared `PageShell` component: create one?** Both dashboard and setup pages duplicate the `min-h-screen bg-gray-950 px-6 py-8` + header `flex` pattern. Extracting a `PageShell` is a natural part of polish but is a small structural refactor. **Block: no — safe default is to extract it.**

4. **Error boundary placement: page-level or app-level?** A single `error.tsx` at `src/app/error.tsx` catches all uncaught errors with a full-page fallback. Page-level `error.tsx` files per route give finer control. **Block: no — app-level is sufficient for this scope.**
