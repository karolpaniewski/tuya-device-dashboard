# Plan Brief: Setup → Settings Reorganization

## What & Why

`/setup` is the one surface that never received the command-center redesign — it's a flat-tabs CRUD admin panel in the app's older `--s-*` theme, with zero preference or configuration content despite its position in the nav implying it's where an admin configures the app. This plan turns it into a command-center-styled settings page: a grid of six cards (Rooms, Devices, Automations, Sites, Display/Appearance, Default Thresholds), each opening a popup with that section's full content.

## Starting Point

- `/setup` renders `SetupShell` (tabs) inside the legacy `PageShell`, with a light/dark `ThemeToggle`.
- Four existing CRUD screens (`room-manager.tsx`, `device-table.tsx`, `automation-manager.tsx`, `site-manager.tsx`) work fully but are styled with `--s-*` tokens and live as full-page tabs.
- Room comfort thresholds default from a hardcoded constant (`DEFAULT_THRESHOLDS` in `scoring.ts`) with no UI to change it.
- No display/appearance preference (e.g. density) exists anywhere in the app.

## Desired End State

`/setup` shows a dark-only, command-center-styled grid of six cards. Each opens a popup with working content — the four CRUD screens unchanged in behavior, plus two new sections (Display/Appearance density toggle; Default Thresholds config) wired end-to-end. Changing the default thresholds updates the dashboard's gauge and per-room scoring fallback live.

## Key Decisions

| Decision | Choice | Source |
|---|---|---|
| Settings page theme | Dark-only (`--cc-*`), drop `ThemeToggle` | PRD Scope of Change; precedent: dashboard rail already links here with a disabled theme button |
| Devices popup width | Wider variant (`max-w-4xl`) vs. standard | User answer, round 1 — data-heavy table needs more room |
| Rooms threshold form nesting | Stays inline inside the Rooms popup (not its own dialog) | User answer, round 2 — matches existing inline pattern, avoids true popup-in-popup |
| Automations form overflow | Standard popup width, internal vertical scroll | User answer, round 2 |
| Sites reassignment confirmation | Keep the existing nested `Dialog` (room→site move), unchanged | User answer, round 3 — confirmed against actual code; site deletion itself has no reassignment flow, hard-blocks instead |
| Display/Appearance scope | Two-level density (comfortable/compact), dashboard-only, browser-local | User answer, round 3; PRD Scope of Change |
| Default Thresholds testing | Vitest router tests only, no new E2E | User answer, round 4 — consistent with existing coverage; no Playwright suite in this repo |
| Default-thresholds data model | New singleton-row table + router, mirroring `dashboardLayout`/`dashboardLayoutRouter` | Codebase research — exact existing precedent for this shape |

## Scope

**In scope:** settings grid + popup shell; restyling four existing managers to `--cc-*`; new default-thresholds DB table/router wired into both scoring (`device.ts`) and the dashboard gauge (`device-overview.tsx`); new Display/Appearance density toggle (browser-local).

**Out of scope:** any change to CRUD behavior/APIs for Rooms/Devices/Automations/Sites; site deletion/reassignment logic; per-user preferences (flat single-admin model unchanged); mobile-first redesign (375px support preserved, not rebuilt); E2E/Playwright tests.

## Architecture / Approach

Built bottom-up across 5 phases: data layer first (testable in isolation), then a navigation skeleton wired to the *existing* unstyled managers (proves popup mechanics before any visual work), then restyle in place, then the two net-new sections last (they depend on the router and shell from earlier phases). The one non-obvious technical risk: the shared `Dialog` primitive portals to `document.body` by default, which breaks `.command-center`'s CSS-custom-property scoping unless the class is reapplied directly on the popup's own DOM node — handled once in a shared `SettingsCard` component in Phase 2 so it doesn't need repeating per popup.

## Phases at a Glance

1. **Default-thresholds data layer** — new table + `settingsRouter`, rewire `device.ts` scoring fallback and the dashboard gauge to read from it.
2. **Settings shell & navigation skeleton** — `CommandCenterShell` swap, wide-dialog variant, shared `SettingsCard`, six-card grid wired to existing (unstyled) managers.
3. **Restyle existing CRUD inside popups** — `--s-*` → `--cc-*` across all four managers; Automations gets internal scroll; Rooms' nested dialog gets the same portal-scoping fix.
4. **Display/Appearance settings section** — density toggle, `localStorage`-persisted, dashboard-only effect.
5. **Default Thresholds settings section** — form wired to Phase 1's router, invalidates the dashboard gauge query on save.

## Open Risks & Assumptions

- Assumes the `@base-ui/react/dialog` portal-scoping fix (reapplying `.command-center` on the popup node) is sufficient and no deeper Tailwind/PostCSS scoping issue exists — to be confirmed once Phase 2 ships.
- Assumes Devices' wide popup variant is enough; if the table still feels cramped, the PRD's documented fallback is to defer Devices' popup conversion to a later pass (timeline guardrail, not part of this plan unless triggered).
- No backfill needed for the new `defaultThresholds` table — empty-table fallback to the existing hardcoded constant is treated as correct startup behavior, same as `dashboardLayout`.

## Success Criteria Summary

- `npm run ci` passes after every phase.
- All six settings cards open working popups; the four existing CRUD flows are unchanged in behavior.
- Changing default thresholds or density updates the dashboard live, without a manual refresh (gauge) or reload (density persists across reload).
- 375px viewport remains usable across the settings grid and all six popups.
