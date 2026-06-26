# Editable Automation Flow — Implementation Plan

## Overview

The automation flow chart is currently a read-only visualization. This plan adds
drag-to-connect (attach a room to a mode) and click-to-detach (remove a mode→room
connection) interactions. All site modes are shown as nodes; edges represent live
`automationModeTargets` rows. Changes are applied optimistically and confirmed by
the server.

## Current State Analysis

The flow chart (`src/app/_components/automation-flow/tuya-automation-flow.tsx`) shows
one room at a time via a room selector. Mode nodes currently come from `getModesForRoom`,
which filters to modes **already targeting** the selected room — meaning unconnected
modes are invisible and cannot be drag-attached. Edges are static, computed from the
same filtered list, and there are no `onConnect`, `onEdgesDelete`, or edge-click handlers.

The `ModeNode` already has a `<Handle type="source" position={Position.Right}>` and
`RoomNode` already has a `<Handle type="target" position={Position.Left}>` — the
React Flow connection infrastructure is in place.

The `mode.update` tRPC procedure does full target replacement (delete-all + re-insert),
making it unsuitable for atomic single-edge mutations. No dedicated `addTarget` or
`removeTarget` procedures exist.

## Desired End State

- All automation modes for the active site appear in the left column of the flow
  chart (connected = animated edge, unconnected = floating node with a faded visual).
- A user can drag from any mode node's right handle to the room node to attach that
  room to the mode; the edge and the `automationModeTargets` row appear immediately.
- A user can click a mode→room edge to select it; the selected edge reveals a × button;
  clicking × detaches the room from the mode.
- Detached connections and new connections are reflected in Settings → Automations
  without a page reload (shared tRPC cache).
- If a mutation fails, the UI reverts to its pre-action state and shows a toast.

### Key Discoveries

- `RoomNode` already has `<Handle type="target" position={Position.Left}>` — no
  change needed to accept connections (`room-node.tsx:22-26`).
- `ModeNode` already has `<Handle type="source" position={Position.Right}>` — drag
  source already wired (`mode-node.tsx:36-40`).
- `ModeTargetingRoom.targetOn: boolean` is non-optional; the data type must be
  extended to represent unconnected modes (where `targetOn` is undefined for this room).
- The `automationModeTargets` table has a unique constraint on `(modeId, roomId)`;
  `addTarget` must not attempt a duplicate insert.
- The `computedEdges` effect always re-syncs from server data (`setEdges(computedEdges)`),
  so optimistic edges are either confirmed (on successful mutation + invalidate) or
  reverted (on mutation error) without additional cleanup.

## What We're NOT Doing

- Device-level targeting — modes target rooms, not individual valves. `targetOn` for
  a new connection defaults to `true` (open valve); changing it requires the Setup editor.
- Redesigning the Setup → Automations mode editor — it remains the surface for name,
  schedule, and fine-grained `targetOn` control.
- Node position persistence (FR-003) — flagged as a separate additive phase (schema
  change required); not part of this plan.
- Multi-room canvas — the room selector stays; only one room is shown at a time.

## Implementation Approach

Three sequential phases: (1) add atomic tRPC mutations at the API layer; (2) expand
the canvas to show all modes; (3) wire drag-to-connect and click-to-detach with
optimistic updates. Each phase is independently shippable and has its own test gate.

## Critical Implementation Details

**nodeTypes and edgeTypes must be defined OUTSIDE the component.** React Flow
re-renders all nodes/edges if `nodeTypes` or `edgeTypes` change reference on every
render. The existing `nodeTypes` constant is already declared at module scope in
`tuya-automation-flow.tsx:42-46`; the new `edgeTypes` must follow the same pattern.

**Edge data carries `onDelete` callback.** The custom mode edge component is
presentation-only — it renders the edge and fires `data.onDelete()` when the ×
is clicked. The parent provides this callback, keeping mutation logic in one place
(the canvas component) rather than spread across the edge component.

---

## Phase 1: tRPC Layer — addTarget + removeTarget

### Overview

Add two atomic procedures to `src/server/api/routers/mode.ts` that operate on a
single `(modeId, roomId)` pair. These are the only mutations the canvas will call.

### Changes Required

#### 1. mode.addTarget procedure

**File**: `src/server/api/routers/mode.ts`

**Intent**: Add a procedure that inserts one `automationModeTarget` row with
`targetOn: true`. This is the server-side counterpart of a drag-to-connect action.

**Contract**: Input `z.object({ modeId: z.string(), roomId: z.string() })`. Validates
that the mode exists (throws `TRPCError NOT_FOUND` if absent). Inserts
`{ id: uuid, modeId, roomId, targetOn: true }`. Returns `{ success: true }`. The
unique constraint on `(modeId, roomId)` surfaces as a CONFLICT error if the pair
already exists — let it propagate as-is (the optimistic-update path in the UI
prevents reaching this state under normal use).

#### 2. mode.removeTarget procedure

**File**: `src/server/api/routers/mode.ts`

**Intent**: Add a procedure that deletes the `automationModeTarget` row matching
`(modeId, roomId)`. Server-side counterpart of the × detach action.

**Contract**: Input `z.object({ modeId: z.string(), roomId: z.string() })`. Deletes
the row where `modeId = input.modeId AND roomId = input.roomId`. Returns
`{ success: true }`. If no row matches (already deleted), returns `{ success: true }`
without error — idempotent by design.

#### 3. Tests — addTarget and removeTarget

**File**: `src/server/api/routers/mode.test.ts`

**Intent**: Add unit tests for both new procedures. Follow the existing test patterns
(mock db, caller setup already in this file).

**Contract**: Tests to cover:
- `addTarget` happy path: row is inserted, `success: true` returned
- `addTarget` invalid modeId: `NOT_FOUND` thrown
- `addTarget` duplicate (modeId, roomId): error propagates (do not suppress)
- `removeTarget` happy path: row is deleted, `success: true` returned
- `removeTarget` non-existent pair: `success: true` (idempotent)

### Success Criteria

#### Automated Verification

- Type check passes: `npx tsc --noEmit`
- Lint passes: `npx biome check src/server/api/routers/mode.ts src/server/api/routers/mode.test.ts`
- New test cases pass: `npm run test -- mode.test`
- Full test suite still passes: `npm run test`

#### Manual Verification

- None needed at this phase — API-only change with no UI surface yet.

---

## Phase 2: Canvas Scope — Show All Modes

### Overview

Expand what the canvas shows: instead of only modes already targeting the selected
room, render ALL site modes as nodes. Connected modes keep their animated edge;
unconnected modes appear as floating nodes with a visual hint that they can be
drag-connected.

### Changes Required

#### 1. getAllModesForCanvas helper

**File**: `src/lib/mode-targeting.ts`

**Intent**: Add a function that produces one canvas-ready record per mode,
regardless of whether the mode targets the current room. The `ModeNode` needs
to know both whether the mode is connected and what the `targetOn` value is
(for the badge color).

**Contract**: Export `getAllModesForCanvas(roomId: string, modes: Mode[]): ModeCanvasData[]`
where `ModeCanvasData` is:

```ts
export interface ModeCanvasData {
  id: string;
  name: string;
  daysOfWeek: number[] | null;
  fireHour: number | null;
  fireMinute: number | null;
  isConnected: boolean;    // true if a target row exists for this roomId
  targetOn: boolean | null; // null when isConnected is false
}
```

The function iterates all modes, finds the target for `roomId` if any, and returns
a `ModeCanvasData` for each mode.

#### 2. ModeFlowNode type and ModeNode component

**File**: `src/app/_components/automation-flow/mode-node.tsx`

**Intent**: Update the node type and component to consume `ModeCanvasData` instead
of `ModeTargetingRoom`. Unconnected modes should look visually distinct (faded
border, no ON/OFF badge, a subtle "drag to connect" tooltip on hover).

**Contract**: Change `ModeFlowNode` data to `{ mode: ModeCanvasData }`. In the
component:
- Connected (`mode.isConnected === true`): unchanged visual — name, ON/OFF badge,
  schedule text.
- Unconnected (`mode.isConnected === false`): name shown in `text-neutral-400`,
  border `border-dashed border-neutral-200`, no ON/OFF badge, schedule text still
  shown. Add `title="Drag to connect"` on the root div for a native tooltip.

#### 3. Canvas node computation update

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx`

**Intent**: Replace `modesForRoom` (filtered) with `allModesForCanvas` (all modes)
as the source for mode nodes. Edge computation remains unchanged — edges still come
from the room-targeted subset.

**Contract**: Add `const allModesForCanvas = useMemo(() => getAllModesForCanvas(viewedRoomId ?? "", modeListQuery.data ?? []), [viewedRoomId, modeListQuery.data])`.
Change `computedNodes` to use `allModesForCanvas` for the mode nodes array.
Change `computeAutomationFlowLayout` call to use `allModesForCanvas.length` as
`modeCount`. Keep `computedEdges` using `modesForRoom` (no change to edge data).

#### 4. edgeTypes registration

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx`

**Intent**: Register the custom mode edge type (from Phase 3) in a module-scope
`edgeTypes` constant so React Flow doesn't recreate it on every render.

**Contract**: Add `const edgeTypes = { modeEdge: ModeEdge }` at module scope,
alongside the existing `nodeTypes` constant. Import `ModeEdge` from the new
`mode-edge.tsx` file (created in Phase 3). Pass `edgeTypes={edgeTypes}` to
`<ReactFlow>`.

### Success Criteria

#### Automated Verification

- Type check passes: `npx tsc --noEmit`
- Lint passes: `npx biome check src/app/_components/automation-flow/ src/lib/mode-targeting.ts`
- Existing tests still pass: `npm run test`

#### Manual Verification

- Navigate to the automation flow page. The left column now shows ALL modes in
  the site, not just those targeting the selected room.
- Connected modes appear with the animated edge, colored name, and ON/OFF badge.
- Unconnected modes appear with dashed border, faded name, no badge, and a "drag to
  connect" native tooltip on hover.
- Switching rooms updates which modes show as connected vs unconnected.
- Existing interactions (room selector, device modal on device-node click, room
  modal on room-node click) still work.

---

## Phase 3: Edge Interactions — Connect + Detach

### Overview

Wire drag-to-connect (`onConnect`) and click-to-detach (custom edge with × button),
both with optimistic updates backed by the Phase 1 tRPC mutations.

### Changes Required

#### 1. Custom mode edge component

**File**: `src/app/_components/automation-flow/mode-edge.tsx` (new file)

**Intent**: Render mode→room edges with the existing visual style, plus a × delete
button that appears only when the edge is selected. Clicking × calls `data.onDelete()`.

**Contract**: Export `ModeEdge` using React Flow's `EdgeProps` type. Render a
`<BaseEdge>` (or `getSmoothStepPath` equivalent) with `style={AUTOMATION_EDGE_STYLE}`.
Render the existing animated edge label (mode name). When `props.selected === true`,
render a small button positioned at the edge midpoint:
`<button onClick={(e) => { e.stopPropagation(); data.onDelete(); }}` styled as a
12×12 neutral circle with an `X` icon (or `×` character). The edge `data` type is
`{ onDelete: () => void }`.

#### 2. computedEdges — switch to modeEdge type + onDelete

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx`

**Intent**: Update mode→room edge objects to use `type: "modeEdge"` and include
`data.onDelete` so the custom edge component can trigger detachment.

**Contract**: In `computedEdges`, change each mode edge to:
- `type: "modeEdge"` (instead of `"smoothstep"`)
- `data: { onDelete: handleDetach(mode.id, viewedRoom.roomId) }`

`handleDetach` is a `useCallback` defined in the canvas component (see item 4 below).
Keep all other edge properties unchanged (id, source, target, animated, label, style, marker).

#### 3. onConnect handler

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx`

**Intent**: When the user drops an edge from a mode node onto the room node,
validate the connection direction, apply an optimistic edge, and call `addTarget`.

**Contract**: `const handleConnect = useCallback((connection: Connection) => {...}, [...])`.

Validation: `source` must match `mode-${id}` pattern and `target` must match
`room-${id}`. Reject other combinations silently (no toast — user accidentally
connected to a device node).

Optimistic: immediately call `setEdges(edges => addEdge({...newEdge, type: "modeEdge", data: {...}}, edges))`. Extract `modeId` from `connection.source` by stripping the `"mode-"` prefix.

Mutation: call `addTargetMutation.mutate({ modeId, roomId: viewedRoom.roomId })`.

On success: `utils.mode.list.invalidate()` to sync the server state.

On error: revert — remove the optimistically added edge from `edges` state by
filtering it out by id; show a toast: `"Couldn't connect mode to room — try again"`.

Pass `handleConnect` as `onConnect` prop to `<ReactFlow>`.

#### 4. handleDetach callback

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx`

**Intent**: Optimistically remove a mode→room edge and call `removeTarget`. Used
by the custom edge's × button via `data.onDelete`.

**Contract**: `const handleDetach = useCallback((modeId: string, roomId: string) => {...}, [...])`.

Optimistic: remove the edge whose id is `e-mode-${modeId}-room` from `edges` state.

Mutation: call `removeTargetMutation.mutate({ modeId, roomId })`.

On success: `utils.mode.list.invalidate()`.

On error: revert — re-add the removed edge to `edges` state (must retain a local
reference to the removed edge before removing it); show toast: `"Couldn't detach room — try again"`.

#### 5. Mutation setup

**File**: `src/app/_components/automation-flow/tuya-automation-flow.tsx`

**Intent**: Instantiate the two new tRPC mutations in the canvas component.

**Contract**: Add near the top of `TuyaAutomationFlowCanvas`:

```ts
const addTargetMutation = api.mode.addTarget.useMutation();
const removeTargetMutation = api.mode.removeTarget.useMutation();
```

Both use default error handling (errors surfaced via the callbacks in items 3 and 4;
no global `onError` on the mutation itself).

#### 6. AGENTS.md — @xyflow/react section

**File**: `AGENTS.md`

**Intent**: Add the compensation entry identified in the stack assessment to prevent
agents from using the old `reactflow` import path.

**Contract**: Append the `## Flow chart (@xyflow/react)` section documented in
`context/foundation/stack-assessment.md` (Recommended Instruction File Addition).

### Success Criteria

#### Automated Verification

- Type check passes: `npx tsc --noEmit`
- Lint passes: `npx biome check src/app/_components/automation-flow/`
- Full test suite still passes: `npm run test`
- Build succeeds: `npm run build`

#### Manual Verification

- **Drag to connect**: drag from a floating (unconnected) mode node's right handle
  to the room node. The edge appears immediately. Navigating to Settings → Automations
  shows the room now listed as a target of that mode.
- **Detach**: click a connected mode→room edge. The edge gains a selected border.
  A × button appears on the edge. Click × — the edge disappears immediately. Settings
  confirms the room is no longer a target.
- **No accidental detach on plain click**: clicking a mode node still opens Setup;
  clicking a device node still opens the device modal. Edge clicks select but do not
  auto-delete.
- **Error revert**: (simulate by temporarily breaking the API) mutation failure reverts
  the edge to its pre-action state and shows a toast.
- **30s refetch coexistence**: leave the page open for 30s+ while the polling fires;
  confirm that edge state is not disrupted by the background refetch.
- **Room switch**: switch rooms; confirm that connected/unconnected state updates
  correctly for the new room.

---

## Testing Strategy

### Unit Tests

- `mode.addTarget` — happy path, invalid modeId, duplicate pair (Phase 1, mode.test.ts)
- `mode.removeTarget` — happy path, non-existent pair (Phase 1, mode.test.ts)
- `getAllModesForCanvas` — returns all modes, correct `isConnected`/`targetOn` for
  connected and unconnected modes, empty list returns empty (Phase 2, mode-targeting.test.ts
  or alongside automation-flow-layout.test.ts)

### Integration Tests

No new integration tests required — the Phase 1 procedures are simple enough that
unit tests with the mock database pattern already in `mode.test.ts` are sufficient.
The existing `mode.integration.test.ts` covers the trigger path which is unchanged.

### Manual Testing Steps

1. Open the automation flow page with at least one mode that does NOT target the
   selected room. Confirm it appears as a floating (dashed, faded) node.
2. Drag from the unconnected mode's right handle to the room node. Confirm:
   - Edge appears immediately with animation.
   - Settings → Automations (without reload) shows the room in the mode's target list.
3. Click the newly created edge. Confirm a × button appears on the edge.
4. Click × . Confirm:
   - Edge disappears immediately.
   - Settings confirms the room is removed.
5. Switch to a different room in the selector. Confirm the mode nodes update their
   connected/unconnected state correctly.
6. Trigger a manual mode to confirm `mode.trigger` is unaffected.

## References

- PRD: `context/foundation/prd.md`
- Stack assessment: `context/foundation/stack-assessment.md`
- Health check: `context/foundation/health-check.md`
- Existing canvas: `src/app/_components/automation-flow/tuya-automation-flow.tsx`
- Mode router: `src/server/api/routers/mode.ts`
- Mode targeting lib: `src/lib/mode-targeting.ts`
- Schema: `src/server/db/schema.ts` (automationModeTargets: lines 324–346)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: tRPC Layer — addTarget + removeTarget

#### Automated

- [x] 1.1 Type check passes: `npx tsc --noEmit` — cd904e5
- [x] 1.2 Lint passes on mode.ts and mode.test.ts — cd904e5
- [x] 1.3 New test cases pass: `npm run test -- mode.test` — cd904e5
- [x] 1.4 Full test suite still passes: `npm run test` — cd904e5

### Phase 2: Canvas Scope — Show All Modes

#### Automated

- [x] 2.1 Type check passes: `npx tsc --noEmit`
- [x] 2.2 Lint passes on automation-flow components and mode-targeting.ts
- [x] 2.3 Existing tests still pass: `npm run test`

#### Manual

- [x] 2.4 All site modes appear in left column (connected + unconnected visual states)
- [x] 2.5 Room selector updates connected/unconnected state correctly
- [x] 2.6 Existing interactions (device modal, room modal, Setup navigation) unaffected

### Phase 3: Edge Interactions — Connect + Detach

#### Automated

- [ ] 3.1 Type check passes: `npx tsc --noEmit`
- [ ] 3.2 Lint passes on automation-flow components
- [ ] 3.3 Full test suite still passes: `npm run test`
- [ ] 3.4 Build succeeds: `npm run build`

#### Manual

- [ ] 3.5 Drag from floating mode node to room node — edge appears immediately
- [ ] 3.6 Settings → Automations reflects the new connection without reload
- [ ] 3.7 Click edge → × button appears → click × → edge removed immediately
- [ ] 3.8 Settings confirms detach without reload
- [ ] 3.9 No accidental detach on plain edge click (only × button triggers removal)
- [ ] 3.10 Mutation failure reverts edge + shows toast
- [ ] 3.11 30s background refetch does not disrupt edge state
