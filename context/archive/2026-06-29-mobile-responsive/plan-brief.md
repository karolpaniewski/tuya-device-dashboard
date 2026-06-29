# Mobile-Responsive Layout — Plan Brief

> Full plan: `context/changes/mobile-responsive/plan.md`

## What & Why

Add responsive Tailwind breakpoints to the dashboard and setup pages so the app is usable on 375px mobile viewports. Primary focus is the dashboard (critical path for monitoring devices); setup page gets overflow fixes only. Raise touch targets on critical interactive elements (buttons, icon buttons, filter toggles) to ≥40px on mobile.

## Starting Point

The device card grids already have responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` breakpoints. Everything else is desktop-fixed: `PageShell` has `px-6` and `text-2xl` regardless of viewport; `FilterBar` is a single-row flex container with fixed-width `w-36` select and `min-w-32` input; button size variants are `h-7/h-8/size-8` (28–32px) with no mobile override; threshold form inputs are `w-24` fixed-width; login card has no side margins.

## Desired End State

At 375px: no horizontal scroll on any page, the filter bar stacks vertically (full-width search → full-width room select → type buttons row → status buttons row), the dashboard header shows title + nav link on one row with smaller text, form inputs in threshold form are full-width and stack vertically. All primary buttons, icon buttons, and filter toggle buttons are ≥40px tall on mobile for comfortable tapping.

## Key Decisions Made

| Decision | Choice | Why |
|---|---|---|
| Filter bar mobile UX | Vertical stack (`flex-col`) on xs | Buttons stay the same component; reflows via responsive flex-direction |
| Setup page priority | Fix overflows only | Secondary use case — functional over polished |
| Touch targets | Critical interactives only (button.tsx variants) | Single-file change covers all button instances; SelectTrigger stays at h-8 (acceptable) |
| Header approach | Single row, shrink title to `text-xl` on mobile | Avoids any wrapping or hamburger logic |
| Viewport meta | No change needed | Next.js App Router adds it automatically |

## Scope

**In scope:** `page-shell.tsx`, `filter-bar.tsx`, `device-overview.tsx`, `button.tsx` size variants, `room-threshold-form.tsx`, `room-manager.tsx` action row, `login/page.tsx`, `error.tsx`

**Out of scope:** new API changes, design system changes, navigation patterns, framer-motion, dark-mode toggle

## Architecture / Approach

Two sequential phases. Phase 1 tackles the dashboard and navigation — the highest-impact changes for the primary use case. Phase 2 handles touch targets (button.tsx) and setup page overflow fixes. Each phase ends with `npm run ci` passing.

The responsive strategy is pure Tailwind responsive utilities (`sm:` prefix) at the usage site — no new CSS, no viewport hooks, no JS resize observers. The only structural change is the filter bar's flex-direction reversal on mobile.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Dashboard + nav | PageShell responsive padding/title, FilterBar vertical stack, device-overview chip wrap, login margin, error padding | Filter bar `flex-col` on xs must not break the `flex-wrap sm:flex-row` reflow — test at 375px AND 640px |
| 2. Touch targets + setup | button.tsx size variants raised for mobile, threshold form full-width inputs, room manager gap tightened | Raising all button heights may shift desktop layout where buttons are in tight rows — verify filter bar and room manager at 1280px after |

## Success Criteria

- No horizontal scroll at 375px on dashboard, setup, login, or error page
- Filter bar reflows vertically on mobile: search full-width → room select full-width → type buttons → status buttons
- Dashboard title + "Setup →" link stay on one row at 375px
- `npm run ci` passes after each phase
