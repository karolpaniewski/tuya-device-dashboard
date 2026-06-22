# Plan: Device DnD + Management Modal

## Phases

### Phase 1 — DB: sortOrder column [ ]
- `src/server/db/schema.ts`: add `sortOrder: d.integer("sort_order").notNull().default(0)` to devices table
- `npm run db:generate && npm run db:push`

### Phase 2 — Humidity data path [ ]
- `src/server/lib/tuya/types.ts`: add `humidityPct: number | null` to `TuyaDeviceReading`
- `src/server/lib/device-state-store.ts`: add `humidityPct: number | null` to `DeviceState`
- `src/server/lib/tuya/real-client.ts`: extract `dps["2"]` for sensors as humidityPct
- `src/server/workers/tuya-poller.ts`: store `humidityPct` in deviceStateStore

### Phase 3 — tRPC endpoints [ ]
- `device.rename`: `{id, name}` → update `devices.name`
- `device.reorder`: `[{id, sortOrder}]` → batch update in transaction
- `device.overview`: order devices by `sortOrder`, include `humidityPct`

### Phase 4 — Device modal [ ]
- `src/app/_components/device-modal.tsx` (new)
  - Dialog with 3 tabs: **Overview** | **History** | **Automations**
  - Overview: inline rename (input + save), room select, setpoint slider (valves only), current readings (temp, humidity for sensors)
  - History: full Recharts LineChart via `api.device.temperatureHistory` (24h range)
  - Automations: placeholder "coming soon"
- Wire click handler on device cards in `room-group.tsx`

### Phase 5 — @dnd-kit drag & drop [ ]
- Install: `@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- `src/app/_components/device-overview.tsx`: wrap in `DndContext`, manage `activeId` state
- `src/app/_components/room-group.tsx`: add `SortableContext`, each card is `useSortable`
- `DragOverlay` for floating card preview
- `onDragEnd`:
  - Same room → `device.reorder` for affected devices
  - Cross-room → `room.setDeviceRoom` + `device.reorder`
  - Optimistic UI via local state (server revalidate on settle)

## Key decisions
- `sortOrder` on `devices` table (global, not per-room) — simplest approach since `deviceId` is unique in assignments
- Humidity: current reading only (no history column in DB for now)
- DnD library: `@dnd-kit` (tree-shaking friendly, no legacy deps)
- Modal: shadcn Dialog + Tabs (already installed)
