---
project: Tuya Device Dashboard — S-22 Setup → Settings Reorganization
updated: 2026-06-20

context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 9
  quality_check_status: accepted
---

> Seed idea: S-22 from the roadmap — "Setup page reorganized to read as an
> actual Settings experience (app-wide config / browser-local display
> preferences), instead of relocating its existing Rooms/Devices/Automations/
> Sites CRUD screens."

## Current System

Setup page (`src/app/_components/setup/`) — pure CRUD admin: Rooms /
Devices / Automations / Sites tabs (`setup-shell.tsx`), plus one buried
per-room threshold form (`room-manager.tsx` → `room-threshold-form.tsx`).
Styled with the older `--s-*` token theme (light/dark via `next-themes`);
never received the new "command-center" glassmorphic dark-only redesign
(`--cc-*` tokens, Space Grotesk/JetBrains Mono) the dashboard route
(`dashboard-command-center-redesign`) just shipped.

Stack: Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Tailwind CSS,
shadcn/ui — unchanged, no new stack needed (confirmed via
`context/changes/dashboard-ux-redesign/frame.md`).

Users: facility manager / office admin. Flat, single-admin identity model
— NextAuth JWT-only, no per-user preference table, no `/signup`.

**Must preserve:**
- All existing CRUD functionality (Rooms/Devices/Automations/Sites) stays
  fully accessible — nothing is hidden or removed, only reorganized/restyled.
- The flat single-admin identity model is not revisited in this change —
  any new "settings" content must be app-wide config or browser-local
  (`next-themes`/`localStorage`) preferences, never per-user.
- Mobile/375px viewport support (S-08) must not regress.

## Vision & Problem Statement

Setup is the one remaining surface still on the pre-command-center visual
theme — the dashboard route just shipped a glassmorphic dark-only redesign
that Setup never received, so the two now look like two different products.
Separately, Setup reads as a CRUD admin panel, not a Settings page: zero
preference/config content exists anywhere in it today.

**Change:** Reorganize Setup so it (a) visually matches the dashboard's new
command-center aesthetic, and (b) contains actual settings content — a
Display/Appearance preferences section and a default room-thresholds
section — rather than only relabeled CRUD tabs. Both the visual restyle and
the content/IA fix are bundled into this one change (explicit choice — this
project has previously split visual-polish slices from content/IA slices,
e.g. S-17/S-21 vs. this S-22, but the user chose to bundle here since the
visual gap is now concrete and current rather than a vague aspiration).

**Insight:** The command-center redesign (just-shipped) only touched the
dashboard route (`/`). Setup (`/setup`) is the one remaining page on the
old `--s-*` theme — this is now a precise, current gap, not a subjective
"make it nicer" request.

## User & Persona

**Role:** Facility manager / office administrator (2–5 person org) — same
persona as the rest of the app, no new persona introduced for Setup.
**Device:** Desktop browser (primary), mobile (secondary — S-08 already
shipped, must not regress).
**Pain moment:** Opens Setup expecting a settings/config experience after
just seeing the new dashboard look; instead sees a CRUD panel rendered in
the old theme with no preference content.

## Access Control

No changes planned — current model preserved: NextAuth email + password
login, single flat role, full access for the one effective user type. No
new roles or role-boundary changes introduced by this work.

## Success Criteria

### Primary
Admin opens `/setup` and sees a grid of setting cards, styled with the
dashboard's command-center aesthetic: Rooms, Devices, Automations, Sites,
Display/Appearance, Default Thresholds. Clicking any card opens a
popup/modal containing that section's full content — the four existing CRUD
screens fully functional inside their modals (not just visually present),
plus the two new settings sections (Display/Appearance preferences;
default room-threshold config) working end-to-end.

### Secondary
None — scope kept tight to the core flow.

### Guardrails
- No existing CRUD functionality (Rooms/Devices/Automations/Sites) is lost
  or degraded when moved from full-page tabs into modals.
- Mobile/375px viewport support (S-08) does not regress.

**Timeline:** ~3 weeks of after-hours work. Explicit fallback if it runs
over: ship the visual restyle + settings-grid navigation + the two new
settings sections first; defer converting the heaviest existing screen
(Devices — table-heavy) into a modal to a later pass.

## Functional Requirements

### Setup landing

- FR-001: Admin sees a settings grid of cards (Rooms, Devices, Automations,
  Sites, Display/Appearance, Default Thresholds) on `/setup`, styled in the
  dashboard's command-center aesthetic. Priority: must-have. Change: modified.
  > Socrates: Counter-argument considered: "tabs were simpler navigation —
  > grid+modal adds a click vs. a tab click." Resolution: accepted as a
  > deliberate tradeoff — the user explicitly wants the grid-of-cards
  > pattern over tabs; the extra click is the cost of visual/IA
  > consistency with the dashboard. FR stands.
- FR-002: Admin can click any settings card to open a popup/modal containing
  that section's full content. Priority: must-have. Change: new.
  > Socrates: Counter-argument considered: "Devices is too data-heavy
  > (sortable/filterable table + assignment UI) for a popup." Resolution:
  > no counter-argument raised; flagged as a planning-time risk to revisit
  > if Devices doesn't fit a standard modal width. FR stands.

### Existing CRUD (moved into modals)

- FR-003: Rooms management is fully functional inside its modal. Priority:
  must-have. Change: modified.
  > Socrates: Counter-argument considered: "Rooms already opens a nested
  > threshold sub-dialog — modal-in-modal risk." Resolution: no
  > counter-argument raised; carried forward as a design note for FR-009.
  > FR stands.
- FR-004: Devices management is fully functional inside its modal. Priority:
  must-have. Change: modified.
  > Socrates: Counter-argument considered: "already flagged as the
  > highest-risk/defer-candidate screen." Resolution: no counter-argument
  > raised; consistent with the timeline fallback already recorded (defer
  > Devices to a later pass if the 3-week budget runs out). FR stands.
- FR-005: Automations management is fully functional inside its modal.
  Priority: must-have. Change: modified.
  > Socrates: Counter-argument considered: "rule creation form can be long
  > — modal scroll risk." Resolution: no counter-argument raised; flagged
  > as a layout consideration for planning. FR stands.
- FR-006: Sites management is fully functional inside its modal. Priority:
  must-have. Change: modified.
  > Socrates: Counter-argument considered: "site-reassignment's
  > confirmation-gated flow may not nest cleanly inside this modal."
  > Resolution: no counter-argument raised; flagged as a risk for
  > planning. FR stands.
- FR-009: Per-room threshold override (existing form, currently buried in
  Rooms) continues to work, reachable from within the Rooms modal. Priority:
  must-have. Change: preserved.
  > Socrates: Counter-argument considered: "creates the same modal-in-modal
  > pattern flagged in FR-003." Resolution: no counter-argument raised;
  > explicit design attention needed at planning time, not assumed to just
  > work. FR stands.

### New settings sections

- FR-007: Admin can configure Display/Appearance preferences (theme,
  density) via a new settings section, persisted browser-locally. Priority:
  must-have. Change: new.
  > Socrates: Counter-argument considered: "browser-local means prefs
  > don't follow the admin across devices/browsers." Resolution: accepted
  > tradeoff — consistent with the flat single-admin identity constraint;
  > no per-user account model exists to attach server-side prefs to. FR
  > stands.
- FR-008: Admin can configure default room thresholds (the global fallback
  used before a room sets its own override) via a new settings section.
  Priority: must-have. Change: new.
  > Socrates: Counter-argument considered: "low value — defaults rarely
  > change once set; might be over-engineering vs. editing the constant in
  > code." Resolution: no counter-argument raised; FR stands.

## Business Logic

No new domain logic, and the existing room-scoring rule's logic is
unchanged — `scoreRoom()` still decides OK / Too Cold / Too Hot the same
way it does today. The one exception: the rule's default threshold
*inputs* move from a hardcoded constant (`DEFAULT_THRESHOLDS` in
`scoring.ts`) to DB-configurable values, editable via the new Default
Thresholds settings section (FR-008). The decision boundary itself
(min/max comparison) is untouched — only where its fallback numbers come
from changes.

## Non-Goals

- **No per-user/per-account settings** — stays inside the flat
  single-admin identity model; no auth/role changes to support per-user
  preferences.
- **No changes to polling/scoring/valve-control logic** — beyond the
  default-thresholds config-source change (FR-008), no other backend
  domain logic is touched.
- **No full mobile redesign of Setup** — existing S-08 375px support must
  not regress, but this isn't a mobile-first redesign effort; desktop is
  primary, same boundary as prior visual passes (S-17, S-21).

## Constraints & Preserved Behavior

- Default thresholds move from a hardcoded constant to a DB-backed value —
  standard additive Drizzle migration (new table/column with a sensible
  default), no backfill complexity expected.
- All existing CRUD functionality (Rooms/Devices/Automations/Sites) and
  their tRPC endpoints remain unchanged in behavior — only the
  presentation layer (modal vs. full-page tab) changes.
- Mobile/375px viewport support (S-08) must not regress.
- The flat single-admin auth model is not revisited.
- No other constraints identified beyond what's already recorded.
- Product type and target scale are unchanged (still web-app, still
  small-scale). No new deployment/CI/monitoring constraints — the
  existing CI pipeline (S-06: lint/typecheck/Vitest + build) covers this
  change as-is.

## Non-Functional Requirements

- Text contrast meets WCAG AA (4.5:1) in both themes on the new Setup
  styling.
- No flash of unstyled content (FOUC) when Setup's command-center styling
  loads.
- Settings modals open without perceptible lag (target: <300ms perceived)
  — converting full-page CRUD screens into modals must not introduce
  heavier mount cost the admin notices.

## User Stories

### US-01: Reconfiguring app settings
**Given** I am logged in as the admin,
**When** I open `/setup`,
**Then** I see a grid of setting cards styled like the dashboard; clicking
any card (Rooms, Devices, Automations, Sites, Display/Appearance, Default
Thresholds) opens a modal where I can view/edit that section fully, then
close it and return to the grid.

## Quality cross-check

All six soft-gate elements present, no gaps recorded:

- Access Control: present
- Business Logic: present (infrastructure/visual-only, one declared exception — default-threshold source)
- Project artifacts: present
- Timeline-cost ack: present (3 weeks, within the ≤ 3-week bar — no explicit acknowledgment block needed)
- Non-Goals: present (3 entries)
- Preserved behavior: present (`## Constraints & Preserved Behavior`)

`quality_check_status: accepted`.
