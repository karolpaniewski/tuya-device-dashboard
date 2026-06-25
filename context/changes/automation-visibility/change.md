---
change_id: automation-visibility
title: Surface automation-mode targeting on device and room cards
status: implemented
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

Originated from a "premium dashboard" shaping session (`/10x-shape`) that
narrowed down to a concrete, contained gap: there is no way to see — from
a device or a room — which automation mode currently targets it, without
navigating away to Settings. PRD at `context/foundation/prd-v9.md`
(version 9, brownfield template). Stack-assessed `ready`, health-checked
`healthy` — no blockers before implementation.

Reuses existing data (`device.overview`, `mode.list`, both already
queried by `device-overview.tsx`) — no schema change, no new tRPC
procedure. See `plan.md` for the full implementation plan and
`plan-brief.md` for a two-page summary.
