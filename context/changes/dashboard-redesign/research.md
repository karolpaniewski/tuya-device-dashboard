---
date: 2026-06-12T08:31:28Z
researcher: Claude Sonnet 4.6
git_commit: f8921b6bf3a7cb3bb69ff08a43a2745381ee1b16
branch: main
repository: karolpaniewski/tuya-device-dashboard
topic: "Dashboard & Setup Redesign — codebase baseline"
tags: [research, dashboard, setup, recharts, sparklines, kpi, tabs, sidebar]
status: complete
last_updated: 2026-06-12
last_updated_by: Claude Sonnet 4.6
---

# Research: Dashboard & Setup Redesign — Codebase Baseline

**Date**: 2026-06-12T08:31:28Z
**Git Commit**: f8921b6bf3a7cb3bb69ff08a43a2745381ee1b16
**Branch**: main
**Repository**: karolpaniewski/tuya-device-dashboard

## Research Question

What exists today in the dashboard and setup pages, what data is available for KPI cards and sparkline charts, and what UI primitives are ready to reuse — so the plan for S-15 dashboard-redesign has zero unknowns before implementation starts.

## Summary

The codebase is in good shape for this redesign. The data layer needs zero changes (all KPI values are already returned by `device.overview`). The three major structural changes are:
1. **Dashboard layout** — add a two-column layout with left room-sidebar + move filter/grid to right column; lift existing hero stats into a proper KPI row.
2. **Sparklines** — add a `temperatureHistory` call per room-group using the first online sensor; Recharts is already installed and the data transform is trivial.
3. **Setup tabs** — no Tabs component exists yet; needs to be installed via shadcn CLI; DeviceAssignmentGrid is currently a card grid and needs a full redesign as a sortable table.

---

## Detailed Findings

### 1. Current Dashboard Data Flow

**Entry point**: `src/app/page.tsx`
- Server component; reads `tuya-active-site` cookie, prefetches `api.device.overview({ siteId })`.
- `src/app/page.tsx:10-12`

**Main component**: `src/app/_components/device-overview.tsx`
- Client component; re-queries `api.device.overview` with 30s refetch interval.
- Already computes three KPI values:
  - `totalDevices` — `src/app/_components/device-overview.tsx:81`
  - `onlineCount` — `src/app/_components/device-overview.tsx:82`
  - `roomCount` — `src/app/_components/device-overview.tsx:83`
- **Missing for KPI row**: OK/Too Cold/Too Hot room counts and average temperature. Both are derivable client-side from `data.rooms[*].badge` and `data.rooms[*].devices[*].temperatureC` — no backend change needed.

**Hero section** (current): `src/app/_components/device-overview.tsx:127-154`
- Renders total/online/rooms as `<Badge>` elements in a `flex-wrap` row.
- Can be restructured into a 4-column KPI card grid above the main layout.

**Filter bar**: `src/app/_components/filter-bar.tsx:54-115`
- Full-width bar with search, room dropdown, type buttons, status buttons.
- In sidebar layout, the room filter moves to the sidebar and the bar shrinks to search + type + status only.

**Room groups**: `src/app/_components/room-group.tsx`
- Props: `{ roomName, devices, badge, anomaly, suggestion }`
- Renders a `<section>` with heading + `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` device grid.
- No sparkline slot today — this is where inline chart is added.

**Responsive grid pattern** (used everywhere): `"grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"` — `src/app/_components/room-group.tsx:57`

---

### 2. KPI Card Data — All Available from `device.overview`

`device.overview` return shape — `src/server/api/routers/device.ts:166-269`:

```typescript
{
  rooms: {
    roomId: string;
    roomName: string;
    siteId: string;
    siteName: string;
    devices: {
      id: string;
      deviceType: "sensor" | "valve" | "plug";
      isOnline: boolean;
      temperatureC: number | null;   // live, from deviceStateStore
      setpointC: number | null;
      isStale: boolean;
    }[];
    badge: "OK" | "Too Cold" | "Too Hot" | null;  // from scoreRoom()
    anomaly: boolean;
    suggestion: string | null;
  }[];
  unassigned: DeviceItem[];
}
```

**KPI derivations (all client-side, zero new endpoints):**
| KPI card | Derivation |
|----------|-----------|
| Total devices | `data.rooms.flatMap(r => r.devices).length + data.unassigned.length` |
| Online / Offline | count `isOnline === true/false` across all devices |
| Rooms OK | `data.rooms.filter(r => r.badge === "OK").length` |
| Rooms Too Cold | `data.rooms.filter(r => r.badge === "Too Cold").length` |
| Rooms Too Hot | `data.rooms.filter(r => r.badge === "Too Hot").length` |
| Avg temperature | average `temperatureC` where device is sensor and not null |

---

### 3. Sparkline Charts — temperatureHistory Endpoint

**Endpoint**: `src/server/api/routers/device.ts:108-164`

Input: `{ deviceId: string, range: "1h" | "24h" | "7d" }`

Output (same shape for all ranges):
```typescript
{ recordedAt: Date; temperatureC: number | null; setpointC: number | null }[]
```

- `24h` range: backend pre-buckets into 300s intervals and AVGs temperature — returns ~288 points max.
- Client-side transform: `{ ts: new Date(r.recordedAt).getTime(), temperatureC, setpointC }` — `src/app/_components/temperature-history-modal.tsx:49-53`

**Current Recharts usage** (`src/app/_components/temperature-history-modal.tsx`):
```typescript
import { ResponsiveContainer, LineChart, CartesianGrid,
         XAxis, YAxis, Tooltip, Legend, Line } from "recharts";
```

Line config:
- Temperature: `stroke="#60a5fa"` (blue-400), `strokeWidth={2}`, `dot={false}`, `connectNulls={false}`
- Setpoint: `stroke="#fb923c"` (orange-400), same config

**Sparkline approach** — for a room card inline chart:
- Call `device.temperatureHistory({ deviceId: primarySensorId, range: "24h" })`
- Render as `<ResponsiveContainer width="100%" height={56}>` with `<LineChart>`, only the temperature `<Line>` (no setpoint, no axes, no legend)
- Suppress CartesianGrid, XAxis, YAxis for ultra-minimal sparkline look
- Add `isAnimationActive={false}` for performance on multiple concurrent charts

**Critical gap — room-level sparkline**: The endpoint is **per-device**, not per-room. For a per-room sparkline, the plan must define a strategy:
- **Option A** (recommended): use the first `isOnline` sensor in the room; if none online, fallback to first sensor.
- **Option B**: add a `room.temperatureHistory` endpoint that aggregates sensors — this is a backend change (out of scope per change.md).

Option A requires no backend change and aligns with the "out of scope: backend changes" constraint.

---

### 4. Setup Page Current Structure

**Entry**: `src/app/setup/page.tsx` — prefetches `room.list` and `device.overview` for all sites.

**Container**: `src/app/_components/setup/setup-shell.tsx`
- Client component; queries `site.list`, `room.list`, `device.overview`.
- Renders three sections **vertically stacked** with `gap-10`:
  - `src/app/_components/setup/setup-shell.tsx:40-46`

```
SetupShell
  ├── SiteManager      (CRUD for sites)
  ├── RoomManager      (CRUD for rooms + nested threshold forms)
  └── DeviceAssignmentGrid  (device → room assignment)
```

**SiteManager** (`src/app/_components/setup/site-manager.tsx:70-155`): list + create/rename/delete sites.

**RoomManager** (`src/app/_components/setup/room-manager.tsx:75-199`):
- Rooms as expandable list items.
- Settings button per room toggles `<RoomThresholdForm>` inline.
- Threshold form: min/max/anomaly-gap temperature inputs — `src/app/_components/setup/room-threshold-form.tsx:62-136`

**DeviceAssignmentGrid** (`src/app/_components/setup/device-assignment-grid.tsx:57-119`):
- **Currently a responsive card grid** (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`), not a table.
- Each card: device name + type badge + room assignment dropdown.
- **Must be redesigned** as a proper table with sortable columns (name, type, room, status) and inline search/pagination for S-15.

**Candidate tabs for redesigned Setup:**
| Tab | Content | Source component |
|-----|---------|-----------------|
| Rooms | Room CRUD + threshold config | RoomManager |
| Devices | Sortable device table with room assignment | DeviceAssignmentGrid (redesigned) |
| Automations | Automation rules list (S-11, not yet built) | Future |
| Sites | Site CRUD | SiteManager |

---

### 5. UI Component Inventory

**Available shadcn components** (`src/components/ui/`):

| Component | File | Notes |
|-----------|------|-------|
| Badge | `badge.tsx` | CVA variants: default, secondary, destructive, outline, ghost |
| Button | `button.tsx` | CVA variants, min-h-10 touch target |
| ErrorMessage | `error-message.tsx` | 3 variants: banner, inline, page |
| Input | `input.tsx` | Base-UI primitive |
| Select | `select.tsx` | Full-featured dropdown, scroll buttons |
| Skeleton | `skeleton.tsx` | Pulse animation |
| Sonner | `sonner.tsx` | Toast system |

**⚠️ No Tabs component** — not installed. Plan must include `npx shadcn@latest add tabs` step.

**Glassmorphism card pattern** (used on DeviceCard — `src/app/_components/device-card.tsx:96`):
```
rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-[2px]
hover:border-white/20 hover:bg-white/[0.08]
```
KPI cards should follow this exact pattern for visual consistency.

**Icon library**: `lucide-react@^1.17.0` — already imported throughout. Relevant icons for KPI cards: `Thermometer`, `Wifi`, `WifiOff`, `CheckCircle2`, `Snowflake`, `Flame`, `Building2`.

**Tailwind v4** with oklch dark-mode tokens. Custom radius scale: `--radius-xl: 0.875rem`. No special configuration needed for new components.

---

## Architecture Insights

**Zero backend changes needed for KPI row and sidebar** — `device.overview` already returns everything required. All KPI values are client-side derivations.

**Sparklines require one new tRPC call per room-group** (`device.temperatureHistory` on the primary sensor). With 10 rooms, this is 10 parallel queries on mount — acceptable for a LAN-only dashboard with ≤50 devices. Queries should be `{ staleTime: 60_000 }` to avoid hammering the backend on each re-render.

**Sidebar layout change**: `PageShell` is currently `min-h-screen px-4 py-8` (no flex columns). The sidebar pattern requires the `page.tsx` to change from `<DeviceOverview />` standalone to a two-column layout:
```tsx
<div className="flex gap-6">
  <RoomSidebar rooms={...} activeRoom={...} onSelect={...} />
  <div className="flex-1 min-w-0">
    <DeviceOverview ... />
  </div>
</div>
```
This change is scoped to `src/app/page.tsx` and a new `RoomSidebar` component — `PageShell` itself doesn't need modification.

**Tabbed setup**: `SetupShell` needs to become the tab container. Each existing section (SiteManager, RoomManager, DeviceAssignmentGrid) becomes a tab panel. The `gap-10` vertical stack is replaced by tab content. Each tab is lazy — only the active tab queries data.

**DeviceAssignmentGrid → DeviceTable**: This is the largest single component change. The card grid needs to be replaced with an HTML table using `<table>` or a shadcn DataTable. Sorting is client-side (sort state in component). Pagination: 20 items per page with prev/next. Search: filter by name/room inline (same pattern as FilterBar).

---

## Code References

- `src/app/page.tsx:10-12` — siteId cookie read + overview prefetch
- `src/app/_components/device-overview.tsx:60-83` — data query + KPI computations
- `src/app/_components/device-overview.tsx:127-154` — hero section (current KPI display)
- `src/app/_components/device-overview.tsx:231-264` — device grid rendering (sidebar integration point)
- `src/app/_components/room-group.tsx:15-64` — RoomGroup props + render structure
- `src/app/_components/filter-bar.tsx:54-115` — FilterBar full render
- `src/components/page-shell.tsx:22-53` — PageShell layout (sidebar NOT here)
- `src/server/api/routers/device.ts:108-164` — temperatureHistory endpoint
- `src/server/api/routers/device.ts:166-269` — device.overview return type
- `src/app/_components/temperature-history-modal.tsx:6-15` — Recharts imports
- `src/app/_components/temperature-history-modal.tsx:49-53` — data transform for Recharts
- `src/app/_components/temperature-history-modal.tsx:101-163` — full chart config
- `src/app/_components/setup/setup-shell.tsx:40-46` — vertical stack (tabs target)
- `src/app/_components/setup/device-assignment-grid.tsx:57-119` — card grid (table target)
- `src/app/_components/device-card.tsx:96` — glassmorphism card pattern
- `src/styles/globals.css:1-136` — Tailwind v4 theme tokens

## Open Questions

1. **Room sparkline: primary sensor selection** — if a room has multiple sensors, which one to use for the sparkline? Recommendation: first `isOnline` sensor; if all offline, first in list. Confirm during plan.

2. **Sidebar visibility on mobile** — sidebar adds a second column; on 375px viewport (S-08 already done) it would collapse to hidden or bottom-sheet. Out of scope for S-15? Confirm: desktop-only sidebar is acceptable.

3. **Tabs component installation** — `npx shadcn@latest add tabs` installs a Radix-UI based Tabs. Confirm this is the preferred approach vs building from Base-UI primitives (Base-UI is already the project's primitive layer).

4. **Device table pagination size** — 20 items per page assumed; confirm or adjust.

5. **KPI card "average temperature"** — average across all sensors (including offline/stale) or only `isOnline && !isStale` sensors? Recommendation: online+non-stale only.
