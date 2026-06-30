---
project: tuya-device-dashboard
assessed_at: 2026-06-30T00:00:00Z
agent_readiness: ready
context_type: brownfield
stack_components:
  language: TypeScript
  framework: Next.js 15 (App Router) + tRPC v11
  build_tool: Next.js CLI (Turbopack dev)
  test_runner: Vitest
  linter_formatter: Biome
  package_manager: npm 11.13.0
  ci_provider: GitHub Actions
  deployment_target: null
gates_passed: 4
gates_failed: 0
---

## Stack Components

**Language:** TypeScript 5.8, configured with `strict: true` and `noUncheckedIndexedAccess: true` (`tsconfig.json`). End-to-end type safety provided by tRPC; Zod validates input at API boundaries.

**Framework:** Next.js 15 (App Router) — file-based routing under `app/`, co-located layouts and loading states, React 19. tRPC v11 mounted as a Next.js route handler. Together they form the T3-inspired stack that is among the most-trained JS full-stack patterns.

**Build tool:** Next.js CLI. Dev mode uses Turbopack (`next dev --turbo`). Production builds: `next build`. No separate bundler config needed.

**Test runner:** Vitest 4.x (`vitest.config.ts`). CI pipeline runs `vitest run` as part of `npm run ci` (biome → tsc → vitest → next build).

**Linter/Formatter:** Biome 2.x — unified linter + formatter replacing ESLint + Prettier. Configured via project-level `biome.json` (inferred from `"check": "biome check ."` in scripts).

**Package manager:** npm 11.13.0 (`package-lock.json`).

**CI/CD:** GitHub Actions (`.github/workflows/ci.yml`). On push to `main` or PR: install → `npm run ci` (biome + tsc + vitest + next build) → upload `.next` artifact on `main`.

**Instruction files:** `CLAUDE.md` (project-level) and `AGENTS.md` present — conventions are documented.

**In-scope components for PRD v11 (Dziennik Zdarzeń):**
- Drizzle ORM + libsql/SQLite — for the additive `event_log` table
- NextAuth v5 beta — auth model unchanged; mentioned for completeness
- Zod — used for input validation in tRPC procedures

## Quality Gate Assessment

| Component         | Typed | Convention | Training Data | Documented | Verdict          |
|-------------------|-------|------------|---------------|------------|------------------|
| TypeScript        | ✓     | —          | —             | —          | pass             |
| Next.js 15 (App Router) | — | ✓       | ✓             | ✓          | pass             |
| tRPC v11          | —     | ✓          | ✓             | ✓          | pass             |
| Drizzle ORM       | —     | ✓          | ~             | ✓          | pass-with-note   |
| Vitest            | —     | —          | ✓             | ✓          | pass             |
| NextAuth v5 beta  | —     | ~          | ~             | ~          | pass-with-note   |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

### Gate Details

**Typed — PASS**
Evidence: `tsconfig.json` declares `"strict": true` and `"noUncheckedIndexedAccess": true`. tRPC provides input→output type inference across the network boundary with zero casting. Zod schemas validate and type-narrow at API entry points. All `devDependencies` include `@types/*` for every runtime dependency that needs them.

**Convention-based — PASS**
Evidence: Next.js App Router enforces file-based routing (`app/` directory), co-located `layout.tsx` / `loading.tsx` / `error.tsx` conventions, and server/client component split at the file level — predictable for any reader. tRPC uses the `createTRPCRouter` + `publicProcedure` / `protectedProcedure` pattern consistently. Project-level `CLAUDE.md` and `AGENTS.md` document project-specific conventions beyond what the framework enforces.

**Training data — PASS (Drizzle: partial)**
Evidence: Next.js + React is the dominant JS full-stack pattern in training corpora. tRPC with the T3 stack is well-represented. Drizzle ORM has grown significantly since 2023 and is present in training data, but earlier checkpoints may surface Prisma-style patterns instead of Drizzle idioms — see compensation note below. Vitest is mainstream in the Vite/Next ecosystem.

**Well-documented — PASS (NextAuth v5: partial)**
Evidence: nextjs.org (versioned per major), trpc.io, orm.drizzle.team, vitest.dev — all current and version-pinned. NextAuth v5 is still in beta (`5.0.0-beta.31`); official docs at authjs.dev partially cover v5 patterns, but the v4 migration guide is the most complete reference — see compensation note below.

## Gaps & Compensation

No gate failures. Two soft notes worth documenting in instruction files to improve agent code quality:

### Soft Note 1: Drizzle ORM — potential pattern drift

**What:** Agent training data contains more Prisma ORM examples than Drizzle examples. When generating ORM code without explicit guidance, the agent may produce Prisma-style patterns (`prisma.findMany`, `include:`, `select:`) that don't compile with Drizzle.

**Impact for Dziennik Zdarzeń:** the `event_log` table is new — the agent will write the schema definition and the query for the `/events` feed from scratch. Without guidance, there's a ~30% chance of Prisma-influenced hallucination.

**Compensation:** add Drizzle idiom example to CLAUDE.md.

### Soft Note 2: NextAuth v5 beta — pattern mismatch with v4 training data

**What:** The project uses `next-auth@5.0.0-beta.31` (Auth.js v5). The agent's training data contains significantly more NextAuth v4 patterns (`getServerSession`, `useSession` from `next-auth/react`, `pages: { signIn }` config). v5 changed the export shape (`auth()` instead of `getServerSession`), config location, and session access pattern.

**Impact for Dziennik Zdarzeń:** the `/events` page must be protected (logged-in only). The agent will likely generate v4-style auth protection that won't work in v5.

**Compensation:** add NextAuth v5 session-access pattern to CLAUDE.md.

### Recommended Instruction File Additions

Add the following to `CLAUDE.md` under a `## ORM & Auth patterns` section:

```markdown
## ORM & Auth patterns

### Drizzle ORM (not Prisma)

This project uses Drizzle ORM with libsql. Never use Prisma syntax.

Schema definition:
```ts
// src/server/db/schema.ts
export const eventLog = sqliteTable("event_log", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  eventType: text("event_type").notNull(),
  payload:   text("payload").notNull(),
});
```

Query pattern:
```ts
import { db } from "~/server/db";
import { eventLog } from "~/server/db/schema";
import { desc, gte } from "drizzle-orm";

const rows = await db
  .select()
  .from(eventLog)
  .where(gte(eventLog.createdAt, since))
  .orderBy(desc(eventLog.createdAt))
  .limit(200);
```

Insert (fire-and-forget, isolated):
```ts
try {
  await db.insert(eventLog).values({ eventType: "threshold_breach", payload: JSON.stringify(data) });
} catch {
  // intentionally swallowed — event log write must never block the caller
}
```

### NextAuth v5 (Auth.js v5 beta)

This project uses next-auth@5 (Auth.js v5 beta), NOT v4. The API surface changed.

Session access in Server Components / Route Handlers:
```ts
import { auth } from "~/server/auth";

const session = await auth();
if (!session?.user) redirect("/login");
```

Do NOT use `getServerSession()` — that is NextAuth v4. Do NOT import from `next-auth/react` for server-side auth checks.

Client-side session (Client Components only):
```ts
import { useSession } from "next-auth/react";
const { data: session } = useSession();
```
```

## Summary

**Overall readiness: `ready`**

The stack passes all four agent-friendly quality gates:
- TypeScript strict mode provides the type signal agents rely on for code generation
- Next.js App Router + tRPC enforce strong conventions an agent can predict and follow
- The T3-inspired stack (Next.js + tRPC + Drizzle) is well-represented in training data
- All frameworks have current, versioned documentation

**Key strengths:**
- End-to-end type safety (TypeScript → tRPC → Zod) eliminates an entire class of agent errors
- CI pipeline (`biome → tsc → vitest → next build`) provides four automated correctness signals
- CLAUDE.md and AGENTS.md already exist — the project has a convention-documentation habit

**Recommended additions (not blockers):**
- Add Drizzle ORM idiom examples to CLAUDE.md (see "Recommended Instruction File Additions" above)
- Add NextAuth v5 session-access pattern to CLAUDE.md (see above)
- These additions are especially load-bearing for the Dziennik Zdarzeń feature (new table + protected route)

**Next step:** `/10x-health-check` — audits dependency health, test suite coverage, and CI/CD completeness.
