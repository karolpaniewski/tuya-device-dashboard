# Room Quick-Overview Panel — Implementation Plan

## Overview

Replace the centered `RoomModal` dialog on the dashboard with a slide-in Sheet panel that keeps the dashboard visible in the background. The panel exposes current temperature, 24h history chart, device list, automation modes list, and heat toggle — all data already available in the existing `device.overview` query.

## Current State Analysis

- `device-overview.tsx:146` has `selectedRoomId: string | null` state.
- `onHeaderClick={() => setSelectedRoomId(room.roomId)}` is wired on every `RoomGroup` at `:1051` and `:1096`.
- `device-overview.tsx:1159–1175` renders `<RoomModal>` when `selectedRoomId` is set — this is the **sole swap target** for Phase 3.
- `RoomModal` in `tuya-automation-flow.tsx` is independent and untouched.
- `HeatToggle` + `HeatToggleProps` are local (non-exported) in `room-group.tsx:60–125` — extract to shared file.
- `toggleHeatMutation` at `device-overview.tsx:221` handles `onSuccess`/`onError` globally; `room.pinnedOff` from `RoomItem` carries the current heat state.
- `RoomChart` pattern in `room-temperature-panel.tsx:19–120`: queries `api.device.temperatureHistory({ tuyaDeviceId, range: "24h" })`, renders Recharts `LineChart` with CartesianGrid + XAxis + YAxis + Tooltip.
- Primary sensor derivation (used in 3 codebase locations): `room.devices.find(d => d.deviceType === "sensor" && d.isOnline)?.tuyaDeviceId ?? room.devices.find(d => d.deviceType === "sensor")?.tuyaDeviceId ?? null`.
- Live temperature: `room.devices.find(d => d.deviceType === "sensor" && d.isOnline && !d.isStale)?.temperatureC ?? null`.
- `shadcn Sheet` is **not installed** (`src/components/ui/sheet.tsx` missing).

## Desired End State

- Clicking a room name on the dashboard opens a 420px slide-in panel from the right; the dashboard remains visible and scrollable behind a partial overlay.
- Panel shows: room name (SheetTitle), current temperature chip + badge, heat toggle (Popover confirm for "turn off"), 24h temperature chart (conditionally — only when `primarySensorId !== null`), device list with online/offline status and readings, automation modes list.
- Panel closes via SheetClose button, Esc, or clicking outside the panel.
- Automation-flow canvas behaviour unchanged.
- `npm run ci` passes (lint + typecheck + tests).

### Key Discoveries

- `device-overview.tsx:1159–1175` — the only line range to change for the wiring; no click-handler changes needed.
- `room-group.tsx:60–125` — `HeatToggle` local component; extract verbatim, only add `export`.
- `room-temperature-panel.tsx:19–120` — `RoomChart` local component; do **not** export; inline an equivalent chart in the panel (avoids coupling to the `RoomItem` prop shape of `RoomChart`, which includes a room-name header we don't want in the panel).
- `device-overview.tsx:221` — `toggleHeatMutation` already configured with toast success/error — pass `mutate` call as `onToggleHeat` prop without re-wrapping.
- No React component tests exist in this project — phase 4 is manual verification only.

## What We're NOT Doing

- Not modifying `tuya-automation-flow.tsx` or `room-modal.tsx`.
- Not adding a new tRPC endpoint — the panel reuses `device.overview` cache and the existing `api.device.temperatureHistory` query.
- Not adding React Testing Library component tests — no such pattern exists in the project.
- Not changing the room-card click target — `onHeaderClick` on the room name `<h2>` already fires `setSelectedRoomId`.

## Implementation Approach

Four phases: (1) install shadcn Sheet + extract HeatToggle to a shared file, (2) build the panel component, (3) wire it into device-overview.tsx replacing the RoomModal block, (4) manual verification. All changes are front-end only, no schema or server changes.

## Critical Implementation Details

**Chart section conditional rendering**: Per PRD, the 24h chart section is hidden (not shown with placeholder) when the room has no sensor. Use `primarySensorId !== null` as the gate — render nothing when false. The `api.device.temperatureHistory` query should only be called when `primarySensorId` is non-null (use `enabled` option).

**Sheet close pattern**: shadcn Sheet fires `onOpenChange(false)` on Esc, overlay click, and close button. Use `<Sheet defaultOpen onOpenChange={(open) => !open && onClose()}>` — consistent with how `RoomModal` / `DeviceModal` use `Dialog defaultOpen`.

**toggleHeatMutation shared pending state**: `toggleHeatMutation.isPending` in `device-overview.tsx` covers all heat-toggle calls site-wide. Passing it to the panel as `isToggleHeatPending` is correct even though it could be pending from a different room's toggle in the RoomGroup headers — this is identical to the existing behaviour in `RoomGroup`.

---

## Phase 1: Setup — Install Sheet + Extract HeatToggle

### Overview

Install the shadcn Sheet primitive and move `HeatToggle` out of `room-group.tsx` so both the existing room group headers and the new panel can share it.

### Changes Required

#### 1. Install shadcn Sheet

**Intent**: Add the Sheet UI primitive to the project's component library.

**Contract**: Run `npx shadcn@latest add sheet` in the project root. This creates `src/components/ui/sheet.tsx` and may update `components.json`. The installed component exports: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetClose`, `SheetTrigger`, `SheetFooter`. No other files change.

#### 2. Extract HeatToggle

**File**: `src/app/_components/heat-toggle.tsx`

**Intent**: Create a new file containing the `HeatToggle` component and its `HeatToggleProps` interface, extracted verbatim from `room-group.tsx`. This makes the component reusable by the new panel.

**Contract**: The new file exports `HeatToggle` and `HeatToggleProps`. The component signature stays identical: `{ isPending?, onToggleHeat, pinnedOff }`. The Popover-based confirm for "Turn heat off" is preserved exactly — same UX in both the room group header and the panel.

#### 3. Update room-group.tsx

**File**: `src/app/_components/room-group.tsx`

**Intent**: Replace the local `HeatToggle` definition and `HeatToggleProps` with an import from the new shared file. No logic or interface changes.

**Contract**: Remove the local `interface HeatToggleProps` (lines ~60–63) and `function HeatToggle` (lines ~66–125). Add `import { HeatToggle } from "./heat-toggle"`. All other code in the file is unchanged.

### Success Criteria

#### Automated Verification
- `npm run lint` passes (no unused imports, no lint errors in room-group.tsx or heat-toggle.tsx)
- `npm run typecheck` passes
- `npx shadcn@latest add sheet` exits 0; `src/components/ui/sheet.tsx` exists

#### Manual Verification
- Room group heat toggle still works (turn heat on/off in a room — confirm popover appears for turn-off, direct button for turn-on)

---

## Phase 2: Build RoomQuickOverviewPanel

### Overview

Create the new slide-in panel component. It reuses data from the `RoomItem` type already passed by `device-overview.tsx`, queries temperature history for its chart, and composes `HeatToggle` from Phase 1.

### Changes Required

#### 1. Create room-quick-overview-panel.tsx

**File**: `src/app/_components/room-quick-overview-panel.tsx`

**Intent**: Implement the slide-in panel with five content sections: header (room name + current temp + badge), heat toggle, temperature history chart (conditional), device list, and modes list.

**Contract**: The component accepts:
```ts
interface Props {
  room: RouterOutputs["device"]["overview"]["rooms"][number];
  modesForRoom: ModeTargetingRoom[];
  onClose: () => void;
  onToggleHeat: (pinnedOff: boolean) => void;
  isToggleHeatPending: boolean;
}
```

Internal layout:
- `<Sheet defaultOpen onOpenChange={(open) => !open && onClose()}>` wrapping `<SheetContent side="right" className="w-[420px] ...">`.
- **Header** (`<SheetHeader>`): `<SheetTitle>` with room name; below it, a row with current temperature value (derive via `room.devices.find(d => d.deviceType === "sensor" && d.isOnline && !d.isStale)?.temperatureC ?? null`; show `—` if null) and the room badge (same badge values as room-group.tsx: OK / Too Hot / Too Cold). Use `ROOM_STATUS_BADGE_CLASSES` from `~/lib/room-status-colors` for badge colouring.
- **Heat toggle** section: render `<HeatToggle pinnedOff={room.pinnedOff ?? false} onToggleHeat={onToggleHeat} isPending={isToggleHeatPending} />`.
- **Temperature chart** section: derive `primarySensorId` using the canonical pattern (sensor && isOnline fallback to any sensor). If `primarySensorId` is null, render nothing for this section. If non-null, render a `<RoomPanelChart sensorId={primarySensorId} />` sub-component (local to this file) that queries `api.device.temperatureHistory({ tuyaDeviceId: sensorId, range: "24h" }, { enabled: true, staleTime: 60_000 })` and renders a Recharts `LineChart` (same style as `room-temperature-panel.tsx`: CartesianGrid, XAxis with `formatTs`, YAxis with `°` tick, Tooltip, no animation). Show "Loading…" text during the initial load; no "No sensors" placeholder (the conditional at the parent level handles sensor absence).
- **Devices section**: a section heading + a list of device rows. Each row shows: device name, online/offline icon (`Wifi`/`WifiOff` from lucide), temperature reading (if device is a sensor), and valve open/close state. Follow the visual pattern from `room-modal.tsx`'s device rows.
- **Modes section**: if `modesForRoom.length > 0`, render a section heading + a list of mode rows mirroring `room-modal.tsx`'s "Targeted by" section (mode name, ON/OFF badge, schedule text via `formatModeSchedule`).

The body of SheetContent should be scrollable (`overflow-y-auto`).

### Success Criteria

#### Automated Verification
- `npm run typecheck` passes
- `npm run lint` passes

#### Manual Verification
- Import and render the component in isolation (temporary usage) to confirm Sheet opens, sections render correctly, X / Esc / overlay-click closes it.

---

## Phase 3: Wire into device-overview.tsx

### Overview

Replace the `RoomModal` render in `device-overview.tsx` with `RoomQuickOverviewPanel`. This is a surgical three-line swap in a single file.

### Changes Required

#### 1. Update imports in device-overview.tsx

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Add the new panel import and remove the now-unused `RoomModal` import.

**Contract**: Remove line `import { RoomModal } from "./room-modal";` (line ~52). Add `import { RoomQuickOverviewPanel } from "./room-quick-overview-panel";`. The `RoomModal` import in `tuya-automation-flow.tsx` is unaffected.

#### 2. Replace RoomModal render block

**File**: `src/app/_components/device-overview.tsx`

**Intent**: Replace the `RoomModal` render at lines 1159–1175 with `RoomQuickOverviewPanel`, threading the existing `toggleHeatMutation` and `room.pinnedOff` data.

**Contract**: Replace the `selectedRoomId && (() => { ... RoomModal ... })()` block with:
```tsx
{selectedRoomId &&
  (() => {
    const room = data?.rooms.find((r) => r.roomId === selectedRoomId);
    if (!room) return null;
    return (
      <RoomQuickOverviewPanel
        room={room}
        modesForRoom={getModesForRoom(selectedRoomId, modeListQuery.data ?? [])}
        onClose={() => setSelectedRoomId(null)}
        onToggleHeat={(pinnedOff) =>
          toggleHeatMutation.mutate({ roomId: selectedRoomId, pinnedOff })
        }
        isToggleHeatPending={toggleHeatMutation.isPending}
      />
    );
  })()}
```

The `selectedRoomId` state variable, `setSelectedRoomId`, `toggleHeatMutation`, `modeListQuery`, and `getModesForRoom` are already in scope — no new state or hooks needed.

### Success Criteria

#### Automated Verification
- `npm run typecheck` passes (no unused `RoomModal` import, panel props typecheck)
- `npm run lint` passes
- `npm run ci` passes end-to-end

#### Manual Verification
- Click a room name on the dashboard: slide-in panel opens from the right; dashboard remains visible.
- Panel shows: room name, current temperature (or `—` if sensor offline), status badge, heat toggle, 24h chart (if sensor exists), device list with online/offline icons, modes list (if any modes target the room).
- Click X or press Esc or click outside the panel: panel closes, `selectedRoomId` resets to null.
- Click a different room while panel is open: panel updates to show the new room (or closes and reopens, depending on Sheet behaviour).
- Automation-flow canvas: click a room node → centered `RoomModal` dialog opens (unchanged).
- Turn heat off from the panel: confirm popover appears; confirm → heat toggles; `pinnedOff` badge appears on room group header; panel `toggleHeat` button updates.
- Room with no temperature sensor: panel shows no chart section; devices and modes still render.

---

## Phase 4: Verification & Cleanup

### Overview

Final pass: confirm CI green, no regressions, and clean up any temporary code used in Phase 2 manual testing.

### Changes Required

#### 1. Cleanup (if any)

**Intent**: Remove any temporary imports or debug usage from Phase 2 manual testing. Ensure the `RoomModal` import is fully removed from `device-overview.tsx`.

**Contract**: `grep -r "RoomModal" src/app/_components/device-overview.tsx` returns no results.

### Success Criteria

#### Automated Verification
- `npm run ci` passes (lint + typecheck + test suite)

#### Manual Verification
- Full regression check: dashboard loads, all room groups render, device modal still opens on device click, heat toggle works from room group headers, automation-flow canvas room click still opens centered dialog.
- Edge cases:
  - Room with 0 devices: panel opens, both lists empty, no chart.
  - Room with sensor that is offline: `—` shown for temperature; chart may still render if historical data is cached.
  - All rooms have heat `pinnedOff: true`: all panels show "Turn heat on" button (no confirm needed).

---

## Testing Strategy

### Pure function tests (project convention)

No new pure functions are introduced by this change — all logic is JSX composition using existing hooks. No new `.test.ts` files are needed.

### Manual Testing Steps

1. Open dashboard with at least one room that has a temperature sensor.
2. Click room name → panel opens from right; dashboard remains visible behind partial overlay.
3. Verify: temperature chip shows current reading; badge matches room status; chart renders.
4. Click another room name → panel updates (Sheet re-renders with new room data).
5. Press Esc → panel closes.
6. Click overlay (outside the panel) → panel closes.
7. Click X button in panel header → panel closes.
8. Use heat toggle: "Turn heat off" → confirm popover; "Confirm" → mutation fires; badge updates.
9. Open automation-flow (/automation-flow) → click room node → centered dialog opens (unchanged).
10. Room without sensor: panel shows no chart section.

## References

- PRD: `context/foundation/prd-v10.md`
- RoomModal (reference for devices/modes rendering): `src/app/_components/room-modal.tsx`
- HeatToggle source: `src/app/_components/room-group.tsx:60–125`
- RoomChart pattern: `src/app/_components/room-temperature-panel.tsx:19–120`
- Primary sensor derivation: `src/app/_components/room-group.tsx:1062–1069` (in device-overview.tsx context)
- toggleHeatMutation: `src/app/_components/device-overview.tsx:221–230`
- RoomModal render target: `src/app/_components/device-overview.tsx:1159–1175`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Setup — Install Sheet + Extract HeatToggle

#### Automated

- [x] 1.1 npm run lint passes (room-group.tsx + heat-toggle.tsx) — 0cd8a91
- [x] 1.2 npm run typecheck passes — 0cd8a91
- [x] 1.3 src/components/ui/sheet.tsx exists after shadcn install — 0cd8a91

#### Manual

- [x] 1.4 Room group heat toggle still works (confirm popover for turn-off)

### Phase 2: Build RoomQuickOverviewPanel

#### Automated

- [x] 2.1 npm run typecheck passes — 0f18dcd
- [x] 2.2 npm run lint passes — 0f18dcd

#### Manual

- [x] 2.3 Sheet opens, sections render correctly, X / Esc / overlay closes it

### Phase 3: Wire into device-overview.tsx

#### Automated

- [x] 3.1 npm run typecheck passes (no unused RoomModal import) — 687a8ff
- [x] 3.2 npm run lint passes — 687a8ff
- [x] 3.3 npm run ci passes end-to-end — 687a8ff

#### Manual

- [x] 3.4 Dashboard: click room name → slide-in panel opens from right
- [x] 3.5 Panel shows temp, badge, heat toggle, chart (if sensor), devices, modes
- [x] 3.6 X / Esc / overlay closes panel
- [x] 3.7 Automation-flow canvas: room node click still opens centered dialog
- [x] 3.8 Heat toggle from panel fires mutation; badge updates on room group header
- [x] 3.9 Room without sensor: chart section absent

### Phase 4: Verification & Cleanup

#### Automated

- [x] 4.1 npm run ci passes (lint + typecheck + test suite)

#### Manual

- [x] 4.2 Full regression: device modal, heat toggle in room headers, automation-flow canvas
- [x] 4.3 Edge cases: 0-device room, offline sensor, all rooms pinnedOff
