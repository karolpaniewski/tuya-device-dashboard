---
change_id: auth-scaffold
title: Auth — email/password login with session gate on all routes
status: archived
created: 2026-06-08
updated: 2026-06-22
archived_at: 2026-06-22T08:00:00Z
---

## Notes

F-01 from roadmap. Email + password login, authenticated session issued, all routes behind the auth gate, seeded admin user for first login. Baseline has no auth despite tech-stack.md declaring NextAuth (has_auth: true) — implement before any slice to avoid retrofitting unprotected endpoints. Unlocks S-01 through S-05. Can run in parallel with F-02 (device-schema). PRD refs: FR-001, Access Control section.
