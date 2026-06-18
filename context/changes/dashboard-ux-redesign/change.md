---
change_id: dashboard-ux-redesign
title: Visual design-system pass
status: preparing
created: 2026-06-18
updated: 2026-06-18
roadmap_id: S-21
archived_at: null
---

## Notes

Originally scoped as one slice covering five complaints (visual style,
layout/density, navigation/flow, inconsistent components, Setup≠Settings).
Routed through `/10x-frame` (see `frame.md`) — split into two slices:
this one (the visual design-system pass, finishing what S-17 started) and
S-22 `setup-to-settings` (content/IA gap, parked separately).

Scope locked via discussion on 2026-06-18:
- Desktop-only — mobile stays out, same boundary S-17 drew.
- "Density" means tightening spacing/sizing within the *existing* layout,
  not restructuring it (that would overlap S-15's territory).
- Confirmed concrete targets: `temperature-history-modal.tsx` (hardcoded
  dark-only, no `--s-*` tokens, breaks in light mode) and `device-modal.tsx:211`
  (raw `bg-blue-600` button bypassing the shared `Button` component).
- Automation-history widget stays excluded (S-12 is parked).

Ready for `/10x-plan`.
