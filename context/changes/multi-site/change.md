---
id: multi-site
title: Multi-Site Support
status: implemented
created: 2026-06-12
updated: 2026-06-22
---

Shipped via one consolidated commit (`2a79987`, combined with
`mobile-responsive`/S-08) rather than the granular per-phase commits
`plan.md`'s Progress section expects — its checkboxes were never
filled in even though the work landed. Confirmed live in the codebase
(`sites` table in `src/server/db/schema.ts` with `siteId` on
rooms/gateways/devices). Roadmap S-13 already marks this `done`.

# Multi-Site Support

Add support for multiple named office locations ("sites") in a single dashboard instance. Each site has its own rooms, gateways, and devices. A site picker in the dashboard header lets authenticated users switch between sites or view all sites' data merged.

## Scope

- `sites` table + `siteId` column on rooms, gateways, devices (migration 0001)
- Site CRUD (create, rename, delete) via tRPC + setup UI
- tRPC scoping: `device.overview` and `room.list/create` accept `siteId` input
- Site switcher dropdown in `PageShell` header; active site persisted in cookie
- "All Sites" merged view with site-level section headers above room groups
- Seed + test updates

## Out of scope

- User-to-site membership management (all users see all sites in this slice)
- Per-site role separation
- Cross-site analytics or comparative views
