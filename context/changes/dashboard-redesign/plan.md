# S-15 Dashboard & Setup Redesign — Implementation Plan

## Overview

Full frontend redesign in two tracks: (1) dashboard gets a KPI row, left room sidebar, and inline sparkline charts; (2) setup page gets tabbed navigation and a sortable device table. Zero backend changes — all data is already served by `device.overview` and `device.temperatureHistory`.

## Decisions Locked

| Decision | Resolution |
|----------|-----------|
| Automations tab | Visible but `disabled` in S-15; placeholder for S-11 |
| Sidebar on mobile | `hidden sm:block` — mobile uses existing FilterBar room dropdown |
| Tabs component | `npx shadcn@latest add tabs` (Radix-based, consistent with existing shadcn pattern) |
| Avg temp KPI | Only `isOnline && !isStale && temperatureC !== null` sensors; shows `—` when all offline |
| Sparkline primary sensor | First `isOnline` sensor in room, fallback to first sensor in list; no sparkline if room has no sensors |
| Device table defaults | Sort by name ASC, 20 items/page with prev/next pagination |

## Current State Analysis

- **`device-overview.tsx`** — client component, queries `device.overview` with 30s refetch. Already computes `totalDevices`, `onlineCount`, `roomCount`. Hero section (lines 127–154) shows these as `<Badge>` elements in a flex row — to be replaced by KPI card grid.
- **`room-group.tsx`** — renders a room section with a device grid. No sparkline slot today.
- **`filter-bar.tsx`** — full-width bar with search, room dropdown, type + status buttons. Room dropdown stays on mobile; hidden (`sm:hidden`) on desktop when sidebar is active.
- **`setup-shell.tsx`** — three sections in a `gap-10` vertical stack: SiteManager → RoomManager → DeviceAssignmentGrid.
- **`device-assignment-grid.tsx`** — card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). Full rebuild as sortable table.
- **Tabs**: not installed. `npx shadcn@latest add tabs` needed.
- **Recharts**: already installed. Modal uses `LineChart + ResponsiveContainer + Line`. Sparkline reuses same pattern minus axes/legend.

## Desired End State

```
Dashboard (page.tsx → DeviceOverview)
├── KpiRow (4 cards: Devices, Avg Temp, Rooms OK, Room Alerts)
└── div.flex.gap-6
    ├── RoomSidebar [hidden sm:block] (room list with badge dots; "All Rooms" resets filter)
    └── div.flex-1
        ├── FilterBar (room dropdown hidden on sm+)
        └── Room grid (filtered by activeRoomId)
            └── RoomGroup → room heading + sparkline (RoomSparkline) + device grid

Setup (setup-shell.tsx)
└── Tabs [Rooms | Devices | Automations(disabled) | Sites]
    ├── TabsContent: RoomManager
    ├── TabsContent: DeviceTable (new — sortable, paginated)
    ├── TabsContent: placeholder (S-11)
    └── TabsContent: SiteManager
```

## What We're NOT Doing

- No backend / tRPC changes
- No changes to `PageShell` (`src/components/page-shell.tsx`)
- No changes to the temperature-history modal (`temperature-history-modal.tsx`)
- No mobile sidebar (bottom-sheet or chip-row) — desktop-only sidebar
- No real-time sparkline updates (staleTime: 60_000)
- Automation tab body is a placeholder string — no S-11 UI built here

---

## Phase 1: KPI Row

### Overview

Replace the badge-based hero section in `device-overview.tsx` with a 4-column card grid. All values are derived client-side from the existing `device.overview` query — no new endpoints.

### Changes Required

#### 1. New KPI computations — `src/app/_components/device-overview.tsx`

**After the existing `roomCount` memo (line ~83), add:**

```typescript
const offlineCount = totalDevices - onlineCount;
const roomsOk = useMemo(
  () => data?.rooms.filter((r) => r.badge === "OK").length ?? 0,
  [data],
);
const roomsTooHot = useMemo(
  () => data?.rooms.filter((r) => r.badge === "Too Hot").length ?? 0,
  [data],
);
const roomsTooCold = useMemo(
  () => data?.rooms.filter((r) => r.badge === "Too Cold").length ?? 0,
  [data],
);
const avgTempC = useMemo(() => {
  if (!data) return null;
  const readings = data.rooms
    .flatMap((r) => r.devices)
    .filter(
      (d) =>
        d.deviceType === "sensor" &&
        d.isOnline &&
        !d.isStale &&
        d.temperatureC !== null,
    )
    .map((d) => d.temperatureC as number);
  if (readings.length === 0) return null;
  return readings.reduce((a, b) => a + b, 0) / readings.length;
}, [data]);
```

#### 2. Replace hero section with KPI grid — `src/app/_components/device-overview.tsx:127-154`

Replace the entire hero `<div>` block with:

```tsx
{/* KPI Row */}
<div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
  {[
    {
      label: "Devices",
      value: totalDevices,
      sub: `${onlineCount} online · ${offlineCount} offline`,
      icon: <Wifi className="h-4 w-4" />,
    },
    {
      label: "Avg Temp",
      value: avgTempC !== null ? `${avgTempC.toFixed(1)}°C` : "—",
      sub: "online sensors",
      icon: <Thermometer className="h-4 w-4" />,
    },
    {
      label: "Rooms OK",
      value: roomsOk,
      sub: `of ${roomCount} rooms`,
      icon: <CheckCircle2 className="h-4 w-4 text-green-400" />,
    },
    {
      label: "Alerts",
      value: roomsTooHot + roomsTooCold,
      sub: `${roomsTooHot} hot · ${roomsTooCold} cold`,
      icon: <Flame className="h-4 w-4 text-orange-400" />,
    },
  ].map(({ label, value, sub, icon }) => (
    <div
      key={label}
      className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-[2px]"
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-white/50">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-xs text-white/40">{sub}</div>
    </div>
  ))}
</div>
```

**Add required icon imports** to the existing `lucide-react` import line:
`Wifi`, `Thermometer`, `CheckCircle2`, `Flame` (check which are not already imported).

### Success Criteria

#### Automated
- `npm run typecheck` passes with new computations
- `npm run check` passes (no Biome violations)

#### Manual
- 4 KPI cards visible above device grid on dashboard
- Avg Temp shows `—` when all sensors are offline/stale
- Cards use glassmorphism pattern (matching DeviceCard)
- 2-column on mobile, 4-column on sm+

---

## Phase 2: Room Sidebar

### Overview

Add a left sidebar that lists rooms with badge indicators. Clicking a room filters the device grid. Hidden on mobile — FilterBar room dropdown remains the mobile filter mechanism. Room dropdown in FilterBar hides on `sm+`.

### Changes Required

#### 1. New component — `src/app/_components/room-sidebar.tsx`

```typescript
interface RoomSidebarProps {
  rooms: Array<{
    roomId: string;
    roomName: string;
    badge: "OK" | "Too Cold" | "Too Hot" | null;
  }>;
  activeRoomId: string | null;
  onSelect: (roomId: string | null) => void;
}
```

**Visual spec:**
- `w-44 shrink-0 flex flex-col gap-1`
- "All Rooms" entry at top: activates when `activeRoomId === null`
- Each room row: `flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer`
  - Active: `bg-white/10 text-white`
  - Inactive: `text-white/60 hover:bg-white/5`
- Badge dot: `h-2 w-2 rounded-full shrink-0`
  - OK → `bg-green-400`
  - Too Cold → `bg-blue-400`
  - Too Hot → `bg-red-400`
  - null → `bg-white/20`

#### 2. Sidebar state + layout — `src/app/_components/device-overview.tsx`

**Add state** at the top of the component:
```typescript
const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
```

**Compute filtered rooms** (replace the existing rooms mapping used in render):
```typescript
const visibleRooms = activeRoomId
  ? (data?.rooms.filter((r) => r.roomId === activeRoomId) ?? [])
  : (data?.rooms ?? []);
```

**Wrap the device grid section** in a flex container. The current structure renders `<FilterBar>` + room groups directly. Change to:
```tsx
<div className="flex gap-6">
  {/* Sidebar — desktop only */}
  <aside className="hidden sm:block">
    <RoomSidebar
      rooms={data?.rooms.map((r) => ({
        roomId: r.roomId,
        roomName: r.roomName,
        badge: r.badge,
      })) ?? []}
      activeRoomId={activeRoomId}
      onSelect={setActiveRoomId}
    />
  </aside>
  {/* Main content */}
  <div className="min-w-0 flex-1">
    <FilterBar ... hideRoomFilter />  {/* see below */}
    {/* existing room groups, now using visibleRooms */}
  </div>
</div>
```

#### 3. Hide room dropdown on desktop — `src/app/_components/filter-bar.tsx`

Add `hideRoomFilter?: boolean` prop to `FilterBarProps`. Wrap the room `<Select>` element with:
```tsx
{!hideRoomFilter && (
  <Select ...> ... </Select>
)}
```

Pass `hideRoomFilter` from `device-overview.tsx` to `<FilterBar>`.

### Success Criteria

#### Automated
- `npm run typecheck` passes

#### Manual
- Sidebar visible at sm+ (hidden on mobile)
- Clicking a room name filters grid to that room only
- "All Rooms" resets filter
- Active room highlighted
- Badge dots match room health colors
- Room dropdown hidden in FilterBar on desktop, visible on mobile
- No FilterBar regression (search, type, status buttons still work)

---

## Phase 3: Room Sparklines

### Overview

Add an inline 24-hour temperature sparkline to each room card. One `temperatureHistory` query per room (using the primary sensor). Rendered as a stripped `LineChart` with no axes, no legend, no animation.

### Changes Required

#### 1. New inline component `RoomSparkline` — `src/app/_components/room-group.tsx`

Add above the export (file-internal, not exported):

```typescript
import { api } from "~/trpc/react";
import { ResponsiveContainer, LineChart, Line } from "recharts";

function RoomSparkline({ deviceId }: { deviceId: string }) {
  const { data } = api.device.temperatureHistory.useQuery(
    { deviceId, range: "24h" },
    { staleTime: 60_000 },
  );
  if (!data?.length) return null;
  const chartData = data.map((r) => ({
    ts: new Date(r.recordedAt).getTime(),
    temperatureC: r.temperatureC,
  }));
  return (
    <ResponsiveContainer width="100%" height={56}>
      <LineChart data={chartData} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
        <Line
          type="monotone"
          dataKey="temperatureC"
          stroke="#60a5fa"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

#### 2. Add `primarySensorId` prop to `RoomGroup` — `src/app/_components/room-group.tsx`

Add to `RoomGroupProps`:
```typescript
primarySensorId?: string | null;
```

Render sparkline below the room heading, before the device grid:
```tsx
{primarySensorId && (
  <div className="mb-3 rounded-lg border border-white/5 bg-white/[0.02] px-2">
    <RoomSparkline deviceId={primarySensorId} />
  </div>
)}
```

#### 3. Compute and pass `primarySensorId` — `src/app/_components/device-overview.tsx`

When mapping rooms to `<RoomGroup>`, compute the primary sensor:
```typescript
const primarySensorId =
  room.devices.find((d) => d.deviceType === "sensor" && d.isOnline)?.id ??
  room.devices.find((d) => d.deviceType === "sensor")?.id ??
  null;

<RoomGroup
  ...existing props...
  primarySensorId={primarySensorId}
/>
```

### Success Criteria

#### Automated
- `npm run typecheck` passes (new prop on RoomGroup)
- No Recharts import errors

#### Manual
- Sparkline visible on each room card that has a sensor
- Rooms with no sensors render no sparkline (no empty space / no error)
- Sparkline is minimal — no axes, no legend, no tooltip (hover still works from Recharts default)
- Multiple rooms load sparklines in parallel without visible jank
- Sparkline not re-fetched on every 30s polling cycle (staleTime: 60_000 holds)

---

## Phase 4: Setup Tabs

### Overview

Install the Tabs shadcn component, then restructure `setup-shell.tsx` to replace the vertical stack with tabbed navigation. Tab order: Rooms | Devices | Automations (disabled, placeholder for S-11) | Sites.

### Changes Required

#### 1. Install Tabs component

Run in project root:
```bash
npx shadcn@latest add tabs
```

Produces: `src/components/ui/tabs.tsx`

Verify it exports: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.

#### 2. Restructure — `src/app/_components/setup/setup-shell.tsx`

Replace the `<div className="flex flex-col gap-10">` vertical stack with:

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";

// Replace the gap-10 div with:
<Tabs defaultValue="rooms">
  <TabsList className="mb-6">
    <TabsTrigger value="rooms">Rooms</TabsTrigger>
    <TabsTrigger value="devices">Devices</TabsTrigger>
    <TabsTrigger value="automations" disabled>
      Automations
    </TabsTrigger>
    <TabsTrigger value="sites">Sites</TabsTrigger>
  </TabsList>

  <TabsContent value="rooms">
    <RoomManager rooms={rooms} siteId={siteId} />
  </TabsContent>

  <TabsContent value="devices">
    <DeviceTable devices={unassigned} rooms={rooms} />  {/* Phase 5 */}
  </TabsContent>

  <TabsContent value="automations">
    <p className="text-sm text-white/40">
      Automation rules are coming in a future update.
    </p>
  </TabsContent>

  <TabsContent value="sites">
    <SiteManager />
  </TabsContent>
</Tabs>
```

**Note**: `DeviceTable` import resolves in Phase 5. Until Phase 5 lands, keep the `<DeviceAssignmentGrid>` import in the Devices tab temporarily.

### Success Criteria

#### Automated
- `npx shadcn@latest add tabs` exits 0
- `npm run typecheck` passes
- `npm run check` passes

#### Manual
- 4 tabs visible in setup page
- Automations tab is visible but disabled (click does nothing)
- Switching tabs renders the correct content
- Default tab on page load: Rooms
- Visual style consistent with glassmorphism theme (tabs adapt to shadcn Tailwind vars)

---

## Phase 5: Device Table

### Overview

Replace `DeviceAssignmentGrid` (card grid) with `DeviceTable` (sortable table with search and pagination). Same data + mutation APIs. File `device-assignment-grid.tsx` is deleted after the import is swapped.

### Changes Required

#### 1. New component — `src/app/_components/setup/device-table.tsx`

**Props** (same data shape as DeviceAssignmentGrid):
```typescript
interface DeviceTableProps {
  devices: DeviceItem[];   // from device.overview unassigned + assigned
  rooms: RoomItem[];
}
```

**Internal state:**
```typescript
const [sortBy, setSortBy] = useState<"name" | "type" | "room" | "status">("name");
const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
const [search, setSearch] = useState("");
const [page, setPage] = useState(0);
const PAGE_SIZE = 20;
```

**Data pipeline:**
```typescript
const filtered = useMemo(() => {
  let rows = devices.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()),
  );
  rows = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") cmp = a.name.localeCompare(b.name);
    else if (sortBy === "type") cmp = a.deviceType.localeCompare(b.deviceType);
    else if (sortBy === "room") cmp = (a.roomName ?? "").localeCompare(b.roomName ?? "");
    else if (sortBy === "status") cmp = Number(b.isOnline) - Number(a.isOnline);
    return sortDir === "asc" ? cmp : -cmp;
  });
  return rows;
}, [devices, sortBy, sortDir, search]);

const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
```

Reset page to 0 on search change: `useEffect(() => setPage(0), [search])`.

**Sort toggle helper:**
```typescript
function toggleSort(col: typeof sortBy) {
  if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  else { setSortBy(col); setSortDir("asc"); }
}
```

**Table structure:**
```tsx
<div>
  {/* Search */}
  <Input
    placeholder="Search devices..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="mb-4 max-w-xs"
  />

  <div className="rounded-xl border border-white/10 overflow-hidden">
    <table className="w-full text-sm">
      <thead className="border-b border-white/10 bg-white/5">
        <tr>
          {(["name", "type", "room", "status"] as const).map((col) => (
            <th
              key={col}
              onClick={() => toggleSort(col)}
              className="cursor-pointer px-4 py-3 text-left font-medium text-white/60 hover:text-white/80 capitalize"
            >
              {col}
              {sortBy === col && (sortDir === "asc" ? " ↑" : " ↓")}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {paged.map((device) => (
          <tr key={device.id} className="hover:bg-white/[0.03]">
            <td className="px-4 py-3 text-white">{device.name}</td>
            <td className="px-4 py-3">
              <Badge variant="secondary">{device.deviceType}</Badge>
            </td>
            <td className="px-4 py-3">
              <RoomAssignSelect device={device} rooms={rooms} />  {/* existing mutation */}
            </td>
            <td className="px-4 py-3">
              <Badge variant={device.isOnline ? "default" : "outline"}>
                {device.isOnline ? "Online" : "Offline"}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* Pagination */}
  {totalPages > 1 && (
    <div className="mt-3 flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => setPage((p) => p - 1)}
      >
        Prev
      </Button>
      <span className="text-xs text-white/40">
        {page + 1} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages - 1}
        onClick={() => setPage((p) => p + 1)}
      >
        Next
      </Button>
    </div>
  )}
</div>
```

**Room assignment select** — extract the existing `<Select>` mutation logic from `device-assignment-grid.tsx` into a `RoomAssignSelect` sub-component (or inline). Reuse `api.device.assignToRoom` mutation (or whatever the existing mutation is called — verify during implementation).

#### 2. Swap import — `src/app/_components/setup/setup-shell.tsx`

Replace:
```typescript
import { DeviceAssignmentGrid } from "~/app/_components/setup/device-assignment-grid";
```
with:
```typescript
import { DeviceTable } from "~/app/_components/setup/device-table";
```

Replace `<DeviceAssignmentGrid .../>` with `<DeviceTable .../>` in the Devices tab content.

#### 3. Delete old file

Delete `src/app/_components/setup/device-assignment-grid.tsx` after the import swap is verified.

### Success Criteria

#### Automated
- `npm run typecheck` passes
- `npm run check` passes
- No import of `device-assignment-grid` remains anywhere (verify with grep)

#### Manual
- Device table renders with Name / Type / Room / Status columns
- Clicking column header sorts; clicking again reverses direction
- Active sort column shows ↑ or ↓ indicator
- Search filters by device name (case-insensitive)
- Pagination appears only when > 20 devices; Prev/Next work
- Room assignment dropdown works (mutation fires, toast confirms)
- `device-assignment-grid.tsx` deleted, no dead imports

---

## Testing Strategy

### Unit / Integration Tests

No new test files required. Existing `room.test.ts` and `site.test.ts` are unaffected. The new components are pure UI (no new tRPC procedures). Type safety is validated by `npm run typecheck`.

### Manual Testing Checklist (run after all 5 phases)

1. Dashboard loads with 4 KPI cards above device grid
2. Avg Temp shows `—` when all sensors offline/stale
3. Room sidebar visible on desktop, hidden on mobile (375px viewport)
4. Clicking room in sidebar filters grid; clicking "All Rooms" resets
5. Room dropdown in FilterBar hidden on desktop, visible on mobile
6. Sparkline appears on room cards that have sensors
7. Rooms with no sensors show no sparkline and no empty slot
8. Setup page loads with Rooms tab active by default
9. Switching to Devices tab shows sortable table
10. Automations tab is visible, click does nothing, shows disabled style
11. Device table search filters in real time
12. Column sort toggles direction on repeat click
13. Pagination shows only when > 20 devices
14. Room assignment dropdown in table fires mutation and shows toast
15. `npm run ci` passes end-to-end

---

## Migration Notes

- No schema changes, no migrations.
- `device-assignment-grid.tsx` is deleted in Phase 5 — no backwards-compatibility shim needed (not exported from any barrel file).
- `tabs.tsx` added to `src/components/ui/` — consistent with existing shadcn pattern; no global style conflicts expected with Tailwind v4.

---

## References

- `src/app/_components/device-overview.tsx:60-83` — KPI computations base
- `src/app/_components/device-overview.tsx:127-154` — hero section (replaced in Phase 1)
- `src/app/_components/room-group.tsx:15-64` — RoomGroup props + render (sparkline slot in Phase 3)
- `src/app/_components/filter-bar.tsx:54-115` — FilterBar render (room dropdown hidden in Phase 2)
- `src/app/_components/setup/setup-shell.tsx:40-46` — vertical stack (replaced in Phase 4)
- `src/app/_components/setup/device-assignment-grid.tsx:57-119` — card grid (replaced in Phase 5)
- `src/app/_components/device-card.tsx:96` — glassmorphism card pattern reference
- `src/app/_components/temperature-history-modal.tsx:101-163` — Recharts config reference for sparkline
- `src/server/api/routers/device.ts:108-164` — temperatureHistory endpoint
- `src/server/api/routers/device.ts:166-269` — device.overview return type

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: KPI Row

- [x] 1.1 New KPI computations added to `device-overview.tsx` (offlineCount, roomsOk, roomsTooHot, roomsTooCold, avgTempC)
- [x] 1.2 Hero section replaced with 4-card KPI grid
- [x] 1.3 `npm run typecheck` passes
- [ ] 1.4 KPI cards visible on dashboard, glassmorphism style, 2-col mobile / 4-col desktop

### Phase 2: Room Sidebar

- [x] 2.1 `room-sidebar.tsx` created with badge dots and All Rooms entry
- [x] 2.2 `activeRoomId` state wired to existing `roomFilter` in `device-overview.tsx`
- [x] 2.3 Sidebar integrated into device-overview layout (flex container)
- [x] 2.4 `hideRoomFilter` prop added to FilterBar, room dropdown hidden on desktop
- [x] 2.5 Sidebar hidden on mobile (`hidden sm:block`), room dropdown visible on mobile
- [x] 2.6 `npm run typecheck` passes; sidebar click filters grid
- [ ] 2.7 Manual: sidebar click + "All Rooms" reset verified in browser

### Phase 3: Room Sparklines

- [x] 3.1 `RoomSparkline` inline component added to `room-group.tsx`
- [x] 3.2 `primarySensorId` prop added to `RoomGroup`
- [x] 3.3 Primary sensor (`tuyaDeviceId`) computed and passed from `device-overview.tsx`
- [x] 3.4 `npm run typecheck` passes
- [ ] 3.5 Sparklines visible on room cards with sensors; absent on rooms without sensors

### Phase 4: Setup Tabs

- [x] 4.1 `npx shadcn@latest add tabs` executed; `src/components/ui/tabs.tsx` present (Base-UI backed)
- [x] 4.2 `setup-shell.tsx` restructured with Tabs (Rooms | Devices | Automations disabled | Sites)
- [x] 4.3 Automations tab renders placeholder text
- [x] 4.4 `npm run typecheck` + `npm run check` passes
- [ ] 4.5 Tab switching works; default tab is Rooms

### Phase 5: Device Table

- [x] 5.1 `device-table.tsx` created with sort / search / pagination
- [x] 5.2 Room assignment select migrated from DeviceAssignmentGrid, mutation wired
- [x] 5.3 Import in `setup-shell.tsx` swapped to `DeviceTable`
- [x] 5.4 `device-assignment-grid.tsx` deleted; no remaining imports (verified with grep)
- [x] 5.5 `npm run typecheck` + `npm run check` passes
- [ ] 5.6 Table sorts, searches, paginates; room assignment mutation works
