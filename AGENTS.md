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

## Security & Configuration Tips

- Copy `@.env.example` to `.env`; never commit `.env` (already gitignored).
