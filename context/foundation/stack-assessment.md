---
project: tuya-device-dashboard
assessed_at: 2026-06-26T00:00:00Z
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript
  framework: Next.js 15 (App Router) + tRPC v11
  build_tool: Next.js CLI (Turbopack dev)
  test_runner: Vitest
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: null
gates_passed: 16
gates_failed: 0
---

## Stack Components

**Language — TypeScript.** `tsconfig.json` declares `"strict": true` (plus
`"noUncheckedIndexedAccess": true`) — used end-to-end across server (tRPC
routers, Drizzle schema), client (React components), and the background
polling worker.

**Framework — Next.js 15, App Router + tRPC v11.** Detected via
`next.config.js` and the `src/app/` directory structure. tRPC provides the
typed API layer (`@trpc/server`, `@trpc/client`, `@trpc/react-query`),
alongside Drizzle ORM (`^0.45.2`) + libsql/SQLite for persistence, NextAuth
v5 (beta) for auth, Tailwind CSS v4 + shadcn/ui + Base UI for styling, and
Biome for combined lint/format. `package.json`'s `ct3aMetadata` confirms
this was scaffolded from `create-t3-app` (the "T3 stack").

**Build tool — Next.js's own build pipeline.** `next dev --turbo` for
development, `next build` / `next start` for production.

**Test runner — Vitest.** `npm run test` wired in `package.json`; configured
with `globalSetup` (DB migration) and `setupFiles` (TUYA_STUB env). An
integration test suite for tRPC routers and unit tests for server-lib
functions already exist.

**Package manager — npm.** `package-lock.json` present; `"packageManager":
"npm@11.13.0"` pinned.

**CI/CD — GitHub Actions.** `.github/workflows/ci.yml` runs: Biome check,
`tsc --noEmit`, `vitest run`, `next build`.

**Deployment target — not detected.** LAN-only device; no cloud platform
config in the repo.

**Instruction files — `CLAUDE.md` and `AGENTS.md` both present and
actively maintained.** `AGENTS.md` already carries living compensation
entries for device control (tuyapi), auth (NextAuth v5 beta), and file
uploads — kept current, not left to rot.

**Key library in scope for this change — @xyflow/react 12.x (React Flow).**
Already in the dependency tree (`"@xyflow/react": "^12.11.1"`). The editable
automation flow change uses React Flow's `onConnect` callback (edge creation),
`onEdgesDelete` / edge click handling (edge removal), and custom node
rendering with connection handles. No new dependency install needed; the
library is ready to be wired interactively.

## Quality Gate Assessment

| Component              | Typed | Convention | Training Data | Documented | Verdict        |
|------------------------|-------|------------|---------------|------------|----------------|
| Language (TS)          |  ✓    |     —      |       —       |     —      | pass           |
| Framework (Next.js)    |  —    |     ✓      |       ✓       |     ✓      | pass           |
| API layer (tRPC)       |  ✓    |     ✓      |       ✓       |     ✓      | pass           |
| ORM (Drizzle)          |  ✓    |     ✓      |       ~       |     ✓      | pass-with-note |
| Test runner (Vitest)   |  —    |     —      |       ✓       |     ✓      | pass           |
| Auth (NextAuth v5 β)   |  ✓    |     ✓      |       ~       |     ~      | pass-with-note |
| Flow chart (React Flow)|  ✓    |     ✓      |       ✓       |     ✓      | pass           |

Legend: ✓ = pass, ~ = partial, — = not applicable

### Gate Details

**Typed — pass.** `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess":
true`. TypeScript end-to-end, including `@xyflow/react` which ships full TS
types for nodes, edges, and callback signatures.

**Convention-based (framework) — pass.** Next.js App Router: file-based
routing (`src/app/`); tRPC: typed procedures under `src/server/api/routers/`.
React Flow follows its own documented conventions — `ReactFlowProvider`,
`onConnect` callback for edge creation, `NodeTypes`/`EdgeTypes` maps for
custom rendering. All documented at reactflow.dev.

**Training data (framework) — pass.** Next.js App Router + React are dominant
in the JS/TS training corpus; tRPC T3-stack patterns are widely covered.

**Training data (ORM — Drizzle) — partial, pass.** Drizzle is newer than
Prisma; training coverage is good but the `.select().from().where()` chain
differs from Prisma's object-query style. An agent may conflate the two.
The Drizzle query pattern is already used consistently in the codebase, which
provides sufficient in-context examples for agents to pattern-match from.

**Training data (React Flow) — pass.** React Flow is a well-represented
library in the JS training corpus. The `v12 (@xyflow/react)` package rename
(from `reactflow`) is a known surface where training data may use the old
import path — flagged in the compensation section below.

**Training data (test runner) — pass.** Vitest is the standard modern test
runner for Vite/Next-adjacent TS projects.

**Documented (all) — pass.** nextjs.org (versioned), trpc.io, orm.drizzle.team,
reactflow.dev (comprehensive: custom nodes, handles, edge events), vitest.dev
— all current and version-specific.

**Auth (NextAuth v5 beta) — pass-with-note.** Already compensated in `AGENTS.md`
(`## Auth (NextAuth v5 beta)` section warns against applying v4 or stable-v5
patterns). Not touched by the current change.

## Gaps & Compensation

No gate failures. Two partial-credit rows each have existing or lightweight
compensation:

### Drizzle query pattern (already compensated in-context)

The codebase consistently uses Drizzle's `.select().from().where()` chain across
all existing routers. An agent entering this codebase will see the pattern in the
first file it reads and replicate it. No explicit AGENTS.md addition is required,
but it is worth keeping existing router files as reference examples.

### React Flow v12 import path (@xyflow/react)

The library was renamed from `reactflow` to `@xyflow/react` in v11+. Training
data before mid-2024 uses the old import. An agent may generate:

```ts
import ReactFlow from 'reactflow';         // ← old / wrong
```

when the correct import for v12 is:

```ts
import { ReactFlow } from '@xyflow/react'; // ← correct
```

### Recommended Instruction File Addition

Add to `AGENTS.md` under a new `## Flow chart (@xyflow/react)` section:

```markdown
## Flow chart (@xyflow/react)

The installed package is `@xyflow/react` (v12), NOT the old `reactflow` package.
Always use:

  import { ReactFlow, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
  import '@xyflow/react/dist/style.css';

Never import from `reactflow` — it is not installed.

Key API for the editable automation flow:
- `onConnect: (connection) => void` — fired when the user draws a new edge;
  call the tRPC mutation to create an automationModeTargets row here.
- `onEdgesDelete: (edges) => void` — fired when an edge is deleted (click +
  delete key, or backspace); call the tRPC mutation to delete the row here.
- Custom nodes: register in `nodeTypes` (object defined OUTSIDE the component
  to avoid re-renders). Source handles use `<Handle type="source" />`;
  target handles use `<Handle type="target" />`.
- The `ReactFlowProvider` wrapper is required when calling hooks like
  `useReactFlow()` outside the `<ReactFlow>` component itself.
```

## Summary

**Overall verdict: ready.** Every core component — TypeScript (strict), Next.js
15 App Router + tRPC, Vitest, and the Next.js build pipeline — passes all four
criteria cleanly. React Flow (@xyflow/react) is already installed and scores pass
on all applicable gates.

**Key strengths:** strict typing end-to-end; App Router conventions remove "where
does this go?" ambiguity; CI gates lint, types, tests, and build on every push;
`AGENTS.md` is actively maintained with working compensation entries; React Flow
is already in the dep tree, so the editable flow chart feature has zero new
installs needed.

**Key gap to document:** the `@xyflow/react` import path (v12 rename). One
AGENTS.md addition (above) is all that's needed before implementation — it
prevents the most likely agent mistake (wrong import path) and documents the
four event callbacks relevant to this change.

**Recommended next step:** `/10x-health-check` — to audit dependency health,
test-suite coverage, and CI/CD coverage before implementing the editable
automation flow.
