---
change_id: automation-rules
title: Time and temperature automation rules for valve setpoint control
status: implemented
created: 2026-06-12
updated: 2026-06-16
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

**Known pre-existing failure (unrelated to this change):** `src/server/api/routers/room.test.ts > room.create > returns the created room` fails on `main` independent of automation-rules work — confirmed via `git stash` against commit `932a7c2`. `room.ts:49` calls `ctx.db.select(...)` to look up the site before insert, but the test's mock `db` only provides `insert`. Out of scope for this change (room.ts/room.test.ts are not touched by any phase here); left unfixed per user decision during Phase 2.
