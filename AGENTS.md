# Repository Guidelines

Tuya Device Dashboard — a Next.js 15 (App Router) + tRPC v11 + Drizzle ORM (libsql/SQLite) facility-management app for monitoring and controlling Tuya climate devices.

## Hard rules

- Run `npm run ci` (Biome check, `tsc --noEmit`, `vitest run`, `next build`) before considering any change done — it's the exact gate `.github/workflows/ci.yml` runs on every push/PR.
- Work proceeds through `context/changes/<slug>/plan.md` files (see `@CLAUDE.md`); update the relevant plan's phase checkboxes as part of the same commit that implements the phase, don't leave them stale.
- Never write to `context/archive/` — archived changes are immutable; open a new change folder instead.

## Project Structure & Module Organization

- `src/app/` — Next.js App Router pages; `src/app/_components/` holds page-level React components (kebab-case files; a `cc-` prefix marks command-center-redesign components).
- `src/server/api/routers/` — tRPC routers, one file per domain (`room.ts`, `device.ts`, ...), aggregated in `src/server/api/root.ts`. Router tests live alongside as `<name>.test.ts`.
- `src/server/db/` — Drizzle schema (`schema.ts`) and seed scripts; `src/server/lib/` — domain logic (e.g. scoring, weather, Tuya device source); `src/server/workers/` — background pollers.
- `src/components/ui/` — shadcn/ui primitives (see `@components.json`); `src/trpc/` — client/server tRPC wiring; `drizzle/` — generated migrations.
- Path alias `~/*` resolves to `src/*` (`@tsconfig.json`).

## Build, Test, and Development Commands

- `npm run dev` — start the dev server (Turbopack).
- `npm run check` / `npm run check:write` — Biome lint+format check / autofix.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run test` / `npm run test:watch` — Vitest run / watch.
- `npm run db:generate` / `db:push` / `db:studio` — Drizzle schema workflow.

## Coding Style & Naming Conventions

- TypeScript strict mode (`@tsconfig.json`); Biome (`@biome.jsonc`) is the sole linter/formatter — no ESLint/Prettier.
- Component and module files are kebab-case; exports follow standard React/TS casing (PascalCase components, camelCase functions).

## Testing Guidelines

- Vitest, `environment: "node"` (`@vitest.config.ts`). Tests sit next to the file they cover (`room.ts` → `room.test.ts`).
- Run a single file: `npx vitest run src/server/api/routers/room.test.ts`.

## Commit & Pull Request Guidelines

- Observed convention: `type(scope): description (pN)` — e.g. `feat(dashboard-command-center-redesign): KPI row (p2)`. `scope` matches a `context/changes/<scope>/` folder; `pN` is that plan's phase number. `chore(scope): close out plan (epilogue)` closes a change.
- CI must pass (`npm run ci`) before merge.

## Device control (tuyapi)

Tuya device control goes through `tuyapi`, talking to devices over the LAN
via Tuya's DP (data point) protocol — not a cloud API. DP codes are
device-model-specific; don't assume a DP code from one device type applies
to another. When touching device-control or automation/scheduling code
(setpoint, valve state, the mode engine), check the existing DP mappings in
the codebase before introducing new ones.

## Auth (NextAuth v5 beta)

This project pins `next-auth@5.0.0-beta.31`. Do not "upgrade" auth patterns
to match NextAuth v4 or stable-v5 examples seen elsewhere — this beta's API
differs from both. Check the installed version's actual exports before
assuming a NextAuth pattern from training data applies here.

## File uploads

There is no existing upload/storage pattern in this codebase as of the
floor-plan (digital-twin) feature — it's the first to need one. Before
adding a new dependency for this, check whether a simple local-filesystem
or existing-infra approach covers the MVP's basic file-type/size validation
need; don't reach for a hosted storage service unless the requirement
genuinely needs it.

## Flow chart (@xyflow/react)

The installed package is `@xyflow/react` (v12), NOT the old `reactflow` package.
Always use:

```ts
import { ReactFlow, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
```

Never import from `reactflow` — it is not installed.

Key API for the editable automation flow:
- `onConnect: (connection) => void` — fired when the user draws a new edge;
  call the tRPC mutation to create an `automationModeTargets` row here.
- `onEdgesDelete: (edges) => void` — fired when an edge is deleted (click +
  delete key, or backspace); call the tRPC mutation to delete the row here.
- Custom nodes: register in `nodeTypes` (object defined OUTSIDE the component
  to avoid re-renders). Source handles use `<Handle type="source" />`;
  target handles use `<Handle type="target" />`.
- The `ReactFlowProvider` wrapper is required when calling hooks like
  `useReactFlow()` outside the `<ReactFlow>` component itself.

## Security & Configuration Tips

- Copy `@.env.example` to `.env`; never commit `.env` (already gitignored).
