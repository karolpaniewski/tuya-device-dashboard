# Editable Automation Flow — Plan Brief

> Full plan: `context/changes/editable-automation-flow/plan.md`

## What & Why

The automation flow chart is a read-only visualization. Editing mode→room connections
requires leaving the chart, navigating to Settings → Automations, opening the mode
form, and saving — then coming back. This plan makes the chart itself the editor:
drag to attach a room to a mode; click the edge's × button to detach. No new
schema, no new page.

## Starting Point

The flow chart (`tuya-automation-flow.tsx`) shows one room at a time with a selector.
Mode nodes are filtered to only modes already targeting the selected room, so
unconnected modes are invisible — making drag-to-attach impossible without first
changing what the canvas shows. `ModeNode` and `RoomNode` already have connection
handles; no new API procedures exist for single-target mutations.

## Desired End State

All automation modes for the site appear as nodes in the left column. Connected
modes have an animated edge to the room node; unconnected modes float with a dashed
border and a "drag to connect" tooltip. Dragging a mode's handle to the room node
attaches it (edge appears instantly, DB write follows). Clicking an existing edge
selects it; a × button appears; clicking × detaches it instantly. Both surfaces
(flow chart and Setup editor) reflect changes without a page reload.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Canvas scope | All modes shown (connected + unconnected) | FR-001 drag-to-attach needs unconnected modes to be visible | Plan |
| targetOn default | `true` (open valve) | Most common automation intent; Setup editor lets users change it | Plan |
| Edge detach UX | Click to select → × button → click to remove | Two-step prevents accidental deletion without a blocking modal | Plan (Open Q1 from PRD) |
| API strategy | New `mode.addTarget` / `mode.removeTarget` procedures | Atomic operations; avoids race conditions from full-list replacement | Plan |
| Error handling | Optimistic update → revert on error + toast | Satisfies "edge feels instant" NFR; errors are rare on LAN | Plan |
| Multi-room scope | Single room view preserved | Full-site graph is out of scope for the must-have 3-week budget | PRD |

## Scope

**In scope:**
- `mode.addTarget` and `mode.removeTarget` tRPC procedures (atomic, single-row)
- Canvas shows all site modes (not just connected ones)
- `ModeNode` updated for connected vs unconnected visual states
- Custom `ModeEdge` component with × detach button on selected edges
- Optimistic add/remove with revert-on-error + toast
- AGENTS.md `## Flow chart (@xyflow/react)` compensation entry (prerequisite)

**Out of scope:**
- Node position persistence (FR-003) — separate additive phase, schema change required
- Device-level targeting — modes target rooms
- Setup editor changes — it stays as-is
- Multi-room canvas layout

## Architecture / Approach

Three phases build on each other cleanly. Phase 1 adds the API surface (two tRPC
procedures). Phase 2 expands the canvas data model (new `getAllModesForCanvas` helper,
updated `ModeNode` type) without touching interaction. Phase 3 wires `onConnect`,
the custom `ModeEdge`, and `handleDetach` — each backed by the Phase 1 mutations
with optimistic updates. The existing 30s polling + position-merge pattern is preserved;
the `setEdges(computedEdges)` effect naturally confirms or reverts optimistic edges
when the server query syncs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. tRPC Layer | `mode.addTarget` + `mode.removeTarget` with tests | None significant — isolated server change |
| 2. Canvas Scope | All modes as nodes; visual connected/unconnected states | More nodes may feel crowded in sites with many modes |
| 3. Edge Interactions | Drag-to-connect + click-to-detach with optimistic updates | Optimistic/revert logic; 30s refetch coexistence |

**Prerequisites:** AGENTS.md `## Flow chart (@xyflow/react)` section must be added
before implementation (see `context/foundation/health-check.md` Fix #1, `context/foundation/stack-assessment.md`).

**Estimated effort:** ~2–3 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- Sites with many modes (10+) will show a long left column; layout hasn't been
  validated at scale. `computeAutomationFlowLayout` may need vertical spacing tuning.
- The `onConnect` callback must guard against connecting a mode node to a device node
  (React Flow calls `onConnect` for any valid source→target handle pair; we validate
  the target is the room node and silently ignore others).
- React Query's `invalidate` after mutation will trigger a `mode.list` refetch, which
  recomputes `modesForRoom` and then `computedEdges`, which calls `setEdges`. This
  should correctly replace the optimistic edge with the server-confirmed one — but
  if the refetch races with a concurrent edge operation, the last-write-wins on the
  edge state.

## Success Criteria (Summary)

- Dragging a mode node's handle to the room node attaches the room; Settings reflects
  it without reload.
- Clicking a mode→room edge and then its × button detaches the room; Settings reflects
  it without reload.
- All 216+ existing tests continue to pass; no regression in device modal, room modal,
  or Setup → Automations.
