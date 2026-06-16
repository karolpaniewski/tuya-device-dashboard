---
change_id: room-site-reassignment
title: Reassign a room (and its devices/gateway) to a different site
status: implementing
created: 2026-06-16
updated: 2026-06-16
archived_at: null
---

## Notes

Original request (verbatim, PL): "Potrzebuje nowej funkcjonalnosci, mozliwosci
przepisania room do innego site" — i.e. the user wants the ability to move/reassign
a room to a different site.

Routed through `/10x-frame` rather than `/10x-shape`: this project's `/10x-shape`
operates at the product level (`context/foundation/shape-notes.md` → `prd.md`/
`prd-v2.md`, both already locked), and its own skip-rule defers to `/10x-frame`
when a PRD already exists and the request is a scoped design question within an
existing system rather than a new module.
