# Room Quick-Overview Panel — Plan Brief

## One-line summary

Swap centered `RoomModal` on the dashboard for a 420px slide-in Sheet that stays open alongside the dashboard, adding live temperature, 24h chart, and heat toggle to the panel.

## Files changed

| File | Status | Notes |
|------|--------|-------|
| `src/components/ui/sheet.tsx` | new | Created by `npx shadcn@latest add sheet` |
| `src/app/_components/heat-toggle.tsx` | new | Extracted from room-group.tsx:60–125 |
| `src/app/_components/room-group.tsx` | modified | Remove local HeatToggle; add import from heat-toggle.tsx |
| `src/app/_components/room-quick-overview-panel.tsx` | new | The new Sheet-based panel component |
| `src/app/_components/device-overview.tsx` | modified | Replace RoomModal render (:1159–1175); swap import |

No server changes. No schema changes. No new tRPC endpoints.

## Key decisions made

- **HeatToggle**: Extracted to shared file — single source of truth, preserves Popover confirm UX.
- **Temp header**: Primary sensor `temperatureC` + `room.badge` in panel header; `—` if sensor offline/stale.
- **Chart section**: Hidden entirely when `primarySensorId === null` (no sensor, no placeholder).
- **Panel width**: 420px fixed, `side="right"`.
- **Sheet close**: `defaultOpen + onOpenChange` pattern (matches Dialog pattern in existing modals).
- **Tests**: No new test files — no pure functions extracted; manual verification per plan checklist.

## Phase order

1. **Setup** — `npx shadcn@latest add sheet` + extract HeatToggle
2. **Build panel** — `room-quick-overview-panel.tsx` (Sheet + 5 content sections)
3. **Wire** — replace RoomModal in device-overview.tsx
4. **Verify** — manual checklist + `npm run ci`

## Preserved behavior

- `RoomModal` in `tuya-automation-flow.tsx` — untouched.
- `toggleHeatMutation` onSuccess/onError — no changes to mutation definition.
- `device.overview` cache — panel reads it, doesn't duplicate the query.
- Room-header click handlers — already fire `setSelectedRoomId`; no change needed.
