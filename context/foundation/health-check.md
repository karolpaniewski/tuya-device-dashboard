---
project: tuya-device-dashboard
checked_at: 2026-06-30T00:00:00Z
health_status: healthy
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 6
  low: 0
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 4
---

## Dependency Health

### Lockfile

```
Status:          present (package-lock.json)
Package manager: npm 11.13.0
```

### Security Audit

```
Tool:    npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 6 MODERATE, 0 LOW
Direct vs transitive: 1 direct (drizzle-kit), 5 transitive
```

No CRITICAL or HIGH findings. All 6 MODERATE findings trace to a single root cause:

**MODERATE findings (6 — all fixable by upgrading drizzle-kit):**

- **drizzle-kit** 0.30.5 (direct) — bundles `@esbuild-kit/core-utils` and `@esbuild-kit/esm-loader` which pull in esbuild ≤ 0.24.2. Advisory [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) (CVSS 5.3): development server CORS bypass allowing any website to read dev server responses. **Dev-only tool — no production impact.** Fix: upgrade `drizzle-kit` to 0.31.10 (Category A #2 below).

### Outdated Dependencies

```
Packages with major version gaps: 5 direct deps
```

- **zod**: 3.25.76 → 4.4.3 — Zod v4 has breaking API changes. Agent may generate v4 syntax on new code. Do not upgrade without a migration pass; add a CLAUDE.md pin (Category A #3).
- **next**: 15.5.19 → 16.2.9 — Next.js 16 is very recent; agent training data is Next.js 14–15. No urgency; monitor for breaking changes.
- **typescript**: 5.9.3 → 6.0.3 — TypeScript 6 is very recent. ts5 strict mode is well-supported. No urgency.
- **@types/node**: 20.x → 26.x — types package only, no runtime impact.
- **drizzle-kit**: 0.30.5 → 0.31.10 — also resolves all MODERATE audit findings.

## Test Suite

```
Test runner:    Vitest 4.1.8
Configuration:  vitest.config.ts
Tests found:    229 tests across 103 suites
Test execution: passing (229/229 passed, 0 failed)
```

All suites pass cleanly. CI runs `vitest run` on every push/PR.

## CI/CD

```
Provider:      GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes |
|---|---|---|
| Lint       | ✓ | Biome (`biome check .`) |
| Test       | ✓ | Vitest (`vitest run`) |
| Build      | ✓ | `next build` with `.next` artifact upload |
| Type check | ✓ | `tsc --noEmit` |
| Security   | ✗ | No `npm audit` step in pipeline |

Strong pipeline — four gates before merge. Missing: explicit security audit step (Category A #4 below).

## Configuration

### Low severity

- **biome.json** — Biome runs with default settings. Reasonable defaults; add only if custom rules are needed.
- **.editorconfig** — absent. Biome handles formatting; `.editorconfig` would add consistency for editors outside Biome's reach.

All other configuration present and correct:

- ✓ `.gitignore`
- ✓ `.env.example`
- ✓ `tsconfig.json` (`strict: true`, `noUncheckedIndexedAccess: true`)
- ✓ `CLAUDE.md` and `AGENTS.md`

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready
```

| Quality Gate | Stack-Assess Finding | Health-Check Observation | Status |
|---|---|---|---|
| Typed | TypeScript strict mode | CI enforces `tsc --noEmit` | Reinforced ✓ |
| Convention-based | Next.js App Router + tRPC | CLAUDE.md + AGENTS.md document conventions | Reinforced ✓ |
| Training data | Drizzle (partial) | Drizzle ORM idioms not yet in CLAUDE.md | Action needed |
| Well-documented | NextAuth v5 beta (partial) | v5 auth pattern not yet in CLAUDE.md | Action needed |

Stack-assess recommended two CLAUDE.md additions (Drizzle idioms + NextAuth v5 `auth()` pattern) — both are copy-pasteable from `context/foundation/stack-assessment.md § Recommended Instruction File Additions` and are the highest-leverage fix for the Dziennik Zdarzeń feature.

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. Apply CLAUDE.md additions from stack-assessment

**Impact**: Without Drizzle idiom examples, the agent will generate Prisma-style patterns for the new `event_log` table. Without NextAuth v5 patterns, the agent will use `getServerSession()` (v4 API) to protect `/events`, which doesn't work in v5.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: copy the `## ORM & Auth patterns` block from `context/foundation/stack-assessment.md` and paste it into `CLAUDE.md`. Contains ready-to-use Drizzle schema/query/insert examples and the `auth()` call for NextAuth v5.

#### 2. Upgrade drizzle-kit to resolve MODERATE audit findings

**Impact**: 6 MODERATE audit findings all trace to `drizzle-kit`'s bundled esbuild (dev-only CORS bypass). No production impact, but a clean audit removes distraction.
**Severity**: low (dev-only tool)
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm install drizzle-kit@0.31.10
```

After upgrading, run `npm run db:generate` to verify the new kit version works with the existing schema. Check the Drizzle Kit changelog for config changes between 0.30.x and 0.31.x.

#### 3. Pin Zod to v3 in CLAUDE.md

**Impact**: Zod v4 (4.4.3) is available with breaking API changes. Agent may generate v4 syntax in new tRPC procedures, causing silent type mismatches.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: add to `CLAUDE.md`:

```markdown
### Zod version pin

This project uses **Zod v3** (`zod@3.x`). Do NOT use Zod v4 APIs.

Zod v4 introduced breaking changes to error handling and type inference.
Use only Zod v3 patterns: `z.object()`, `z.string()`, `.parse()`, `.safeParse()`, `z.infer<typeof schema>`.
```

#### 4. Add npm audit step to CI pipeline

**Impact**: new HIGH advisories introduced by transitive dep updates would silently reach `main` — currently CI has no security gate.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add to `.github/workflows/ci.yml` before the `Run CI checks` step:

```yaml
- name: Security audit
  run: npm audit --audit-level=high
  continue-on-error: true
```

`--audit-level=high` fails only on HIGH/CRITICAL. `continue-on-error: true` logs MODERATE findings without blocking — remove once the drizzle-kit MODERATE findings are cleared.

### Addressed in upcoming lessons (Category B)

#### Deployment configuration

**What's missing**: no deployment configuration (`Dockerfile`, `fly.toml`, `vercel.json`, etc.) detected.
**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: set up the deployment target, configure production environment variables, and wire CI to deploy on merge to `main`.

## Summary

Health status: **healthy**

The project is in strong shape for agent-assisted development. TypeScript strict mode, a 229-test suite (all passing), and a four-gate CI pipeline (lint → typecheck → test → build) give the agent solid correctness signals. There are zero CRITICAL or HIGH security findings — only 6 MODERATE advisories confined to a dev-only build tool.

Two quick additions to `CLAUDE.md` (Drizzle ORM idioms + NextAuth v5 auth pattern, both copy-pasteable from `stack-assessment.md`) will directly improve agent output quality for the Dziennik Zdarzeń feature: they prevent the two most likely hallucinations for a new protected page with a new ORM table. A Zod v3 pin note costs 2 minutes and guards against accidental v4 API usage. Together, these three fixes take under 15 minutes and close the only meaningful gaps before agent work begins.

Next step: apply Category A fixes #1 and #3 first (highest leverage for the planned feature), then proceed to agent onboarding.
