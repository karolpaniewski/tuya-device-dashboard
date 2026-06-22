---
change_id: setup-to-settings
title: Setup → Settings reorganization
status: implemented
created: 2026-06-18
updated: 2026-06-22
roadmap_id: S-22
archived_at: null
---

## Notes

Split out of `dashboard-ux-redesign` via `/10x-frame` (see
`context/changes/dashboard-ux-redesign/frame.md`). Confirmed to be a
content/IA gap, not a visual one: Setup (`src/app/_components/setup/`) is
pure CRUD admin (Rooms/Devices/Automations/Sites tabs + one buried per-room
threshold form) with zero preference/account/display-config content. Fixing
the look won't address the complaint — Setup needs different content to
read as a Settings page, not better paint.

Open before this can be planned:
- What actually belongs in "Settings" for this app.
- Whether the existing CRUD tabs move, get relabeled, or stay alongside a
  new dedicated settings section.

Hard constraint: this app has a flat, single-admin identity model (no
per-user preference table — confirmed by S-19's `/10x-frame`). Any settings
content implying per-account preferences needs that model revisited first,
not assumed.

Needs `/10x-shape` or its own `/10x-frame` pass before `/10x-plan`.
