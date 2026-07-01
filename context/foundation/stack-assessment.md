---
project: "Tuya Device Dashboard"
assessed_at: 2026-07-01T11:18:46Z
agent_readiness: ready-with-compensation
context_type: brownfield
stack_components:
  language: TypeScript
  framework: "Next.js 15 (App Router) + tRPC v11 + Drizzle ORM"
  build_tool: "Next.js build + Biome + tsc"
  test_runner: Vitest
  package_manager: npm
  ci_provider: "GitHub Actions"
  deployment_target: null
gates_passed: 7
gates_failed: 1
---

## Stack Components

**Language:** TypeScript, strict mode enabled (`tsconfig.json`, `"strict": true`).

**Framework:** Next.js 15 (App Router), with tRPC v11 as the API layer and
Drizzle ORM + libsql (SQLite) for persistence. NextAuth v5 (beta) handles
auth. This is the current-system stack the comfort-compliance-ranking
feature (PRD `prd-v12.md`) builds on — it adds a new read-only dashboard
panel and a derived-data computation, with no new framework or data-layer
dependency.

**Build tool:** `next build` for the application build; Biome
(`@biomejs/biome`) for linting and formatting (`biome check .`); `tsc
--noEmit` for typechecking. A single `ci` script chains all three plus
tests (`biome check . && tsc --noEmit && vitest run && next build`).

**Test runner:** Vitest (`vitest.config.ts`, `test`/`test:watch` scripts).

**Package manager:** npm (`package-lock.json`, `packageManager:
"npm@11.13.0"` pinned in `package.json`).

**CI/CD:** GitHub Actions (`.github/workflows/ci.yml`).

**Deployment target:** not detected — no `Dockerfile`, `vercel.json`, or
similar. Consistent with the PRD's LAN-only, single-machine deployment
model (manual `git pull && npm run build && npm start`).

**Instruction files present:** `CLAUDE.md`, `AGENTS.md` — both already
carry project-specific conventions (Drizzle patterns, NextAuth v5 usage,
Zod v3 pin), reducing reliance on this assessment for baseline steering.

## Quality Gate Assessment

| Component                          | Typed | Convention | Training Data | Documented | Verdict          |
| ----------------------------------- | ----- | ---------- | -------------- | ---------- | ---------------- |
| Language (TypeScript)               | ✓     | —          | —              | —          | pass              |
| Framework (Next.js + tRPC + Drizzle)| —     | ✓          | ✓              | ✓          | pass              |
| Build tool (Biome + tsc)            | —     | —          | ~              | ✓          | pass-with-note    |
| Test runner (Vitest)                | —     | —          | ✓              | ✓          | pass              |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Typed — pass.** `tsconfig.json` declares `"strict": true`; the codebase is
TypeScript end-to-end (API layer via tRPC infers types from server to
client with no manual DTOs). This is the strongest case of the "Typed"
criterion — an agent can reason about input/output shapes directly from
source without running the program.

**Convention-based — pass.** Next.js App Router enforces file-based routing
and a fixed project layout (`src/app/`); tRPC enforces a router/procedure
registration pattern; Drizzle enforces a single schema file
(`src/server/db/schema.ts`) as the source of truth for tables. All three
layers ship strong, discoverable conventions rather than requiring the
project to invent its own.

**Popular in training data — pass** (framework), **partial** (build tool).
Next.js, tRPC, and Drizzle are all mainstream, well-represented choices
within the TypeScript/full-stack ecosystem (the "T3-stack" combination is
itself a widely-documented pattern). Biome, however, is a comparatively
newer tool (public release 2023) relative to the long-established
ESLint + Prettier pairing; an agent's training data skews toward
ESLint/Prettier idioms and may default to suggesting them unless steered.
This is the one identified gap — see Compensation below.

**Well-documented — pass.** Next.js, tRPC, and Drizzle all maintain
current, versioned official docs. Biome's docs (biomejs.dev) are also
current and versioned, so despite the training-data partial, this specific
criterion still passes for the build tool.

## Gaps & Compensation

**Gap: Biome's lower training-data representation vs. ESLint/Prettier.**
An agent working in this repo may default to suggesting `.eslintrc`
configuration, `eslint-disable` comments, or Prettier-specific formatting
flags — none of which apply here. This doesn't block agent work (Biome's
CLI surface is small and the docs are good), but it's worth naming
explicitly so the agent doesn't waste a cycle guessing the wrong tool.

### Recommended Instruction File Additions

Add to `CLAUDE.md` (or `AGENTS.md`):

```markdown
## Linting & formatting: Biome, not ESLint/Prettier

This project uses Biome (`@biomejs/biome`), not ESLint or Prettier. Do not
suggest `.eslintrc` config, `eslint-disable` comments, or Prettier CLI
flags — none of them apply here.

Commands:
- `npm run check` — lint + format check (`biome check .`)
- `npm run check:write` — auto-fix safe issues (`biome check --write .`)
- `npm run check:unsafe` — auto-fix including unsafe fixes (`biome check --write --unsafe .`)

Config lives in `biome.jsonc` at the project root.
```

No other gaps were identified — the rest of the stack (TypeScript,
Next.js, tRPC, Drizzle, Vitest) passes all four criteria without
qualification.

## Summary

**Overall verdict: ready-with-compensation.** Seven of eight scored
criteria pass outright; the one partial (Biome's training-data
representation) has a lightweight, already-drafted compensation entry
above. This stack needs no structural changes to support the
comfort-compliance-ranking feature — it's an additive, read-only feature
on infrastructure that already meets the bar.

**Key strengths:** end-to-end TypeScript typing, strong framework-level
conventions (Next.js App Router, tRPC, Drizzle single-schema-file), and an
already-mature pair of instruction files (`CLAUDE.md`, `AGENTS.md`) that
pre-empt most steering needs.

**Key gap:** Biome vs. ESLint/Prettier training-data skew — addressed via
the instruction-file addition above.

**Recommended next step:** `/10x-health-check` — audits dependency health,
test coverage, and CI/CD gaps beyond the quality-gate framing used here.
