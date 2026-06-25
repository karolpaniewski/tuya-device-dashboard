---
project: tuya-device-dashboard
assessed_at: 2026-06-25T10:25:23Z
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
gates_passed: 12
gates_failed: 0
---

## Stack Components

**Language — TypeScript.** `tsconfig.json` declares `"strict": true`
(plus `"noUncheckedIndexedAccess": true`, `"checkJs": true`) — used
end-to-end across server (tRPC routers, Drizzle schema), client (React
components), and the background polling worker.

**Framework — Next.js 15, App Router + tRPC v11.** Detected via
`next.config.js` and the `src/app/` directory structure. tRPC provides
the typed API layer (`@trpc/server`, `@trpc/client`,
`@trpc/react-query`), alongside Drizzle ORM (`^0.45.2`) + libsql/SQLite
for persistence, NextAuth v5 (beta) for auth, Tailwind CSS v4 +
shadcn/ui + Base UI for styling and dialog/popover primitives, Framer
Motion (`^12.41.0`) for animated transitions, and Biome for combined
lint/format. `package.json`'s `ct3aMetadata` confirms this was
scaffolded from `create-t3-app` (the "T3 stack").

**Build tool — Next.js's own build pipeline.** `next dev --turbo` for
development, `next build` / `next start` for production. No separate
bundler config to reverse-engineer.

**Test runner — Vitest.** `npm run test` / `npm run test:watch` wired in
`package.json`; an established suite of router tests, pure-function
tests, and component tests already exists across server and client code.

**Package manager — npm.** `package-lock.json` present; `package.json`
pins `"packageManager": "npm@11.13.0"`.

**CI/CD — GitHub Actions.** `.github/workflows/ci.yml` runs the same
gate as the local `npm run ci` script: Biome check, `tsc --noEmit`,
`vitest run`, `next build`.

**Deployment target — not detected.** No `Dockerfile`, `vercel.json`,
`fly.toml`, or equivalent platform config in the repo. Not relevant to
the current change in scope — it introduces no new outbound network
dependency or deployment requirement.

**Instruction files — `CLAUDE.md` and `AGENTS.md` both present and
actively maintained.** `AGENTS.md` documents project structure, build/
test commands, coding style, and already carries working compensation
entries (`## Device control (tuyapi)`, `## Auth (NextAuth v5 beta)`,
`## File uploads`) from prior features — living compensation that's been
kept current rather than left to rot.

**Relevant to the current change's scope** (`prd-v9.md` — surfacing
existing automation-mode targeting on the device card and a room-card
expanded view, read-only, normal click-to-expand): no new library is
needed. The change reuses existing tRPC query patterns, existing UI
primitives (cards, badges, links), and existing room/device/mode
relationship data — there is no drag/gesture or animation requirement
this time (the open-gesture decision in shaping was explicitly "normal
click-to-expand," not drag-based), so the animation/gesture-library gap
flagged in the prior assessment (now resolved — Framer Motion is
installed, used by the shipped thermostat-dial card→modal transition)
isn't a factor here.

## Quality Gate Assessment

| Component   | Typed | Convention | Training Data | Documented | Verdict |
|-------------|-------|------------|----------------|------------|---------|
| Language    | ✓     | —          | —              | —          | pass    |
| Framework   | —     | ✓          | ✓              | ✓          | pass    |
| Build tool  | —     | ✓          | ✓              | ✓          | pass    |
| Test runner | —     | —          | ✓              | ✓          | pass    |
| Auth (NextAuth v5 beta) | ✓ | ✓ | ~ | ~ | pass-with-note |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Typed — pass.** `tsconfig.json` declares `"strict": true`. TypeScript
is used end-to-end across the codebase, including the new read-path
queries this change will add.

**Convention-based (framework) — pass.** Next.js App Router is
file-based routing by definition (`src/app/`); tRPC layers a
typed-procedure convention on top (routers under
`src/server/api/routers/`, aggregated in `src/server/api/root.ts`) —
documented explicitly in `AGENTS.md`. The new automation-visibility
queries this change adds (device → targeting mode(s); room → its
devices) fit directly into this existing router convention.

**Convention-based (build tool) — pass.** The build pipeline is Next.js's
own (`next build`/`next dev`); no ad hoc bundler configuration to
reverse-engineer.

**Training data (framework) — pass.** Next.js App Router is a mainstream
choice within the JS/TS ecosystem; tRPC is widely used in the same
"T3-stack" niche this project's `ct3aMetadata` confirms it was scaffolded
from.

**Training data (build tool) — pass.** Same reasoning — Next.js's build
tooling is the framework's own, equally well-represented.

**Training data (test runner) — pass.** Vitest is the standard modern
test runner for Vite/Next-adjacent TS projects, with a corpus comparable
to Jest's for current code.

**Documented (framework) — pass.** Next.js ships current, versioned
official docs matching the installed major version (15).

**Documented (build tool) — pass.** Same Next.js docs; no separate
documentation surface.

**Documented (test runner) — pass.** Vitest's official docs are current
and versioned, matching the installed major version.

**Auth (NextAuth v5 beta) — pass-with-note.** Typed and convention-based:
pass (TS-native, providers/callbacks/route-handler conventions are
followed consistently in `src/server/auth.ts`). Training data and
documentation: partial — `5.0.0-beta.31` means the agent's training data
mixes stable-v4 and beta/stable-v5 patterns that don't all apply to this
exact pinned version. **Already compensated**: `AGENTS.md`'s
`## Auth (NextAuth v5 beta)` section explicitly warns against applying v4
or stable-v5 patterns from training data. Not touched by the current
change — `prd-v9.md`'s `## Access Control Changes` states no changes.

## Gaps & Compensation

No gate failures were found in the core matrix (language, framework,
build tool, test runner). The one partial-credit row (NextAuth v5 beta)
already has compensation in place in `AGENTS.md` — confirmed present,
not just recommended.

No new compensation is required for the current change's scope
(`prd-v9.md`): it adds read-only tRPC queries and UI rendering using
patterns and primitives already established and already documented in
`AGENTS.md`. No new dependency, no new convention to document.

### Recommended Instruction File Additions

None required for this change.

## Summary

**Overall verdict: ready.** Every core stack component — TypeScript
(strict), Next.js 15 App Router + tRPC, Vitest, and the Next.js build
pipeline — passes all four agent-friendly criteria cleanly. The one
partial-credit item (NextAuth v5 beta's training-data/docs mismatch) has
working, confirmed compensation in `AGENTS.md`, and isn't touched by this
change anyway.

**Key strengths:** strict typing end-to-end; App Router's file-based
conventions remove a whole class of "where does this go?" ambiguity; an
existing CI pipeline already gates lint, types, tests, and build on every
push; `AGENTS.md` is actively maintained with real, working compensation
entries rather than a one-time scaffold; the current change's scope
(read-only data surfacing on existing card UI) maps directly onto
existing router and component conventions with zero new dependencies.

**Key gaps:** none. This is a low-risk change from a stack-readiness
perspective — no new library, no new architectural pattern, no
compensation gap to document before implementation.

**Recommended next step:** `/10x-health-check` — to audit dependency
health, test-suite coverage, and CI/CD coverage before implementing this
change.
