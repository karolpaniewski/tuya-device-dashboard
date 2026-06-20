---
project: "Tuya Device Dashboard — S-22 Setup → Settings Reorganization"
version: 3
status: draft
created: 2026-06-20
context_type: brownfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

**System purpose:** A facility-management web app for monitoring and controlling networked climate devices across rooms and sites.

**Key architecture:** A server-rendered web app with an API layer over a SQL database, plus a background worker that polls device state.

**Tech stack:** Next.js 15, tRPC v11, Drizzle ORM + libsql (SQLite), Tailwind CSS, shadcn/ui, NextAuth (JWT-only), next-themes.

**Current user base:** Facility manager / office administrator, 2–5 person org. Flat, single-admin identity model — no per-user accounts, no sign-up flow.

**Core functionality today:** A dashboard route (`/`) gives a real-time climate overview per room, just restyled with a glassmorphic, dark-only "command-center" visual redesign. A Setup route (`/setup`) provides CRUD admin screens — Rooms, Devices, Automations, Sites — as flat tabs, plus a buried per-room threshold override form nested inside Rooms. Setup is still styled in the app's older theme (light/dark via `next-themes`) and never received the command-center redesign. It contains zero preference or configuration content — it is pure CRUD.

## Problem Statement & Motivation

Setup (`/setup`) is the one remaining surface still on the app's older visual theme — the dashboard route just shipped a glassmorphic, dark-only command-center redesign that Setup never received, so the two routes now read as two different products. Separately, Setup reads as a CRUD admin panel rather than a Settings page: no preference or configuration content exists anywhere in it today, despite its position in the navigation implying it's where an admin goes to configure the app.

This change is needed now because the command-center redesign just shipped, making the visual gap concrete and current — not a vague "make it nicer" aspiration. The current workaround is that there is no settings/configuration experience anywhere in the app: defaults such as room comfort thresholds exist only as a value an operator can't see or change without a code deployment. An admin opening Setup today, right after seeing the new dashboard look, finds a relabeled CRUD panel in a visually inconsistent theme with no preference content.

## User & Persona

**Role:** Facility manager / office administrator (2–5 person org) — the same persona as the rest of the app; no new persona is introduced by this change.

**Device:** Desktop browser (primary), mobile (secondary — existing mobile/375px viewport support must not regress).

**What changes for this user:** Opening `/setup` will now look and feel consistent with the dashboard, and will surface real settings content for the first time, instead of presenting only relabeled CRUD tabs.

**Pain moment (unchanged by this analysis, addressed by this change):** Opens Setup expecting a settings/config experience after just seeing the new dashboard look; instead sees a CRUD panel rendered in the old theme with no preference content.

## Success Criteria

### Primary
- Admin opens `/setup` and sees a grid of setting cards, styled with the dashboard's command-center aesthetic: Rooms, Devices, Automations, Sites, Display/Appearance, Default Thresholds. Clicking any card opens a popup containing that section's full content — the four existing CRUD screens fully functional inside their popups (not just visually present), plus the two new settings sections (Display/Appearance preferences; default room-threshold config) working end-to-end.

### Secondary
None — scope kept tight to the core flow.

### Guardrails
- No existing CRUD functionality (Rooms/Devices/Automations/Sites) is lost or degraded when moved from full-page tabs into popups.
- Mobile/375px viewport support does not regress.

**Timeline:** ~3 weeks of after-hours work. Explicit fallback if it runs over: ship the visual restyle + settings-grid navigation + the two new settings sections first; defer converting the heaviest existing screen (Devices — table-heavy) into a popup to a later pass.

## User Stories

### US-01: Reconfiguring app settings

- **Given** I am logged in as the admin
- **When** I open `/setup`
- **Then** I see a grid of setting cards styled like the dashboard; clicking any card (Rooms, Devices, Automations, Sites, Display/Appearance, Default Thresholds) opens a popup where I can view/edit that section fully, then close it and return to the grid

**What was different before:** `/setup` showed flat tabs (Rooms, Devices, Automations, Sites) as full-page screens, with no settings content and the app's older visual theme — there was no grid, no popups, and no Display/Appearance or Default Thresholds section.

## Scope of Change

### Setup landing

- [modified] Admin sees a settings grid of cards (Rooms, Devices, Automations, Sites, Display/Appearance, Default Thresholds) on `/setup`, styled in the dashboard's command-center aesthetic. Priority: must-have.
  > Socratic: Counter-argument considered: "tabs were simpler navigation — grid+popup adds a click vs. a tab click." Resolution: accepted as a deliberate tradeoff — the grid-of-cards pattern is explicitly preferred over tabs; the extra click is the cost of visual/IA consistency with the dashboard.
- [new] Admin can click any settings card to open a popup containing that section's full content. Priority: must-have.
  > Socratic: Counter-argument considered: "Devices is too data-heavy (sortable/filterable table + assignment UI) for a popup." Resolution: no counter-argument raised; flagged as a planning-time risk to revisit if Devices doesn't fit a standard popup width.

### Existing CRUD (moved into popups)

- [modified] Rooms management is fully functional inside its popup. Priority: must-have.
  > Socratic: Counter-argument considered: "Rooms already opens a nested threshold sub-dialog — popup-in-popup risk." Resolution: no counter-argument raised; carried forward as a design note for the preserved per-room threshold override item below.
- [modified] Devices management is fully functional inside its popup. Priority: must-have.
  > Socratic: Counter-argument considered: "already flagged as the highest-risk/defer-candidate screen." Resolution: no counter-argument raised; consistent with the timeline fallback already recorded (defer Devices to a later pass if the 3-week budget runs out).
- [modified] Automations management is fully functional inside its popup. Priority: must-have.
  > Socratic: Counter-argument considered: "rule creation form can be long — popup scroll risk." Resolution: no counter-argument raised; flagged as a layout consideration for planning.
- [modified] Sites management is fully functional inside its popup. Priority: must-have.
  > Socratic: Counter-argument considered: "site-reassignment's confirmation-gated flow may not nest cleanly inside this popup." Resolution: no counter-argument raised; flagged as a risk for planning.
- [preserved] Per-room threshold override (existing form, currently buried in Rooms) continues to work, reachable from within the Rooms popup. Priority: must-have.
  > Socratic: Counter-argument considered: "creates the same popup-in-popup pattern flagged above." Resolution: no counter-argument raised; explicit design attention needed at planning time, not assumed to just work.

### New settings sections

- [new] Admin can configure Display/Appearance preferences (theme, density) via a new settings section, persisted browser-locally. Priority: must-have.
  > Socratic: Counter-argument considered: "browser-local means prefs don't follow the admin across devices/browsers." Resolution: accepted tradeoff — consistent with the flat single-admin identity constraint; no per-user account model exists to attach server-side prefs to.
- [new] Admin can configure default room thresholds (the global fallback used before a room sets its own override) via a new settings section. Priority: must-have.
  > Socratic: Counter-argument considered: "low value — defaults rarely change once set; might be over-engineering vs. editing a hardcoded value directly." Resolution: no counter-argument raised.

## Constraints & Compatibility

- **Backward compatibility:** All existing CRUD functionality (Rooms/Devices/Automations/Sites) and their underlying APIs remain unchanged in behavior — only the presentation layer (popup vs. full-page tab) changes.
- **Data migration:** Default thresholds move from an application-level constant to a database-backed configurable value — a standard additive schema change (new field with a sensible default); no data backfill or rollback complexity expected.
- **Existing integrations:** None affected — no third-party or device-facing integration touches the Setup UI layer.
- **Preserved behavior:**
  - All existing CRUD functionality stays fully accessible — nothing is hidden or removed, only reorganized/restyled.
  - The flat single-admin identity model is not revisited — any new settings content is app-wide config or browser-local preferences, never per-user.
  - Mobile/375px viewport support must not regress.
  - Product type and target scale are unchanged (still web-app, still small-scale). No new deployment/CI/monitoring constraints — the existing CI pipeline (lint, type-check, automated tests, and build) covers this change as-is.

## Business Logic Changes

No new domain logic; the existing room-scoring rule that decides whether a room reads OK, Too Cold, or Too Hot is unchanged. The one exception: the rule's default threshold inputs move from a hardcoded application constant to a database-configurable value, editable via the new Default Thresholds settings section. The decision boundary itself (the min/max comparison) is untouched — only where its fallback numbers come from changes.

## Access Control Changes

No access control changes — current model preserved: email + password login, a single flat administrative role with full access for the one effective user type. No new roles or role-boundary changes are introduced by this work.

## Non-Goals

- **No per-user/per-account settings** — stays inside the flat single-admin identity model; no auth/role changes to support per-user preferences.
- **No changes to polling/scoring/valve-control logic** — beyond the default-thresholds config-source change, no other backend domain logic is touched.
- **No full mobile redesign of Setup** — existing mobile/375px support must not regress, but this isn't a mobile-first redesign effort; desktop is primary, same boundary as prior visual passes.

## Open Questions

1. **Will the Devices section (sortable/filterable table + assignment UI) fit cleanly inside a standard-width popup, or does it need a wider/full-screen treatment?** — Owner: implementation planning. Block: no — affects layout choice, not whether the feature ships.
2. **Rooms already opens a nested per-room threshold sub-dialog — how does a dialog-within-a-popup pattern get designed cleanly, rather than assumed to "just work"?** — Owner: implementation planning. Block: no.
3. **Can the Automations rule-creation form's length be accommodated inside a popup without awkward internal scrolling?** — Owner: implementation planning. Block: no.
4. **Does the Sites confirmation-gated reassignment flow nest cleanly inside its popup, or does it need to break out (e.g. a secondary confirmation step)?** — Owner: implementation planning. Block: no.
