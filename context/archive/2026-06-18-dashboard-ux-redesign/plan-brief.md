# Visual Design-System Pass — Plan Brief

> Full plan: `context/changes/dashboard-ux-redesign/plan.md`
> Frame brief: `context/changes/dashboard-ux-redesign/frame.md`

## What & Why

S-17 (`visual-ux-redesign`) migrated most of the dashboard to a `--s-*` token-based theming system, but a few surfaces never got reached. This pass finishes that migration: a shared `Dialog` component, the toast system, and an error-message variant are still hardcoded dark-only; a dead modal duplicates functionality that already works correctly elsewhere; badge colors are copy-pasted across files; and the dashboard's macro spacing is looser than the rest of the app's "data-dense, Grafana/Datadog" aesthetic target.

## Starting Point

`src/components/ui/dialog.tsx` (consumed by `device-modal.tsx` and `setup/room-manager.tsx`) hardcodes `bg-gray-900/95`/`text-white`. `temperature-history-modal.tsx` is fully hardcoded dark-only and — discovered during planning — is dead code: its trigger from `device-card.tsx` was removed at some point, and `device-modal.tsx`'s own "History" tab already covers the same chart correctly. `sonner.tsx`'s Toaster is forced `theme="dark"` and rendered outside `ThemeProvider`. Badge color lookup tables (`TYPE_BADGE`, `BADGE_STYLE`, `BADGE_DOT`) are duplicated verbatim across `device-card.tsx`, `room-group.tsx`, `room-sidebar.tsx` (and a separate copy in `setup/device-table.tsx`, out of scope).

## Desired End State

Every dialog, toast, and error surface renders correctly in both light and dark mode. The dead modal is gone. Badge colors are defined once per concern and imported, not copy-pasted, in dashboard files. Dashboard spacing is tightened to match the app's intended density.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Problem scope | Visual design-system pass only, separate from Setup→Settings (S-22) | Frame found these are two structurally distinct problems with no shared fix | Frame |
| Platform scope | Desktop-only | Same boundary S-17 drew; mobile not addressed | Frame |
| `temperature-history-modal.tsx` | Delete | Confirmed dead/unreachable; `device-modal.tsx`'s History tab already does this, correctly themed | Plan |
| Toast theming | Wire to `next-themes`, move `<Toaster>` inside `<ThemeProvider>` | Toasts should match the app's actual theme, not be forced dark | Plan |
| Card component | Don't extract one | Existing hand-rolled `--s-bg-card` pattern is already consistent; no visible bug to fix | Plan |
| Badge/status colors | Consolidate into shared constant modules, keep colors theme-invariant | Removes duplication without changing rendered output | Plan |
| Setup's duplicate badge table | Leave untouched | Setup is explicitly out of scope for this pass | Plan |
| Density target | Specific gap/padding/min-h reductions (not a lighter touch) | Concrete, bounded, targets the loosest spots found in research | Plan |
| Chart re-theming | N/A — orphaned chart deleted with its modal | Resolved by the delete decision above | Plan |

## Scope

**In scope:**
- `ui/dialog.tsx`, `ui/sonner.tsx` + `layout.tsx` wiring, `ui/error-message.tsx`
- Deleting `temperature-history-modal.tsx`
- `device-modal.tsx`'s raw button/slider accent
- Offline/dim-state token cleanup in `device-card.tsx`, `room-group.tsx`, `device-overview.tsx`
- Badge/status color consolidation for `device-card.tsx`, `room-group.tsx`, `room-sidebar.tsx`
- Density tightening in `device-overview.tsx`, `room-group.tsx`, `filter-bar.tsx`

**Out of scope:**
- `setup/**` (S-22 territory)
- Mobile breakpoints
- Layout restructuring (sidebar/grid/filter-bar arrangement)
- A new shared `Card` component
- Restoring `TemperatureHistoryModal` as a feature
- Automation-history widget (S-12, parked)

## Architecture / Approach

No new architecture — this is a token/class-substitution and dedup pass on existing components, plus one deletion. Phases are ordered by dependency leverage: shared primitives first (Phase 1), then their direct consumer `device-modal.tsx` (Phase 2), then independent token cleanup (Phase 3) and badge consolidation (Phase 4), then purely cosmetic density changes (Phase 5).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared primitives | Dialog/Toaster/ErrorMessage theme-correct | Touches a component used by 2+ consumers — verify both |
| 2. Dead code + device-modal | Dead modal removed, raw button/slider fixed | Low — confirmed zero references before deleting |
| 3. Offline/dim tokens | Existing tokens used instead of raw grays | Low — visual-only, no logic change |
| 4. Badge consolidation | One source of truth per badge concern | Must keep colors pixel-identical — verify, don't eyeball |
| 5. Density tightening | Tighter dashboard spacing | Risk of feeling cramped — needs a real look-over, not just a diff read |

**Prerequisites:** None — all target files exist today, no external dependencies.
**Estimated effort:** ~1-2 sessions across 5 phases; each phase is small and independently committable.

## Open Risks & Assumptions

- Density changes (Phase 5) are inherently subjective — the manual verification step exists specifically to catch "too cramped" before it ships, since no automated check can validate a feel.
- Assumes no other file imports `TemperatureHistoryModal` outside `src/` (e.g. no test fixtures) — confirmed via repo-wide grep during planning, but worth a final check before deleting.

## Success Criteria (Summary)

- Toggling light/dark mode shows no broken/illegible surfaces anywhere a dialog, toast, or error message appears.
- `temperature-history-modal.tsx` is gone with zero dangling references.
- Badge colors are visually unchanged but defined once per concern.
- The dashboard reads visibly tighter without losing legibility or overlapping content.
