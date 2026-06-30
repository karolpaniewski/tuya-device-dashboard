# Automation Flow Bulk-Connect — Implementation Plan

## Overview

PRD: `context/foundation/prd.md` (v1, 2026-06-29, brownfield)

This plan extends the `/automation-flow` canvas in two parts:

1. **Canvas redesign** — replace the single-room-at-a-time view with a full-topology
   view: all mode nodes (left) + all room nodes (right), no device column. Removes
   the room-selector dropdown.

2. **Bulk-connect interactions** — double-click a mode node to mark it as the active
   bulk target; shift-click or lasso-select room nodes; context toolbar shows
   "Connect N" / "Disconnect M" with counts; mutations are batched, idempotent.

## Current State Analysis

**Canvas** (`src/app/_components/automation-flow/tuya-automation-flow.tsx`):
- Shows one room at a time chosen via a `<Select>` dropdown (`viewedRoomId` state).
- `computedNodes`: mode nodes + ONE room node + device nodes for that room.
- `computedEdges`: mode→room edges only for modes targeting the viewed room + device containment edges.
- Edge ID format: `e-mode-${modeId}-room` (singular — assumed one room per mode).
- `onNodeClick` for mode nodes: `router.push("/setup")`.
- No `onNodeDoubleClick`, no `onSelectionChange`, no `onPaneClick`.
- Multi-select: default @xyflow behavior (Ctrl/Cmd), `deleteKeyCode={null}`.
- `ModeNode` source handle: `isConnectable={!connected}` — handle hidden when mode already has a connection.

**Layout** (`src/lib/automation-flow-layout.ts`):
- `computeAutomationFlowLayout(modeCount, deviceCount)` returns `{ modes[], room, devices[] }`.
- Single room fixed at `x=340, y=0`; devices in right column at `x=680`.

**tRPC** (`src/server/api/routers/mode.ts`):
- `addTarget({ modeId, roomId })` — NOT idempotent: throws `CONFLICT` on duplicate.
- `removeTarget({ modeId, roomId })` — idempotent (DELETE no-op for missing rows).
- `mode.list` returns only modes that have at least one `automationModeTargets` row.
  Modes with zero connections are invisible on canvas — this is an existing constraint,
  not introduced by this plan.

**Data available from existing queries:**
- `room.list` returns `{ id, name, siteId, deviceCount }[]` — sufficient for room nodes.
- `device.overview` returns rooms with device arrays — kept for `RoomModal`.
- `mode.list` returns `{ id, name, targets: { roomId, roomName, targetOn }[] }[]`.

## What We're NOT Doing

- Device nodes or device column — removed in Phase 2 (out of scope per user decision).
- Node position persistence — no schema change, out of scope.
- Settings → Automations editor — untouched.
- Modes with zero connections becoming visible — requires a separate `mode.listAll`
  procedure; out of scope.
- Undo — toast confirmation is sufficient per shape-notes decision.

## Key Discoveries & Gotchas

**Edge ID conflict** — the current edge ID `e-mode-${modeId}-room` assumes one room.
In the all-rooms layout there can be N edges per mode. New format: `e-mode-${modeId}-room-${roomId}`.
Every place that constructs or queries this ID must be updated: `handleDetach`, `handleConnect`, `computedEdges`.

**ModeNode handle must become always-connectable** — currently `isConnectable={!connected}`
hides the drag-to-connect handle when a mode has any connection. In the all-rooms view every
visible mode has at least one connection (by `mode.list` constraint), so this would hide ALL
handles. Change to `isConnectable={true}`; duplicate prevention is handled by `handleConnect`'s
existing `edgesRef.current.some(e => e.id === edgeId)` guard.

**nodeTypes/edgeTypes must remain outside component** — existing pattern at module scope; maintain.

**computedNodes sync pattern** — nodes are synced to `useNodesState` via `useEffect([computedNodes,
viewedRoomId, setNodes])`. The `viewedRoomId` dep exists to force-reset positions on room switch.
In Phase 2 this dep is removed (no viewed room). The effect becomes `useEffect([computedNodes, setNodes])`,
merging positions from existing node state into the re-computed base.

**`addTargets` idempotency (app-level filter)** — SELECT existing connections for the modeId+roomIds
pair, filter to only unconnected, INSERT the remainder. Returns `{ added: N }`. `removeTargets` is
already idempotent at DB level (DELETE with no rows = no error).

**`selectionOnDrag` + `panOnDrag` conflict** — `selectionOnDrag={true}` enables left-drag lasso,
which overrides left-drag pan. Resolve with `panOnDrag={[1, 2]}` (middle + right mouse button pan).

**RoomModal kept, DeviceModal removed** — `RoomModal` needs `devices: DeviceItem[]`. Keep
`overviewQuery` to supply device arrays per room. Build `devicesByRoomId` map; pass correct
devices when a room node is clicked.

## Implementation Approach

Three sequential phases. Each is independently testable.

---

## Phase 1: tRPC — addTargets + removeTargets

**File: `src/server/api/routers/mode.ts`**

Add two new procedures. Place `addTargets` immediately after `addTarget` (line 352) and
`removeTargets` immediately after `removeTarget` (line 376).

### addTargets

```typescript
addTargets: protectedProcedure
  .input(
    z.object({
      modeId: z.string(),
      roomIds: z.array(z.string()).min(1).max(20),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const [existingMode] = await ctx.db
      .select({ id: automationModes.id })
      .from(automationModes)
      .where(eq(automationModes.id, input.modeId));
    if (!existingMode) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Mode not found" });
    }

    // Validates all rooms exist and belong to the same site.
    await validateTargetsSameSite(ctx.db, input.roomIds);

    // Idempotency: only insert rooms not already connected.
    const existing = await ctx.db
      .select({ roomId: automationModeTargets.roomId })
      .from(automationModeTargets)
      .where(
        and(
          eq(automationModeTargets.modeId, input.modeId),
          inArray(automationModeTargets.roomId, input.roomIds),
        ),
      );
    const existingSet = new Set(existing.map((r) => r.roomId));
    const toInsert = input.roomIds.filter((id) => !existingSet.has(id));

    if (toInsert.length === 0) return { added: 0 as const };

    await ctx.db.insert(automationModeTargets).values(
      toInsert.map((roomId) => ({
        modeId: input.modeId,
        roomId,
        targetOn: true,
      })),
    );

    return { added: toInsert.length };
  }),
```

### removeTargets

```typescript
removeTargets: protectedProcedure
  .input(
    z.object({
      modeId: z.string(),
      roomIds: z.array(z.string()).min(1).max(20),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select({ id: automationModes.id })
      .from(automationModes)
      .where(eq(automationModes.id, input.modeId));
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Mode not found" });
    }

    await ctx.db
      .delete(automationModeTargets)
      .where(
        and(
          eq(automationModeTargets.modeId, input.modeId),
          inArray(automationModeTargets.roomId, input.roomIds),
        ),
      );

    return { success: true as const };
  }),
```

**Verify `inArray` is already imported** — it is (line 2 of mode.ts).

### Phase 1 test gate

- `addTargets` with already-connected roomIds → returns `{ added: 0 }`, no DB error.
- `addTargets` with mix of new + existing → inserts only new ones.
- `removeTargets` with non-existent roomIds → returns `{ success: true }`, no error.
- Both procedures reject unknown `modeId` with `NOT_FOUND`.

---

## Phase 2: Canvas Redesign — All Rooms, No Devices, No Room Selector

This phase removes the single-room constraint. After this phase the canvas shows
all mode→room connection topology. Single drag-to-connect and click-to-detach
continue to work.

### 2a. Layout utility

**File: `src/lib/automation-flow-layout.ts`**

Change `AutomationFlowLayout` and `computeAutomationFlowLayout`:

```typescript
export interface AutomationFlowLayout {
  modes: Point[];
  rooms: Point[];   // was: room: Point; devices: Point[]
}

export function computeAutomationFlowLayout(
  modeCount: number,
  roomCount: number,    // was: deviceCount
): AutomationFlowLayout {
  return {
    modes: centeredColumn(MODE_X, modeCount),
    rooms: centeredColumn(ROOM_X, roomCount),   // was: single room + device column
  };
}
```

Remove `DEVICE_X = 680` constant (unused after this change).

### 2b. Canvas component

**File: `src/app/_components/automation-flow/tuya-automation-flow.tsx`**

#### Remove

- `viewedRoomId` state and its `useEffect` initializer.
- `prevRoomIdRef`, `viewedRoomIdRef` (were needed for room-change detection).
- `viewedRoom` derived value.
- `sortedRooms` useMemo.
- `modesForRoom` useMemo (was for a single room).
- Room selector `<Select>` in JSX.
- Device nodes from `computedNodes`.
- Device edges from `computedEdges`.
- `DeviceModal` and `selectedDevice` / `setSelectedDevice` state.
- `isRoomModalOpen` state — replace with `modalRoomId` (see below).
- Import: `DeviceModal`, `DeviceFlowNode`, `DeviceNode` (and their types).
- `DeviceNode` from `nodeTypes` const.

#### Add

```typescript
// Tracks which room's modal is open (null = closed)
const [modalRoomId, setModalRoomId] = useState<string | null>(null);

// Flat map of roomId → devices for RoomModal
const devicesByRoomId = useMemo(() => {
  const map = new Map<string, DeviceItem[]>();
  for (const room of overviewQuery.data?.rooms ?? []) {
    map.set(room.roomId, room.devices);
  }
  return map;
}, [overviewQuery.data]);
```

#### Change: allModesForCanvas

Replace the `getAllModesForCanvas(viewedRoomId ?? "", ...)` call with a direct map
that doesn't require a room context:

```typescript
const allModesForCanvas = useMemo(
  () =>
    (modeListQuery.data ?? []).map((mode) => ({
      id: mode.id,
      name: mode.name,
      daysOfWeek: mode.daysOfWeek,
      fireHour: mode.fireHour,
      fireMinute: mode.fireMinute,
      isConnected: mode.targets.length > 0,
      targetOn: null as boolean | null,
    })),
  [modeListQuery.data],
);
```

Remove the `getAllModesForCanvas` import if it's no longer used elsewhere in this file.

#### Change: layout computation

```typescript
const layout = useMemo(
  () =>
    computeAutomationFlowLayout(
      allModesForCanvas.length,
      (roomsListQuery.data ?? []).length,   // was: viewedRoom?.devices.length ?? 0
    ),
  [allModesForCanvas.length, roomsListQuery.data],
);
```

#### Change: computedNodes

```typescript
const computedNodes = useMemo<AutomationFlowNode[]>(() => {
  const modeNodes: ModeFlowNode[] = allModesForCanvas.map((mode, i) => ({
    data: { mode },
    id: `mode-${mode.id}`,
    position: layout.modes[i] ?? { x: 0, y: 0 },
    type: "mode" as const,
  }));
  const roomNodes: RoomFlowNode[] = (roomsListQuery.data ?? []).map(
    (room, i) => ({
      data: { roomName: room.name, deviceCount: room.deviceCount },
      id: `room-${room.id}`,
      position: layout.rooms[i] ?? { x: 0, y: 0 },
      type: "room" as const,
    }),
  );
  return [...modeNodes, ...roomNodes];
}, [allModesForCanvas, roomsListQuery.data, layout]);
```

`AutomationFlowNode` type alias: remove `DeviceFlowNode` from the union.

#### Change: computedEdges

Replace the single-room edge computation with all-connection edges:

```typescript
const computedEdges = useMemo<Edge[]>(() => {
  return (modeListQuery.data ?? []).flatMap((mode) =>
    mode.targets.map((target) => ({
      animated: true,
      data: {
        onDelete: () => handleDetach(mode.id, target.roomId),
      },
      id: `e-mode-${mode.id}-room-${target.roomId}`,
      label: `${mode.name} → ${target.roomName}`,
      markerEnd: AUTOMATION_EDGE_MARKER,
      source: `mode-${mode.id}`,
      style: AUTOMATION_EDGE_STYLE,
      target: `room-${target.roomId}`,
      type: "modeEdge",
    })),
  );
}, [modeListQuery.data, handleDetach]);
```

#### Change: handleDetach edge ID

```typescript
// Old: const edgeId = `e-mode-${modeId}-room`;
const edgeId = `e-mode-${modeId}-room-${roomId}`;
```

Also remove `snapshotRoomId` / `viewedRoomIdRef.current` guard from the error handler
(no longer relevant — there's no viewed room to switch away from).

#### Change: handleConnect edge ID

```typescript
// Old: const edgeId = `e-mode-${modeId}-room`;
const edgeId = `e-mode-${modeId}-room-${roomId}`;
```

Also: `handleConnect` currently validates `connection.target !== \`room-${viewedRoom.roomId}\``.
Replace with: check that `connection.target?.startsWith("room-")` (any room node is valid).

```typescript
const handleConnect = useCallback(
  (connection: Connection) => {
    if (!connection.source?.startsWith("mode-")) return;
    if (!connection.target?.startsWith("room-")) return;

    const modeId = connection.source.slice("mode-".length);
    const roomId = connection.target.slice("room-".length);
    const edgeId = `e-mode-${modeId}-room-${roomId}`;

    if (edgesRef.current.some((e) => e.id === edgeId)) return;

    const modeName =
      allModesForCanvas.find((m) => m.id === modeId)?.name ?? modeId;
    const roomName =
      (roomsListQuery.data ?? []).find((r) => r.id === roomId)?.name ?? roomId;

    setEdges((current) =>
      addEdge(
        {
          animated: true,
          data: { onDelete: () => handleDetach(modeId, roomId) },
          id: edgeId,
          label: `${modeName} → ${roomName}`,
          markerEnd: AUTOMATION_EDGE_MARKER,
          source: connection.source,
          style: AUTOMATION_EDGE_STYLE,
          target: connection.target,
          type: "modeEdge",
        },
        current,
      ),
    );

    addTarget(
      { modeId, roomId },
      {
        onSuccess: () => void utils.mode.list.invalidate(),
        onError: (error) => {
          if (
            "data" in error &&
            (error as { data?: { code?: string } }).data?.code === "CONFLICT"
          )
            return;
          setEdges((current) => current.filter((e) => e.id !== edgeId));
          toast.error("Couldn't connect mode to room — try again");
        },
      },
    );
  },
  [allModesForCanvas, roomsListQuery.data, addTarget, handleDetach, setEdges, utils],
);
```

Remove `viewedRoom` from deps (no longer needed).

#### Change: nodes sync useEffect

```typescript
// Old: useEffect(() => { const roomChanged = ...; prevRoomIdRef.current = ...; setNodes(...) }, [computedNodes, viewedRoomId, setNodes]);
useEffect(() => {
  setNodes((current) => {
    const byId = new Map(current.map((n) => [n.id, n]));
    return computedNodes.map((next) => {
      const existing = byId.get(next.id);
      return existing ? { ...next, position: existing.position } : next;
    });
  });
}, [computedNodes, setNodes]);
```

Remove `roomChanged` logic entirely — no room switching means no forced position reset.

#### Change: onNodeClick

```typescript
const onNodeClick = useCallback<NodeMouseHandler<AutomationFlowNode>>(
  (_event, node) => {
    if (node.type === "room") {
      setModalRoomId(node.id.slice("room-".length));
      return;
    }
    if (node.type === "mode") {
      router.push("/setup");
    }
    // device type removed
  },
  [router],
);
```

#### Change: JSX

Replace room-selector + canvas container with:

```tsx
<div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
  <ReactFlow
    deleteKeyCode={null}
    edges={edges}
    edgeTypes={edgeTypes}
    fitView
    fitViewOptions={{ padding: 0.3 }}
    nodes={nodes}
    nodeTypes={nodeTypes}
    onConnect={handleConnect}
    onEdgesChange={onEdgesChange}
    onNodeClick={onNodeClick}
    onNodesChange={onNodesChange}
    proOptions={{ hideAttribution: true }}
  >
    <Background color="#e2e2e2" gap={28} size={1} />
    <Controls showInteractive={false} />
  </ReactFlow>
</div>
```

Remove the outer `flex flex-col gap-3` wrapper (no dropdown above the canvas).

Replace `DeviceModal` with `RoomModal` lookup:

```tsx
{modalRoomId && (() => {
  const room = (roomsListQuery.data ?? []).find((r) => r.id === modalRoomId);
  if (!room) return null;
  return (
    <RoomModal
      devices={devicesByRoomId.get(modalRoomId) ?? []}
      modesForRoom={getModesForRoom(modalRoomId, modeListQuery.data ?? [])}
      onClose={() => setModalRoomId(null)}
      roomId={modalRoomId}
      roomName={room.name}
    />
  );
})()}
```

#### Change: loading / empty state

Replace `overviewQuery.isLoading` with `roomsListQuery.isLoading || modeListQuery.isLoading`
for the Skeleton guard.

Replace `overviewQuery.error` with `roomsListQuery.error` for the error guard.

Replace `sortedRooms.length === 0` empty state with `(roomsListQuery.data ?? []).length === 0`.

### 2c. ModeNode handle

**File: `src/app/_components/automation-flow/mode-node.tsx`**

Change the source handle from `isConnectable={!connected}` to `isConnectable={true}`
(remove the conditional). The handle is always visible; duplicate-edge prevention is
handled by `handleConnect`'s `edgesRef.current.some(...)` guard in the canvas.

### Phase 2 test gate

- Canvas renders all rooms and all mode→room edges (no device column, no dropdown).
- Drag-to-connect from mode handle to any room node → edge appears, `addTarget` fires.
- Click-to-detach (select edge + × button) → edge removed, `removeTarget` fires.
- Clicking a room node opens `RoomModal` for that room.
- Clicking a mode node navigates to `/setup`.

---

## Phase 3: Bulk-Connect Interactions + Toolbar

### 3a. ModeCanvasData — isActive flag

**File: `src/lib/mode-targeting.ts`**

Add optional `isActive` to `ModeCanvasData`:

```typescript
export interface ModeCanvasData {
  id: string;
  name: string;
  daysOfWeek: number[] | null;
  fireHour: number | null;
  fireMinute: number | null;
  isConnected: boolean;
  targetOn: boolean | null;
  isActive?: boolean;   // add this line
}
```

### 3b. ModeNode — active visual

**File: `src/app/_components/automation-flow/mode-node.tsx`**

Destructure `isActive` from `data.mode` and apply a highlight ring:

```tsx
const { mode } = data;
const { isActive } = mode;

// In the outer wrapper className, add ring when active:
// e.g. add: isActive ? "ring-2 ring-blue-500" : ""
// Merge with existing selected ring logic.
```

Use a distinct color (e.g. `ring-blue-500`) that doesn't conflict with the neutral
`ring-1 ring-neutral-300` used for `selected`.

### 3c. Canvas — activeMode state + interaction handlers

**File: `src/app/_components/automation-flow/tuya-automation-flow.tsx`**

#### New state and types

```typescript
type ActiveMode = { modeId: string; modeName: string } | null;

const [activeMode, setActiveMode] = useState<ActiveMode>(null);
const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
```

#### onNodeDoubleClick

```typescript
const onNodeDoubleClick = useCallback<NodeMouseHandler<AutomationFlowNode>>(
  (_event, node) => {
    if (node.type !== "mode") return;
    const modeId = node.data.mode.id;
    const modeName = node.data.mode.name;
    setActiveMode((current) =>
      current?.modeId === modeId ? null : { modeId, modeName },
    );
  },
  [],
);
```

#### onPaneClick

```typescript
const onPaneClick = useCallback(() => {
  setActiveMode(null);
  setSelectedRoomIds([]);
}, []);
```

#### ESC handler

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setActiveMode(null);
      setSelectedRoomIds([]);
    }
  };
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, []);
```

#### onSelectionChange

```typescript
const onSelectionChange = useCallback(
  ({ nodes }: { nodes: AutomationFlowNode[] }) => {
    const rooms = nodes
      .filter((n) => n.type === "room")
      .map((n) => n.id.slice("room-".length));
    setSelectedRoomIds(rooms);
  },
  [],
);
```

Import `OnSelectionChangeParams` type from `@xyflow/react` if needed, or use inline type.

#### computedNodes — inject isActive

```typescript
const computedNodes = useMemo<AutomationFlowNode[]>(() => {
  const modeNodes: ModeFlowNode[] = allModesForCanvas.map((mode, i) => ({
    data: { mode: { ...mode, isActive: mode.id === activeMode?.modeId } },
    id: `mode-${mode.id}`,
    position: layout.modes[i] ?? { x: 0, y: 0 },
    type: "mode" as const,
  }));
  // ...rooms unchanged...
}, [allModesForCanvas, roomsListQuery.data, layout, activeMode?.modeId]);
```

#### Toolbar logic

```typescript
const activeModeData = useMemo(
  () => modeListQuery.data?.find((m) => m.id === activeMode?.modeId),
  [modeListQuery.data, activeMode?.modeId],
);

const connectedRoomIds = useMemo(
  () => new Set((activeModeData?.targets ?? []).map((t) => t.roomId)),
  [activeModeData],
);

const toConnect = selectedRoomIds.filter((id) => !connectedRoomIds.has(id));
const toDisconnect = selectedRoomIds.filter((id) => connectedRoomIds.has(id));
```

#### addTargets + removeTargets mutations

```typescript
const { mutate: addTargets, isPending: isAddingTargets } =
  api.mode.addTargets.useMutation({
    onSuccess: (data) => {
      void utils.mode.list.invalidate();
      if (data.added > 0) {
        toast.success(`Connected ${data.added} room${data.added === 1 ? "" : "s"}`);
      }
    },
    onError: () => toast.error("Couldn't connect rooms — try again"),
  });

const { mutate: removeTargets, isPending: isRemovingTargets } =
  api.mode.removeTargets.useMutation({
    onSuccess: () => {
      void utils.mode.list.invalidate();
      if (toDisconnect.length > 0) {
        toast.success(
          `Disconnected ${toDisconnect.length} room${toDisconnect.length === 1 ? "" : "s"}`,
        );
      }
    },
    onError: () => toast.error("Couldn't disconnect rooms — try again"),
  });
```

Note: `toDisconnect` is captured in the `onSuccess` closure; snapshot it before the call
to avoid stale closure issues:

```typescript
const handleBulkDisconnect = useCallback(() => {
  if (!activeMode || toDisconnect.length === 0) return;
  const snapshot = [...toDisconnect];
  removeTargets(
    { modeId: activeMode.modeId, roomIds: snapshot },
    {
      onSuccess: () => {
        void utils.mode.list.invalidate();
        toast.success(
          `Disconnected ${snapshot.length} room${snapshot.length === 1 ? "" : "s"}`,
        );
      },
    },
  );
}, [activeMode, toDisconnect, removeTargets, utils]);
```

Do the same for `handleBulkConnect`.

#### ReactFlow props — add new event handlers and multi-select config

```tsx
<ReactFlow
  deleteKeyCode={null}
  edges={edges}
  edgeTypes={edgeTypes}
  fitView
  fitViewOptions={{ padding: 0.3 }}
  multiSelectionKeyCode="Shift"
  nodes={nodes}
  nodeTypes={nodeTypes}
  onConnect={handleConnect}
  onEdgesChange={onEdgesChange}
  onNodeClick={onNodeClick}
  onNodeDoubleClick={onNodeDoubleClick}
  onNodesChange={onNodesChange}
  onPaneClick={onPaneClick}
  onSelectionChange={onSelectionChange}
  panOnDrag={[1, 2]}
  proOptions={{ hideAttribution: true }}
  selectionOnDrag={true}
>
```

`panOnDrag={[1, 2]}` — middle and right mouse button pan; left drag = lasso selection.

### 3d. BulkConnectToolbar component

**File: `src/app/_components/automation-flow/bulk-connect-toolbar.tsx`** (new)

```tsx
"use client";

interface BulkConnectToolbarProps {
  activeModeName: string;
  toConnect: number;
  toDisconnect: number;
  onConnect: () => void;
  onDisconnect: () => void;
  isPending: boolean;
}

export function BulkConnectToolbar({
  activeModeName,
  toConnect,
  toDisconnect,
  onConnect,
  onDisconnect,
  isPending,
}: BulkConnectToolbarProps) {
  if (toConnect === 0 && toDisconnect === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-neutral-500 text-xs">
        {activeModeName}
      </span>
      {toConnect > 0 && (
        <button
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-white text-xs font-medium disabled:opacity-50"
          disabled={isPending}
          onClick={onConnect}
        >
          Connect {toConnect}
        </button>
      )}
      {toDisconnect > 0 && (
        <button
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-neutral-700 text-xs font-medium disabled:opacity-50"
          disabled={isPending}
          onClick={onDisconnect}
        >
          Disconnect {toDisconnect}
        </button>
      )}
    </div>
  );
}
```

### 3e. Wire toolbar into canvas

In the ReactFlow container div (already `relative` from Phase 2):

```tsx
<div className="relative h-[560px] w-full overflow-hidden rounded-2xl ...">
  {activeMode && (
    <BulkConnectToolbar
      activeModeName={activeMode.modeName}
      isPending={isAddingTargets || isRemovingTargets}
      onConnect={handleBulkConnect}
      onDisconnect={handleBulkDisconnect}
      toConnect={toConnect.length}
      toDisconnect={toDisconnect.length}
    />
  )}
  <ReactFlow ...>
    ...
  </ReactFlow>
</div>
```

Toolbar is shown whenever `activeMode` is set, even before rooms are selected —
but `BulkConnectToolbar` internally returns `null` when both counts are 0.
So `activeMode !== null` is the correct outer guard.

### Phase 3 test gate

- Double-click mode node → mode node gets blue ring, toolbar header shows mode name.
- Shift-click room nodes → "Connect N" / "Disconnect M" counts update correctly.
- Lasso-select room nodes → same.
- "Connect N" click → edges appear on canvas (after invalidate), toast "Connected N rooms".
- "Disconnect M" click → edges disappear, toast "Disconnected M rooms".
- "Connect N" again on same rooms → `{ added: 0 }` response, no toast (guard: `data.added > 0`).
- ESC → mode deactivated, toolbar disappears, selection cleared.
- Click empty canvas → same as ESC.
- Double-click same mode again → toggles mode off (deactivates).
- Single click on mode → still navigates to `/setup`.

---

## Files Modified / Created

| File | Change |
|---|---|
| `src/server/api/routers/mode.ts` | Add `addTargets`, `removeTargets` procedures |
| `src/lib/automation-flow-layout.ts` | Replace `room + devices` layout with `rooms[]`; change signature |
| `src/lib/mode-targeting.ts` | Add `isActive?: boolean` to `ModeCanvasData` |
| `src/app/_components/automation-flow/tuya-automation-flow.tsx` | Major refactor: all-rooms layout, double-click, multi-select, bulk mutations |
| `src/app/_components/automation-flow/mode-node.tsx` | `isActive` visual; `isConnectable={true}` |
| `src/app/_components/automation-flow/bulk-connect-toolbar.tsx` | New component |

---

## Testing Strategy

1. **Phase 1**: Hit `addTargets` via tRPC panel or test — verify idempotency (add twice = no error).
   Hit `removeTargets` with non-existent roomIds — verify no error.

2. **Phase 2**: Load `/automation-flow` — all rooms visible without dropdown. Verify all
   existing mode→room edges render. Drag-connect and detach still work. Room click → modal.

3. **Phase 3** (golden path — PRD Primary success criteria):
   Open `/automation-flow` → double-click "Night Mode" → shift-click 3 unconnected room nodes
   → "Connect 3" appears → click → 3 edges appear, toast "Connected 3 rooms".
   Click "Connect 3" again on same rooms → no change, no error.

4. **Phase 3** (PRD Secondary — mixed selection):
   Select 2 connected + 3 unconnected rooms → toolbar shows "Connect 3" + "Disconnect 2"
   simultaneously → click "Disconnect 2" → 2 edges removed, "Disconnected 2 rooms" toast.
