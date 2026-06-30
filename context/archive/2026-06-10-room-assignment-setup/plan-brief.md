# Room Assignment Setup — Plan Brief

> Full plan: `context/changes/room-assignment-setup/plan.md`

## What & Why

Build the `/setup` admin screen so the facility manager can create named rooms and assign each discovered device to a room. Without this slice, the main dashboard shows all devices as "Unassigned" — the grouped-by-room view (FR-005) is meaningless until rooms exist and devices are mapped to them.

## Starting Point

The DB schema is already complete: `rooms`, `deviceRoomAssignments`, and `roomThresholds` tables exist with the right structure and constraints. There are 5 seeded stub devices, 0 rooms, and 0 assignments. The `device.overview` tRPC procedure already returns `roomId`/`roomName` per device and an `unassigned[]` array — no new device query is needed for the setup page.

## Desired End State

An authenticated user navigates to `/setup` via a "Setup →" link in the dashboard header. They create rooms by name, drag-free assign each device via a room dropdown (saves immediately), rename rooms inline, and delete empty rooms. The main dashboard reflects assignments in real time. A `room.test.ts` file covers auth-gate + happy paths + key error paths.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Setup screen location | Separate `/setup` route | Clean separation between view (`/`) and configure (`/setup`); middleware already gates it | Plan |
| Room management scope | Full CRUD (create, rename, delete) + assign | User needs lifecycle control; delete-with-guard is a small incremental cost | Plan |
| Assignment UX | Dropdown per device card, saves immediately | Familiar pattern; works for any number of rooms; no drag-and-drop complexity | Plan |
| Room delete behavior | Block if devices assigned (BAD_REQUEST) | Prevents accidental orphaning; user stays in control | Plan |
| Unassign | "— Unassigned" option in dropdown → deletes assignment row | Symmetric to assign; matches existing `unassigned[]` concept in `device.overview` | Plan |
| Navigation to /setup | Fixed "Setup →" link top-right of dashboard header | Always visible; zero extra clicks; minimal header change | Plan |
| Auth on /setup | Relies on existing NextAuth middleware | `src/middleware.ts` already protects all non-login routes; no extra code needed | Plan |
| Test depth | §6.2 cookbook: auth-gate + happy paths + error paths | Project standard; catches real regressions (blocked delete, not-found, unauthorized) | Plan |

## Scope

**In scope:**
- `room` tRPC router: `list`, `create`, `rename`, `delete` (blocked if assigned), `setDeviceRoom` (assign/unassign)
- `/setup` page + `SetupShell`, `RoomManager`, `DeviceAssignmentGrid` components
- "Setup →" navigation link in main dashboard header
- Integration tests: `room.test.ts`

**Out of scope:**
- Room threshold configuration (S-05)
- Device rename
- Room ordering / sort index
- UI snapshot or component tests (excluded per `test-plan.md §7`)

## Architecture / Approach

New `room` tRPC router added alongside the existing `device` router in `appRouter`. The setup page (server component) prefetches `room.list` + `device.overview` for SSR. The client shell subscribes to both queries; assignment mutations call `room.setDeviceRoom` then invalidate both. Reassignment is an upsert (`onConflictDoUpdate` on `deviceRoomAssignments.deviceId` — the UNIQUE constraint prevents duplicate rows).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Room tRPC Router | 5 protected procedures + root.ts wire | `db.select` mock shape for `room.list` join — must match Drizzle's chained API |
| 2. Setup UI | `/setup` page, room CRUD panel, device dropdown grid, header nav | Dropdown invalidation race: ensure both `room.list` and `device.overview` are invalidated after `setDeviceRoom` |
| 3. Integration Tests | `room.test.ts` — 14 test cases following §6.2 | Mock shape for multi-call `db.select` (list uses join; delete uses count check) |

**Prerequisites:** F-01, F-02, S-01 all complete and in `context/changes/`.  
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Room list uses a JOIN to compute `deviceCount` — the Drizzle chained mock shape for this may differ from the single-table shape used in `device.test.ts`. Research will clarify in Phase 3 if needed.
- The setup page reuses `device.overview` for device data (includes scoring overhead). Acceptable for MVP scale (≤50 devices).

## Success Criteria (Summary)

- A facility manager can create rooms, assign all 5 stub devices, and see them grouped by room on the main dashboard within one session.
- Deleting a room with assigned devices is blocked with a clear error.
- `npm test` is green with no regressions in existing tests.
