# Mobile-Responsive Layout — Implementation Plan

## Overview

Add responsive Tailwind breakpoints to fix horizontal overflow and layout breakage at 375px mobile viewports. Primary focus: dashboard filter bar reflow + PageShell header. Secondary: touch target sizing via button.tsx variants + setup page overflow fixes.

## Current State Analysis

- **Device card grids**: already responsive (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) — no change needed
- **`page-shell.tsx:11`** — `px-6 py-8` and `text-2xl` are fixed; at 375px, header row with long title + "Setup →" nav link is tight
- **`filter-bar.tsx:57`** — container is `flex flex-wrap items-center gap-3`; `<Input className="min-w-32 flex-1">` and `<SelectTrigger className="w-36">` force minimum width; the two fieldsets (4 + 3 buttons) don't wrap predictably
- **`button.tsx:24-28`** — size variants: `default` = `h-8` (32px), `sm` = `h-7` (28px), `icon` = `size-8` (32px) — all below 44px WCAG touch target
- **`room-threshold-form.tsx:88,101,114`** — three `<Input className="w-24">` fixed-width inputs; at 375px with px-4 side padding, the flex-wrap row will overflow when the threshold form opens inline
- **`room-manager.tsx:87`** — action row `flex items-center gap-3` has: name span + device-count badge (~50px) + 2× `size-8` icon buttons + 1× `h-7` destructive button; fits at 375px but is very tight after we raise button sizes
- **`login/page.tsx:15`** — card is `w-full max-w-sm p-8`; `w-full` at 375px gives no side margin — card goes edge-to-edge
- **`error.tsx:16`** — container `flex min-h-screen flex-col items-center justify-center` has no side padding; text at `max-w-md` doesn't clip but looks wrong on narrow screens
- **Viewport meta**: Next.js App Router injects `<meta name="viewport" content="width=device-width, initial-scale=1">` automatically — verified, no action needed

## What We're NOT Doing

- No new API routes, tRPC procedures, or database changes
- No hamburger navigation or responsive nav pattern
- No framer-motion or new animation work
- No SelectTrigger touch target changes (h-8 = 32px is borderline but the popup affordance compensates)
- No full mobile redesign of setup page — overflow fixes only
- No dark-mode toggle or other visual changes

## Implementation Approach

Two sequential phases. Phase 1 covers the dashboard and navigation shell — highest user impact. Phase 2 covers touch targets (button.tsx) and setup overflow fixes. Each phase ends with `npm run ci` passing before proceeding. All changes are pure Tailwind responsive utilities at the usage site — no CSS additions, no viewport hooks.

---

## Phase 1: Dashboard + Navigation Layout

### Overview

Make the primary user surface — the dashboard at `/` — fully usable at 375px. Targets: PageShell header stays single-row, FilterBar stacks vertically on mobile, stat chips wrap cleanly, login card has side margin, error page has side padding.

### Changes Required

#### 1.1 `src/components/page-shell.tsx` — responsive padding and title size

**Current** (`page-shell.tsx:11`):
```tsx
<main className="min-h-screen px-6 py-8 text-white">
  <div className="mb-8 flex items-center justify-between">
    <h1 className="font-bold text-2xl">{title}</h1>
```

**Intent**: Reduce horizontal padding on mobile so content doesn't clip on narrow viewports. Shrink title font size so "Tuya Device Dashboard" + "Setup →" fit on one row at 375px.

**Change**:
- `px-6` → `px-4 sm:px-6`
- `text-2xl` → `text-xl sm:text-2xl`

**After**:
```tsx
<main className="min-h-screen px-4 py-8 text-white sm:px-6">
  <div className="mb-8 flex items-center justify-between">
    <h1 className="font-bold text-xl text-white sm:text-2xl">{title}</h1>
```

**Verification**: At 375px, the header row must not wrap — title and "Setup →" link stay on one line.

#### 1.2 `src/app/_components/filter-bar.tsx` — vertical stack on mobile

**Current** (`filter-bar.tsx:57-115`):
```tsx
<div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl ...">
  <Input className="min-w-32 flex-1 text-sm" ... />
  <Select ...>
    <SelectTrigger className="w-36">...
  </Select>
  <fieldset className="m-0 flex items-center gap-1 border-0 p-0">
    {/* TYPES buttons */}
  </fieldset>
  <fieldset className="m-0 flex items-center gap-1 border-0 p-0">
    {/* STATUSES buttons */}
  </fieldset>
  {activeFilterCount > 0 && <Button size="sm" ...>Clear filters</Button>}
</div>
```

**Intent**: On mobile (< 640px), stack the filter elements vertically — full-width search on top, full-width room select, then type buttons on their own row, status buttons on their own row. On sm+ the current flex-row layout applies unchanged.

**Changes**:
- Container: `flex flex-wrap items-center gap-3` → `flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3`
- Input: `min-w-32 flex-1` → `w-full text-sm sm:min-w-32 sm:flex-1`
- SelectTrigger: `w-36` → `w-full sm:w-36`
- fieldsets: no change (each takes its own row in flex-col automatically)

**After** (container and first two interactive elements):
```tsx
<div className="mb-6 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
  <Input
    className="w-full text-sm sm:min-w-32 sm:flex-1"
    ...
  />
  <Select ...>
    <SelectTrigger className="w-full sm:w-36">
```

**Verification**: At 375px — four distinct rows visible (search, room select, type buttons, status buttons). At 640px+ — all on one row, wrapping as before. No horizontal scroll.

#### 1.3 `src/app/_components/device-overview.tsx` — chip wrap

**Current** — stat chips container (the `flex gap-2` row in the hero section under `<p className="text-gray-400 text-sm">`):

**Intent**: Ensure stat chips wrap on very narrow viewports and empty states don't add excessive vertical space on mobile.

**Changes**:
- Stat chips container: `flex gap-2` → `flex flex-wrap gap-1.5 sm:gap-2`
- Empty state `py-16` → `py-8 sm:py-16` (applies to both `isZeroDevices` and `isFilteredEmpty` empty states)

**Verification**: At 375px, if all 3 stat chips render, they wrap cleanly. Empty states don't push content off-screen.

#### 1.4 `src/app/login/page.tsx` — side margin on mobile

**Current** (`login/page.tsx:15`):
```tsx
<div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-8 shadow backdrop-blur-sm">
```

**Intent**: Add horizontal margin on mobile so the login card doesn't sit flush against screen edges. Reduce internal padding on mobile.

**Change**: `p-8` → `p-6 sm:p-8`, and add `mx-4 sm:mx-0` to the card `div`.

**After**:
```tsx
<div className="mx-4 w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-6 shadow backdrop-blur-sm sm:mx-0 sm:p-8">
```

**Verification**: At 375px, card has visible side margin. At 640px+, centered as before.

#### 1.5 `src/app/error.tsx` — side padding

**Current** (`error.tsx:16`):
```tsx
<div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
```

**Intent**: Add horizontal padding so error text doesn't sit at the very edge of narrow viewports.

**Change**: add `px-4` to the container.

**After**:
```tsx
<div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
```

### Completion Criteria — Phase 1

- [x] `npm run ci` passes
- [ ] At 375px: no horizontal scroll on `/` (dashboard)
- [ ] At 375px: filter bar stacks vertically — 4 rows (search, room, type buttons, status buttons)
- [ ] At 375px: dashboard header (title + "Setup →") fits on one line
- [ ] At 375px: login card has visible side margins
- [ ] At 640px+: filter bar reverts to single-row layout, dashboard unchanged

---

## Phase 2: Touch Targets + Setup Page Fixes

### Overview

Raise critical interactive element heights to ≥40px on mobile by modifying the `button.tsx` size variants (single file, covers all button instances). Fix setup page overflow: threshold form inputs go full-width on mobile and stack vertically; room manager action row gap tightens on mobile to accommodate larger touch-target buttons.

### Changes Required

#### 2.1 `src/components/ui/button.tsx` — responsive touch targets

**Current** (`button.tsx:23-28`):
```tsx
size: {
  default: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
  sm: "h-7 gap-1 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] ...",
  lg: "h-9 gap-1.5 px-2.5 ...",
  icon: "size-8",
  "icon-sm": "size-7 ...",
  "icon-lg": "size-9",
```

**Intent**: Raise touch targets to ≥40px on mobile (xs breakpoint) for the three most-used sizes. `default` (primary form buttons), `sm` (filter toggles, icon-adjacent), `icon` (room manager icon buttons). Larger sizes (`lg`, `icon-lg`) are already ≥36px and are rarely the only interactive element — leave them unchanged.

**Changes**:
- `default`: `h-8` → `h-10 sm:h-8` (40px on mobile, 32px on sm+)
- `sm`: `h-7` → `h-9 sm:h-7` (36px on mobile, 28px on sm+)
- `icon`: `size-8` → `size-10 sm:size-8` (40px on mobile, 32px on sm+)
- `icon-sm`: `size-7` → `size-9 sm:size-7` (36px on mobile, 28px on sm+)

**After** (size variants only, other keys unchanged):
```tsx
default: "h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 sm:h-8",
sm: "h-9 gap-1 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5 sm:h-7",
icon: "size-10 sm:size-8",
"icon-sm": "size-9 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-3 sm:size-7",
```

**Risk**: Raising `default` to `h-10` on mobile will increase the height of the "Add" button in `room-manager.tsx:190-193` and the "Save"/"Cancel" buttons in `room-threshold-form.tsx:128-132`. These are in `flex gap-2` rows that already have `flex-1` inputs — the row heights will increase, which is the desired behavior. Verify the desktop layout at 1280px is unaffected (sm:h-8 reverts to 32px).

**Verification**: At 375px, primary buttons (Add, Save, Zaloguj się) are visibly taller and easy to tap. At 640px+, button sizes are identical to before.

#### 2.2 `src/app/_components/setup/room-threshold-form.tsx` — responsive input widths

**Current** (`room-threshold-form.tsx:82-125`):
```tsx
<div className="flex flex-wrap items-end gap-4">
  <label ... htmlFor="threshold-min">Min °C <Input className="w-24" .../></label>
  <label ... htmlFor="threshold-max">Max °C <Input className="w-24" .../></label>
  <label ... htmlFor="threshold-gap">Anomaly gap °C <Input className="w-24" .../></label>
</div>
```

**Intent**: On mobile, each label+input pair takes a full row. On sm+ the current flex-wrap row layout applies.

**Changes**:
- Container: `flex flex-wrap items-end gap-4` → `flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4`
- All three `<Input className="w-24">` → `<Input className="w-full sm:w-24">`
- Skeleton placeholders in the loading state: `<Skeleton className="h-9 w-24 rounded-md">` → `<Skeleton className="h-9 w-full rounded-md sm:w-24">`

**After** (container and one representative label):
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
  <label className="flex flex-col gap-1 text-sm text-white" htmlFor="threshold-min">
    Min °C
    <Input className="w-full sm:w-24" id="threshold-min" ... />
  </label>
  ...
</div>
```

**Verification**: At 375px, three inputs stack vertically with full width. At 640px+, three inputs are side-by-side at 96px width as before.

#### 2.3 `src/app/_components/setup/room-manager.tsx` — action row gap on mobile

**Current** (`room-manager.tsx:87`):
```tsx
<div className="flex items-center gap-3">
```

After Phase 2.1, icon buttons grow to `size-10` (40px) on mobile. With 3 icon buttons + badge + room name, total width at 375px (343px inner):
- Badge: ~50px
- 2× icon `size-10` = 80px
- 1× sm delete button `h-9` ≈ 36px
- `gap-3` × 4 = 48px
- Total fixed: 50 + 80 + 36 + 48 = 214px → room name gets ~129px (fine)

At `gap-1.5` × 4 = 24px:
- Total fixed: 50 + 80 + 36 + 24 = 190px → room name gets ~153px (better)

Use `gap-1.5 sm:gap-3` to give comfortable spacing on mobile without wrapping.

**Change** (`room-manager.tsx:87`):
```tsx
<div className="flex items-center gap-1.5 sm:gap-3">
```

**Verification**: At 375px, the room name + badge + 3 buttons fit on one row. At 640px+, gap is 12px as before.

### Completion Criteria — Phase 2

- [x] `npm run ci` passes
- [ ] At 375px: primary buttons (Add, Save, Zaloguj się) have comfortable tap height (~40px)
- [ ] At 375px: threshold form inputs stack vertically, each full-width
- [ ] At 375px: room manager action row doesn't overflow
- [ ] At 640px+: all button sizes and threshold form layout identical to before Phase 2

---

## Verification Checklist (Full Slice)

Run after Phase 2 completes:

- [ ] `npm run ci` passes (TypeScript + Biome)
- [ ] Dashboard at 375px: no horizontal scroll
- [ ] Dashboard at 375px: filter bar in 4-row stack layout
- [ ] Dashboard at 375px: header single row (title + nav link)
- [ ] Setup at 375px: no horizontal scroll when threshold form is open
- [ ] Setup at 375px: room manager action row fits comfortably
- [ ] Login at 375px: card has side margins
- [ ] Desktop at 1280px: all layouts identical to pre-change baseline

## Roadmap Update

On completion, update `context/foundation/roadmap.md`: move S-08 from "proposed" (or "in progress") to "done".
