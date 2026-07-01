# Event Log Viewer — Navigation Link Implementation Plan

## Overview

Add a `<RailLink>` entry for `/events` to the navigation rail so the already-built
event log viewer page is reachable from the UI.

## Current State Analysis

The `/events` page is production-ready:

- `src/app/events/page.tsx` — RSC page with `api.event.list.prefetch()`
- `src/app/events/_components/EventFeed.tsx` — full table: 4 event types, room/device
  filters, skeleton, empty state, Polish labels, colour-coded badges
- `src/server/api/routers/event.ts` — `event.list` query: last 24 h, JOIN rooms+devices,
  `ORDER BY created_at DESC`, `LIMIT 200`
- `src/server/api/root.ts:15` — `event: eventRouter` registered

`src/app/_components/command-center-shell.tsx` has a vertical rail with 4 entries
(Dashboard / Map / Setup / Automation Flow) at lines 142–165. `/events` has no entry.

## Desired End State

The navigation rail contains a fifth entry between Setup and Automation Flow:

- `ScrollText` icon, `aria-label="Event Log"`, `href="/events"`.
- The entry highlights with cyan glow when `pathname === "/events"`.
- Navigating to `/events` shows the EventFeed table.

### Key Discoveries

- `RailLink` is a local function component (`command-center-shell.tsx:35–80`) accepting
  `{ href, active, label, icon }` — no changes to the component itself needed.
- `lucide-react` is already imported at line 3; adding `ScrollText` is a one-token change
  to the existing named import.
- `usePathname()` from `next/navigation` is already called at line 92 — active detection
  works for free: `pathname === "/events"`.
- Existing rail entries span lines 142–165; the new entry inserts between lines 155–159
  (after the `/setup` block) and 160–165 (the `/automation-flow` block).

## What We're NOT Doing

- No changes to `EventFeed.tsx`, `event.ts` router, or any page component.
- No new route, no schema migration, no tRPC procedure.
- No pagination, filtering, or date-range UI changes to the existing EventFeed.
- No changes to the `RailLink` component props or styling.

## Implementation Approach

One file edit: add `ScrollText` to the lucide-react import and insert one `<RailLink>`
JSX block in `CommandCenterShellInner` between `/setup` and `/automation-flow`.

---

## Phase 1: Add /events entry to navigation rail

### Overview

Edit `command-center-shell.tsx` to import `ScrollText` and render the Events rail link.

### Changes Required

#### 1. Add `ScrollText` to lucide-react import

**File**: `src/app/_components/command-center-shell.tsx`

**Intent**: The `ScrollText` icon does not appear in the existing named import. Add it so
it is available for the new `<RailLink>`.

**Contract**: Extend the existing `import { LayoutGrid, LogOut, Map as MapIcon, Moon,
Settings, User, Workflow } from "lucide-react"` to include `ScrollText`.

#### 2. Insert `/events` RailLink after `/setup`

**File**: `src/app/_components/command-center-shell.tsx`

**Intent**: Render the Events nav entry in the 3rd rail slot (after Setup, before
Automation Flow) so admins can reach `/events` from any page.

**Contract**: Add a `<RailLink>` block immediately after the closing `/>` of the `/setup`
entry and before the opening `<RailLink` of the `/automation-flow` entry:

```tsx
<RailLink
  active={pathname === "/events"}
  href="/events"
  icon={<ScrollText size={20} />}
  label="Event Log"
/>
```

### Success Criteria

#### Automated Verification

- Type checking passes: `pnpm typecheck`
- Linting passes: `pnpm lint`
- Build succeeds: `pnpm build`

#### Manual Verification

- Navigation rail shows the ScrollText icon between Setup and Automation Flow.
- Clicking the icon navigates to `/events` and renders the EventFeed table.
- Active state (cyan glow + left bar) appears when on `/events`.
- Other rail links remain functional and their active state is unaffected.

**Implementation Note**: After automated checks pass, confirm manual testing before
proceeding to the commit step.

---

## Testing Strategy

### Automated

- TypeScript (`pnpm typecheck`) catches any import or prop-type errors.
- Biome (`pnpm lint`) enforces import order — `ScrollText` must slot alphabetically
  within the lucide-react named import.

### Manual Testing Steps

1. Start dev server (`pnpm dev`), navigate to any page.
2. Verify the `ScrollText` icon appears between the Settings cog and the Workflow icon.
3. Click the icon — confirm URL changes to `/events` and the EventFeed table renders.
4. Navigate away and back — confirm active highlight appears and disappears correctly.
5. Confirm remaining rail links (Dashboard, Map, Setup, Automation Flow) still work.

## References

- Frame brief: `context/changes/event-log-viewer/frame.md`
- Nav rail source: `src/app/_components/command-center-shell.tsx:142–165`
- Events page: `src/app/events/page.tsx`
- EventFeed component: `src/app/events/_components/EventFeed.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.
> Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add /events entry to navigation rail

#### Automated

- [x] 1.1 Type checking passes (pnpm typecheck) — 17eb622
- [x] 1.2 Linting passes (pnpm lint) — 17eb622
- [x] 1.3 Build succeeds (pnpm build) — 17eb622

#### Manual

- [x] 1.4 ScrollText icon appears between Setup and Automation Flow in nav rail — 17eb622
- [x] 1.5 Clicking icon navigates to /events and renders EventFeed — 17eb622
- [x] 1.6 Active state (cyan glow + left bar) works on /events — 17eb622
- [x] 1.7 Other rail links unaffected — 17eb622
