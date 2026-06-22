---
change_id: ux-polish
title: Ux polish
status: archived
created: 2026-06-10
updated: 2026-06-22
archived_at: 2026-06-22T08:00:00Z
---

## Notes

Shipped via 4 consolidated commits (p1–p4: shadcn/ui foundation, core UX
wins, component unification, glassmorphism redesign) rather than the
granular per-item commits `plan.md`'s Progress section expects — its
checkboxes were never filled in even though the work landed. Confirmed
live in the codebase (Toaster/sonner wired in `layout.tsx`, shadcn
primitives used across `device-card.tsx`, `device-modal.tsx`,
`automation-manager.tsx`, etc.) and superseded by later visual passes
(`visual-ux-redesign`, `dashboard-ux-redesign`). Roadmap S-14 already
marks this `done`.
