# Frame Brief: Dashboard UX/UI Redesign

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Dissatisfaction with the dashboard's UX/UI across five named dimensions:
visual style (dated/generic), layout/information density, navigation/flow,
inconsistent components, and the Setup page not feeling like a proper
Settings page.

## Initial Framing (preserved)

- **User's stated cause or approach**: these five things should be addressed
  together as one "dashboard UX/UI redesign" slice (S-21), kept separate
  from the room-heat-toggle quick action (S-20).
- **User's proposed direction**: run S-21 as a single redesign effort.
- **Pre-dispatch narrowing**:
  - Priority: "Visual style & consistency" — the one thing that would matter
    most if only one fix shipped this round.
  - Timing: "Comparison to something else" — the dissatisfaction surfaced by
    contrast with another app/dashboard, not gradual internal decay.
  - Setup vs Settings: "What's in there" — explicitly a content/organization
    gap, not a visual-treatment gap.

## Dimension Map

1. **Visual design-system maturity** — style, density, and part of
   "inconsistent components." ← initial framing's center of gravity, and
   where the user's own priority answer lands.
2. **Setup-is-not-Settings (content/IA gap)** — independent of visual
   polish; where the user's own "what's in there" answer lands.
3. **Cross-area navigation paradigm mismatch** — Setup's flat tabs vs.
   Dashboard's sidebar+grid are two different IA patterns in one app;
   plausible source of the "navigation/flow" complaint, but overlaps both
   dimensions above rather than standing alone.
4. **Component primitive consistency** — narrower than first suspected (see
   Hypothesis Investigation); a few one-off raw-styled elements bypass
   shared primitives, but most apparent "drift" is intentional duplication.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Visual design-system maturity drives "dated/generic" + density + part of "inconsistent" | S-17's plan scoped its "Grafana/Datadog — data-dense" aesthetic (`prd-v2.md:65`) to ~7 files (`plan.md` Changes Required) and explicitly excluded mobile layout + automation history; never touched `setup/`; `device-modal.tsx:211` uses a raw `bg-blue-600` button bypassing the shared `Button` component | STRONG |
| Setup is categorically not Settings — a content/IA gap independent of visual polish | `setup/*.tsx` contains zero preference/account/display-config UI — only CRUD (rooms/devices/automations/sites) plus one buried threshold form (`room-manager.tsx:174-191` → `room-threshold-form.tsx`); confirmed independently by a blind Explore-agent comparison | STRONG |
| "Navigation/flow" traces to a single one of the above dimensions | Setup uses flat tabs (`setup-shell.tsx:44-76`); Dashboard uses sidebar+grid+filter bar (`device-overview.tsx`, `room-sidebar.tsx:29`) — two real, different IA patterns, but no evidence the Dashboard's *own* internal nav is broken | WEAK — genuinely overlaps both dimensions, not cleanly attributable to either |
| "Inconsistent components" = uneven design-token migration | Initial grep suggested `setup/` under-uses `--s-*` tokens vs. Dashboard; an independent re-check found the type-badge color literals (`bg-blue-600 text-blue-100` etc.) are *intentionally* duplicated identically in both areas, not drift — the real gap is narrower (a handful of one-off raw-styled buttons) | WEAK — original theory overstated; thinner signal than raw counts implied |

## Narrowing Signals

- User picked "visual style & consistency" as the single highest-priority
  fix — not "navigation" or "Setup/Settings" — even though all five were
  named together initially.
- User picked "comparison to something else" for timing — an external
  benchmark, not slow internal decay — which fits a design-system gap
  (S-17's aesthetic target was only ever applied to a subset of the app)
  better than a "things drifted apart over time" story.
- User picked "what's in there" for the Setup complaint — explicitly ruling
  out "it just needs to look nicer" and confirming it's a content/IA
  mismatch, structurally separate from dimension 1.

## Cross-System Convention

Every prior UI-facing slice in this project — `ux-polish` (S-14),
`dashboard-redesign` (S-15), `visual-ux-redesign` (S-17) — scoped to exactly
one concern (polish, structural redesign, theming/iconography respectively)
and none of them ever touched `src/app/_components/setup/`. The convention
in this codebase has consistently been: visual/UX passes are scoped tightly
and Setup is treated as a separate surface, by omission if nothing else.

`dashboard-personalization`'s own frame (S-19, `context/changes/dashboard-personalization/frame.md`)
already hit a related wall: this app has a flat, single-admin identity model
(no per-user preference table, NextAuth JWT-only, no `/signup`). Any work
that gives Setup actual "Settings" content needs to stay inside that
constraint — app-wide config and browser-local (`next-themes`/`localStorage`)
preferences are fair game; per-user preference storage is not, without
revisiting that model first.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is two structurally distinct problems
> sharing one label, not one redesign.**

"Dashboard UX/UI redesign" as scoped bundles (1) a visual design-system gap —
S-17's "Grafana/Datadog, data-dense" aesthetic was only ever applied to a
subset of the dashboard surface, and a few primitives still bypass the
shared component/token system — with (2) a content/IA gap where Setup is a
CRUD admin panel being asked to read as a Settings page, which needs
different *content*, not better paint. These have no shared root cause, no
shared fix, and per this project's own history have always shipped as
separately scoped slices. Treating them as one plan risks exactly the
"empty-CRUD"-style scope sprawl this project's other skills already guard
against — a redesign plan trying to do two unrelated jobs at once.

## Confidence

**HIGH** — strong evidence on both leading dimensions, direct user
confirmation on both narrowing questions, independent agent corroboration,
and a consistent historical pattern in this project's own roadmap.

## What Changes for /10x-plan

Plan these as two separate, narrower efforts rather than one "dashboard
redesign": (1) a visual design-system pass that finishes what S-17 started —
palette/density/primitive consistency across the surfaces it didn't reach —
and (2) a Setup→Settings content/IA reorganization, scoped around what
actually belongs in a settings area for this app (app-wide config,
browser-local display preferences) rather than relocating existing CRUD
screens. Carry the flat-identity constraint into (2) as a hard guardrail.
The "navigation/flow" complaint doesn't need its own third slice — fold its
resolution into whichever of (1)/(2) ends up addressing the specific nav
pattern in question once scoped.

## References

- Source files: `context/changes/visual-ux-redesign/plan.md` (Changes
  Required file list), `context/foundation/prd-v2.md:65` (Grafana/Datadog
  aesthetic statement), `src/app/_components/setup/setup-shell.tsx:44-76`,
  `src/app/_components/setup/room-manager.tsx:174-191`,
  `src/app/_components/device-modal.tsx:211`
- Related precedent: `context/changes/dashboard-personalization/frame.md`
  (flat-identity constraint)
- Independent check: blind Explore-agent comparison of `setup/` vs.
  dashboard component areas (navigation, content, styling)
