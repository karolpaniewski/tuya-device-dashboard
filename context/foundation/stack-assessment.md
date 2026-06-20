---
project: tuya-device-dashboard
assessed_at: 2026-06-20T13:05:26Z
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript
  framework: Next.js 15 (App Router)
  build_tool: Next.js CLI (Turbopack dev)
  test_runner: Vitest
  package_manager: npm
  ci_provider: GitHub Actions
  deployment_target: null
gates_passed: 9
gates_failed: 0
---

## Stack Components

**Language — TypeScript.** `tsconfig.json` has `"strict": true` plus `"noUncheckedIndexedAccess": true` and `"checkJs": true` — stricter than the TypeScript default, end-to-end across the codebase (no `allowJs`-only escape hatch in practice; `checkJs` keeps even the rare `.js` file checked).

**Framework — Next.js 15, App Router.** Detected via `next.config.js` and the `src/app/` directory structure. Used alongside tRPC v11 for the typed API layer (`@trpc/server`, `@trpc/client`, `@trpc/react-query`), Drizzle ORM + libsql/SQLite for persistence, NextAuth v5 (beta) for auth, Tailwind CSS v4 + shadcn/ui for styling, and Biome for combined lint/format (replacing ESLint/Prettier).

**Build tool — Next.js's own build pipeline.** `next dev --turbo` for development, `next build` / `next start` for production (`package.json` scripts). No separate bundler config (no standalone Vite/webpack config) — build tooling is inherited from the framework.

**Test runner — Vitest.** `vitest.config.ts` present; `npm run test` / `npm run test:watch` wired in `package.json`. Existing router test files (e.g. `room.test.ts`, `device.test.ts`) and worker tests (`tuya-poller.test.ts`) confirm it's actively used, not just configured.

**Package manager — npm.** `package-lock.json` present; `package.json` pins `"packageManager": "npm@11.13.0"`.

**CI/CD — GitHub Actions.** `.github/workflows/ci.yml` runs the same gate as the local `npm run ci` script: Biome check, `tsc --noEmit`, `vitest run`, `next build`.

**Deployment target — not detected.** No `Dockerfile`, `vercel.json`, `fly.toml`, or equivalent platform config in the repo. Likely deployed manually or via a platform-default flow (e.g. connecting the repo directly to a host) that doesn't require an in-repo config file.

**Instruction files — `CLAUDE.md` present** at both the parent directory and project root, carrying 10xDevs-toolkit workflow guidance and (for this project) E2E-testing rules. Neither currently documents stack-specific conventions beyond what's described below.

## Quality Gate Assessment

| Component   | Typed | Convention | Training Data | Documented | Verdict |
|-------------|-------|------------|----------------|------------|---------|
| Language    | ✓     | —          | —              | —          | pass    |
| Framework   | —     | ✓          | ✓              | ✓          | pass    |
| Build tool  | —     | ✓          | ✓              | ✓          | pass    |
| Test runner | —     | —          | ✓              | ✓          | pass    |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Typed — pass.** `tsconfig.json` declares `"strict": true`. TypeScript is used end-to-end: server (tRPC routers, Drizzle schema), client (React components), and the background worker. No untyped JS escape hatches in the application code.

**Convention-based (framework) — pass.** Next.js App Router is file-based routing by definition (`src/app/`); route, layout, and API-handler placement is dictated by the framework, not invented per-project. tRPC layers a typed-procedure convention on top (routers under `src/server/api/routers/`, aggregated in `src/server/api/root.ts`).

**Convention-based (build tool) — pass.** The build pipeline is Next.js's own (`next build`/`next dev`); there's no ad hoc bundler configuration to reverse-engineer.

**Training data (framework) — pass.** Next.js App Router is a mainstream choice within the JS/TS ecosystem with a large training corpus; tRPC is widely used in the same "T3-stack" niche this project's `package.json` `ct3aMetadata` confirms it was scaffolded from (`create-t3-app`).

**Training data (build tool) — pass.** Same reasoning — Next.js's build tooling is the framework's own, equally well-represented.

**Training data (test runner) — pass.** Vitest is the standard modern test runner for Vite/Next-adjacent TS projects, with broad adoption and a corpus comparable to Jest's for newer code.

**Documented (framework) — pass.** Next.js ships current, versioned official docs with App Router examples matching the installed major version (15).

**Documented (build tool) — pass.** Build-tool docs are the same Next.js docs; no separate documentation surface to assess.

**Documented (test runner) — pass.** Vitest's official docs are current and versioned, matching the installed major version (4).

## Gaps & Compensation

No gate failures were found — every detected component (language, framework, build tool, test runner) passes all applicable criteria. There is no compensation path to document.

Two minor, non-gate observations worth flagging for awareness (not failures):

- **NextAuth v5 is still in beta** (`"next-auth": "^5.0.0-beta.31"`). This doesn't fail the "well-documented" gate (the beta docs are current and versioned), but beta APIs can shift between minor versions — worth pinning exactly rather than floating on `^` if stability matters more than picking up fixes automatically.
- **No deployment target config in-repo.** This isn't a quality-gate criterion, but if `/10x-health-check` or a future change touches deployment, there's no `Dockerfile`/`vercel.json`/etc. to anchor on — the deployment process currently lives outside the repo.

### Recommended Instruction File Additions

None required — the stack passes all four criteria with no gaps to compensate for. The existing `CLAUDE.md` files can stay as-is for stack-friendliness purposes; their current content (10xDevs workflow chain, E2E-testing rules) is unrelated to this assessment.

## Summary

**Overall verdict: ready.** Every detected stack component — TypeScript (strict), Next.js 15 App Router, Vitest, and the Next.js build pipeline — passes all four agent-friendly criteria with no gaps. The surrounding stack (tRPC, Drizzle ORM, Tailwind v4, shadcn/ui, Biome) reinforces this: typed end-to-end, convention-heavy, mainstream within the TS ecosystem, and well-documented.

**Key strengths:** strict typing end-to-end with no untyped escape hatches; App Router's file-based conventions remove a whole class of "where does this go?" ambiguity; an existing CI pipeline (`npm run ci`) already gates lint, types, tests, and build on every push, which directly supports agent-driven changes being verified before merge.

**Key gaps:** none at the quality-gate level. The two minor observations above (NextAuth beta versioning, no in-repo deployment config) are worth tracking but don't require instruction-file compensation.

**Recommended next step:** `/10x-health-check` — to audit dependency health (e.g. the NextAuth beta dependency, `shadcn` package versioning), test-suite coverage, and CI/CD coverage now that the stack itself is confirmed agent-friendly.
