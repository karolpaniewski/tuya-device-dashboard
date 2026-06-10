# UX/UI Polish — Plan Brief

> Full plan: `context/changes/ux-polish/plan.md`
> Research: `context/changes/ux-polish/research.md`

## What & Why

Install a design-system foundation (shadcn/ui + sonner + lucide-react + tailwindcss-animate) and use it to fix every UX gap in the current codebase: silent mutations, plain-text loading, a zero-device empty-state bug, and a light-mode login island. Finish with a full visual redesign — glassmorphism cards, gradient background, hero section, dark login, and micro-animations — to take the dashboard from "functional" to "polished."

## Starting Point

Eight hand-rolled components with no design system, no toast library, no icon library (emoji as icons), zero CSS variables, and five mutations that are completely silent on success. A critical bug: the main dashboard renders nothing when zero devices are discovered with no active filters.

## Desired End State

Every mutation in the setup flow gives a success toast. Every loading state shows skeleton UI. Every empty state has a large Lucide icon, explanatory text, and a CTA. Error messages are styled and user-friendly (no raw tRPC strings). All buttons, inputs, and selects come from shadcn primitives. The visual layer has glassmorphism cards on a dark gradient background, a hero section on the dashboard, and a dark login page matching the app theme.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Design system | shadcn/ui (full stack) | Eliminates button/input inconsistencies by convention and adds CSS variables | Plan |
| Toast library | sonner (via shadcn add sonner) | Included in shadcn ecosystem, simplest integration | Plan |
| Icon library | lucide-react | shadcn peer dependency; already the T3 ecosystem default | Plan |
| Animation | tailwindcss-animate only | No framer-motion needed for the targeted effects | Plan |
| Toast scope | 4 setup mutations only | `setDeviceRoom` has its own per-item feedback — avoid notification noise | Plan |
| Error boundary | app-level `error.tsx` only | Sufficient for 2-page app; per-route would duplicate code | Plan |
| Login theme | Unified to dark | Eliminates the light-mode island; user confirmed | Plan |
| Glassmorphism depth | `backdrop-blur-[2px]` on cards, `backdrop-blur-sm` on panels | Performance: 50 device cards with full blur risks frame drops | Plan |
| Select null handling | Sentinel value `"unassigned"` | shadcn Select doesn't support null values natively | Plan |
| Empty state approach | Large Lucide icon (48px) + text + CTA | Consistent with installed icon library; no external illustration deps | Plan |
| Skeleton coverage | Device list + room grid + threshold form | Maximum visual impact; per-component skeletons for other areas is diminishing return | Plan |

## Scope

**In scope:**
- shadcn/ui init + 6 components (Button, Input, Select, Skeleton, Badge, Sonner)
- tailwindcss-animate plugin
- Lucide icon swap (emoji → icons)
- Success toasts (4 mutations)
- Skeleton loading (device list, setup shell, threshold form)
- Unified `ErrorMessage` component (3 variants)
- App-level `error.tsx`
- DeviceOverview zero-device empty state fix
- `PageShell` component extraction
- shadcn component refactor across all 8 components
- Glassmorphism card treatment + page gradient
- Hero section on dashboard
- Dark login page
- Enhanced empty states (3 locations)
- Stale badge dark fix
- Card enter animations

**Out of scope:**
- New API routes or tRPC procedures
- Database schema changes
- E2E or component tests
- framer-motion
- Dark-mode toggle
- shadcn Dialog/Sheet/Dropdown
- Automated deploy changes

## Architecture / Approach

Four sequential phases, each `npm run ci`-gated. Phase 1 installs the foundation that all later phases depend on (shadcn init writes CSS variables; lucide-react must exist before icons are used). Phase 2 delivers the priority UX wins independently of the visual redesign — if only Phase 1+2 ship, the app is meaningfully improved. Phase 3 unifies the component layer via shadcn primitives, resolving the button/input inconsistencies. Phase 4 applies the visual redesign on top of the clean foundation.

The glassmorphism effect requires a `fixed -z-10` background layer (gradient + color blobs in `layout.tsx`) so cards have something to blur against. Individual device cards use `backdrop-blur-[2px]` (minimal) to avoid GPU overload with 50 simultaneous blurred layers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Foundation | shadcn/ui init, 6 component files, Toaster in layout, tailwindcss-animate | shadcn init rewrites `globals.css` — verify font variable survives |
| 2. Core UX Wins | Toast on 4 mutations, icons, skeleton device list + setup shell, error boundary, unified ErrorMessage, empty state fix | `ErrorMessage` must not leak raw tRPC message in DeviceOverview |
| 3. Component Unification | shadcn Button/Input/Select/Badge everywhere, PageShell extraction | shadcn Select null sentinel — `"unassigned"` → null mapping must be correct |
| 4. Visual Redesign | Glassmorphism, gradient bg, hero section, dark login, empty state icons, stale badge fix, animations | `backdrop-blur` on 50 cards — use `[2px]` not `sm`; login page must be fully dark |

**Prerequisites:** Phase 1 must complete before any other phase. No external dependencies beyond npm packages.  
**Estimated effort:** ~3-4 focused sessions across 4 phases

## Open Risks & Assumptions

- shadcn `init` with Tailwind v4 generates v4-compatible CSS variables — if the CLI version doesn't detect v4 correctly, manually copy the CSS variable block from shadcn docs
- `backdrop-blur` on glassmorphism cards is a user-chosen direction that may need performance tuning on the target hardware (facility management machines)
- Hero section stats require the `device.overview` query data to be non-null — guard all stat chips with fallback `0`

## Success Criteria (Summary)

- Every mutation in setup shows a success toast; errors show styled messages (no raw tRPC strings)
- Dashboard and setup pages show skeleton loading states instead of plain text
- Visual: glassmorphism cards on gradient dark background, dark login, hero section, Lucide icons throughout
