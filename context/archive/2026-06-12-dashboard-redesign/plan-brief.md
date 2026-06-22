# S-15 Dashboard Redesign — Plan Brief

**5 phases, all frontend, zero backend changes.**

## What changes

| Phase | Files | Deliverable |
|-------|-------|-------------|
| 1. KPI Row | `device-overview.tsx` | 4-card grid replacing badge hero (Devices, Avg Temp, Rooms OK, Alerts) |
| 2. Room Sidebar | new `room-sidebar.tsx` + `device-overview.tsx` + `filter-bar.tsx` | Left sidebar on desktop; hidden sm:block; FilterBar room dropdown hidden on sm+ |
| 3. Sparklines | `room-group.tsx` + inline `RoomSparkline` | 24h inline chart per room card, first isOnline sensor, staleTime 60s |
| 4. Setup Tabs | `npx shadcn add tabs` + `setup-shell.tsx` | Tabs: Rooms / Devices / Automations(disabled) / Sites |
| 5. Device Table | new `device-table.tsx`, delete `device-assignment-grid.tsx` | Sortable by name/type/room/status; search; 20/page pagination |

## Key decisions

- **Avg temp**: only `isOnline && !isStale` sensors; shows `—` when all offline
- **Sparkline sensor**: first `isOnline` sensor in room; fallback to first in list
- **Tabs**: shadcn Radix-based (consistent with Button/Badge/Select)
- **Automations tab**: visible + disabled placeholder; S-11 fills it later
- **Mobile sidebar**: not implemented — FilterBar room dropdown is the mobile fallback

## Delivery order

1 → 2 → 3 are dashboard phases (can be committed independently).
4 → 5 are setup phases (5 depends on 4 being merged first for the Tabs import).

## Complexity: MEDIUM — pure frontend, no migrations, Recharts already installed
