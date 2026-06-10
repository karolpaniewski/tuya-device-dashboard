# Device Filter and Search — Implementation Plan

## Overview

Add a horizontal filter bar to the main dashboard that lets the facility manager filter the device list by room (single-select dropdown), device type (All / Sensor / Valve / Plug chips), online/offline status (All / Online / Offline chips), and search by name (text input). All filtering is purely client-side on the data already loaded by `api.device.overview` — no new tRPC endpoint, no DB change.

## Current State Analysis

- `device.overview` returns `{ rooms: [...], unassigned: [...] }` where each device item already carries `deviceType`, `isOnline`, `name`, `roomId`, `roomName` — all fields needed for filtering.
- `DeviceOverview` (`src/app/_components/device-overview.tsx`) owns the `api.device.overview.useQuery()` call and renders rooms as `RoomGroup` components. Filter state and filter logic belong here.
- `RoomGroup` receives a `devices[]` array and renders them in a grid; it can receive a pre-filtered array with no structural changes.
- `DeviceCard` is server-component-compatible and purely presentational — no changes needed.
- No filter or search component exists anywhere in the codebase today.
- PRD scale is ≤50 devices; client-side filtering has zero performance concern.

## Desired End State

A horizontal filter bar appears between the dashboard header and the device groups. Selecting a room shows only that room's group. Selecting a type or status filters devices within each visible group. Typing in the search box narrows by device name (case-insensitive substring). Room groups with 0 matching devices after filtering are hidden entirely. When all groups are empty, a "No devices match your filters" message with a "Clear filters" link is shown. The 30-second auto-refresh continues to work — the filter state persists across data refreshes.

### Key Discoveries

- `device.overview` already returns all fields needed for client-side filtering — `deviceType`, `isOnline`, `name`, `roomId` per device item (`src/server/api/routers/device.ts:99–185`)
- `DeviceOverview` owns the query and renders directly; it is the natural home for filter state (`src/app/_components/device-overview.tsx`)
- `RoomGroup` is a pure presentational component that renders whatever `devices[]` it receives — it does not need modification (`src/app/_components/room-group.tsx`)
- The Unassigned group must also respect the filter: hidden when room filter is active; otherwise filtered same as named groups
- Roadmap explicitly scopes this as client-side only, no server-side query complexity (`context/foundation/roadmap.md:127`)

## What We're NOT Doing

- No server-side filtering or new tRPC procedures — all filtering is client-side on the in-memory data
- No URL-based filter state (query params) — filter state is ephemeral, resets on page reload
- No multi-select room filter — single dropdown, the PRD scale makes multi-select unnecessary overhead
- No filter persistence across sessions — transient UI state only
- No tests — user confirmed manual verification is sufficient for this slice
- No device type filters on the "Unassigned" group header itself — the group simply passes through the type/status/name predicates

## Implementation Approach

Two sequential phases. Phase 1 creates the pure presentational `FilterBar` component. Phase 2 wires filter state into `DeviceOverview`, applies the filter predicate to the raw data, and handles the empty-results state. The phases are sequential because Phase 2 imports the type definitions exported from Phase 1.

---

## Phase 1: FilterBar Component

### Overview

Create a purely presentational `FilterBar` component that renders the four filter controls. It receives the current filter state and individual `onChange` callbacks from `DeviceOverview`. It has no internal state and no data-fetching logic.

### Changes Required

#### 1. FilterBar Component

**File**: `src/app/_components/filter-bar.tsx` (new)

**Intent**: Render the horizontal filter bar with four controls: name search input, room dropdown, type chip buttons, and status chip buttons. Show a "Clear" link when any filter is non-default.

**Contract**: Export two items:

- `FilterState` interface: `{ roomId: string; type: "" | "sensor" | "valve" | "plug"; status: "" | "online" | "offline"; search: string; }`. The empty string `""` means "no filter on this dimension".

- `FilterBar` component with props:
  - `rooms: { roomId: string; roomName: string }[]` — list of rooms for the dropdown; derived from `data.rooms` in the parent
  - `filters: FilterState` — current active filter state
  - `activeFilterCount: number` — number of non-default filter dimensions; drives "Clear" button visibility
  - `onRoomChange: (roomId: string) => void`
  - `onTypeChange: (type: FilterState["type"]) => void`
  - `onStatusChange: (status: FilterState["status"]) => void`
  - `onSearchChange: (search: string) => void`
  - `onClear: () => void`

Layout: a single `<div>` with `flex flex-wrap items-center gap-3` styled dark (matches `bg-gray-800 border border-gray-700 rounded-lg px-4 py-3`). Left to right: name search input (`flex-1`), room dropdown, type chip group, status chip group, and a "Clear" link (visible only when `activeFilterCount > 0`).

- **Name search**: `<input type="text" placeholder="Search by name…" />` styled with `bg-gray-900 border-gray-600 text-white text-sm rounded px-3 py-1.5 focus:ring-blue-500`.
- **Room dropdown**: `<select>` with `<option value="">All Rooms</option>` followed by one `<option value={room.roomId}>` per room.
- **Type chips**: A `<div role="group">` containing four `<button type="button">` elements for All / Sensor / Valve / Plug. Active chip styled `bg-blue-600 text-white`; inactive styled `bg-gray-700 text-gray-300 hover:bg-gray-600`.
- **Status chips**: Same chip pattern for All / Online / Offline.
- **Clear link**: `<button type="button" className="text-gray-400 text-xs hover:text-white">Clear filters</button>` shown only when `activeFilterCount > 0`.

The component is `"use client"` (it will be imported into an existing client component, but marking it explicitly follows the established convention).

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with zero errors
- `npm run check` (Biome lint) passes

#### Manual Verification

- Dev server starts without errors; no visual regression on the main dashboard (FilterBar not yet rendered — Phase 2 wires it in)

**Implementation Note**: After automated verification passes, proceed to Phase 2.

---

## Phase 2: DeviceOverview Integration

### Overview

Wire the filter state and filter logic into `DeviceOverview`. Import `FilterBar` and `FilterState`, add four `useState` values, derive the filtered room and unassigned lists, render `FilterBar` above the groups, hide empty groups, and show a clear-able empty state when no devices match.

### Changes Required

#### 1. DeviceOverview Updates

**File**: `src/app/_components/device-overview.tsx` (modify)

**Intent**: Add filter state + filter predicate + render `FilterBar`; the component continues to own the `api.device.overview.useQuery()` call and the 30-second refetch interval unchanged.

**Contract**: Four state values added via `useState`:
- `roomFilter: string` (default `""`)
- `typeFilter: FilterState["type"]` (default `""`)
- `statusFilter: FilterState["status"]` (default `""`)
- `nameSearch: string` (default `""`)

Filter predicate — a helper (can be inline or a named function) that returns `true` if a device item passes all active non-room filters:
- If `typeFilter` is non-empty and `device.deviceType !== typeFilter` → false
- If `statusFilter === "online"` and `!device.isOnline` → false
- If `statusFilter === "offline"` and `device.isOnline` → false
- If `nameSearch` is non-empty and `device.name.toLowerCase()` does not include `nameSearch.toLowerCase()` → false
- Otherwise → true

Filtered room list (derived inline in the render — no `useMemo` needed at ≤50 devices):
1. Start from `data.rooms`
2. If `roomFilter` is non-empty, keep only rooms where `room.roomId === roomFilter`
3. For each remaining room, apply the device predicate to `room.devices`
4. Discard rooms where the filtered device array is empty

Filtered unassigned list:
- If `roomFilter` is non-empty → empty array (Unassigned is not a named room, so room filter hides it)
- Otherwise → `data.unassigned.filter(predicate)`

`activeFilterCount`: count of the four filter dimensions that are non-default (non-empty string).

`onClear`: reset all four state values to their defaults.

Render order in JSX:
1. `<FilterBar rooms={data.rooms.map(r => ({ roomId: r.roomId, roomName: r.roomName }))} filters={...} activeFilterCount={...} onRoomChange={...} onTypeChange={...} onStatusChange={...} onSearchChange={...} onClear={...} />`
2. If `filteredRooms.length === 0 && filteredUnassigned.length === 0` (and data is loaded): render `<p>No devices match your filters.</p>` with a `<button onClick={onClear}>Clear filters</button>` inline. Style to match the `text-gray-400 text-sm` pattern.
3. Otherwise: `filteredRooms.map(room => <RoomGroup .../>)` + unassigned group (same conditional as before but using `filteredUnassigned`).

The existing loading and error states are unchanged. FilterBar renders only when `data` is present (inside the `data &&` block or after the early returns for loading/error).

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes with zero errors
- `npm run check` (Biome lint) passes
- `npm run dev` starts without runtime errors

#### Manual Verification

- Filter bar appears below the dashboard header with all four controls visible
- Room dropdown lists all created rooms + "All Rooms" default; selecting a room shows only that room's group
- Type chips filter devices within visible groups; "All" restores them
- Status chips filter to Online or Offline devices only; "All" restores them
- Name search narrows devices case-insensitively as you type
- Combining filters (e.g., type=valve AND status=offline) applies AND logic
- When filters produce 0 results, "No devices match your filters" is shown with a working "Clear filters" action
- Room groups with 0 matching devices after filter are hidden (not shown as empty)
- Unassigned group is hidden when a named room filter is active; otherwise it participates in type/status/name filtering
- The 30-second data refresh continues to work — filter state persists across re-fetches
- No visual regressions on the main dashboard when no filters are active

**Implementation Note**: After all automated and manual verification passes, this change is complete.

---

## Testing Strategy

No automated tests for this slice (user confirmed: logic is trivial, manual verification is sufficient).

### Manual Testing Steps

1. Start dev server: `npm run dev` (with `TUYA_STUB=true` in `.env`)
2. Log in, navigate to the main dashboard
3. Verify filter bar appears between the header and the device groups
4. Room filter: select a room → only that room's group shown; select "All Rooms" → all groups restored
5. Type filter: select "Valve" → only valves shown across all room groups (empty groups hidden)
6. Status filter: select "Offline" → only offline devices shown
7. Combined: room = Room 1, type = Sensor → only sensors in Room 1
8. Name search: type part of a device name → matching devices shown; clear input → all restored
9. All filters active with no matches → "No devices match" message + "Clear filters" link
10. Click "Clear filters" → all filters reset, all devices visible
11. Wait 30 seconds → auto-refresh fires, filter state preserved

## References

- Roadmap: S-03 in `context/foundation/roadmap.md`
- PRD: FR-006, FR-007, FR-008, FR-009 in `context/foundation/prd.md`
- Existing component patterns: `src/app/_components/device-overview.tsx`, `src/app/_components/room-group.tsx`
- Setup page filter bar pattern (for chip UX): `src/app/_components/setup/device-assignment-grid.tsx`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: FilterBar Component

#### Automated

- [x] 1.1 `npm run typecheck` passes with zero errors
- [x] 1.2 `npm run check` (Biome lint) passes

#### Manual

- [x] 1.3 Dev server starts without errors; no visual regression on main dashboard

### Phase 2: DeviceOverview Integration

#### Automated

- [ ] 2.1 `npm run typecheck` passes with zero errors
- [ ] 2.2 `npm run check` (Biome lint) passes
- [ ] 2.3 `npm run dev` starts without runtime errors

#### Manual

- [ ] 2.4 Filter bar appears below the dashboard header with all four controls visible
- [ ] 2.5 Room dropdown lists all rooms + "All Rooms"; selecting a room shows only that group
- [ ] 2.6 Type chips filter devices within groups; "All" restores them
- [ ] 2.7 Status chips filter to Online/Offline only; "All" restores
- [ ] 2.8 Name search narrows devices as you type (case-insensitive)
- [ ] 2.9 Combined filters apply AND logic
- [ ] 2.10 Zero-results state shows "No devices match" + working "Clear filters"
- [ ] 2.11 Room groups with 0 matches after filter are hidden
- [ ] 2.12 Unassigned group hidden when room filter is active; participates in other filters otherwise
- [ ] 2.13 30-second auto-refresh continues; filter state persists across re-fetches
