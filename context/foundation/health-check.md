---
project: "Tuya Device Dashboard"
checked_at: 2026-07-01T11:21:26Z
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
ci_provider: "GitHub Actions"
recommended_fixes: 3
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 6 MODERATE, 0 LOW
Direct vs transitive: 2 direct (drizzle-kit, next), 4 transitive (@esbuild-kit/core-utils,
@esbuild-kit/esm-loader, esbuild, postcss)
```

All 6 moderate findings resolve to two root advisories:

- **esbuild** (bundled via `drizzle-kit`'s dependency chain: `@esbuild-kit/esm-loader` →
  `@esbuild-kit/core-utils` → `esbuild`) — GHSA-67mh-4wv8-2f99: the esbuild dev server
  accepts requests from any website and can return responses (moderate, CVSS 5.3). This
  is a dev-time-only surface (esbuild's own dev server), not something exposed in the
  built app. Fix requires a semver-major `drizzle-kit` bump (0.18.1) to drop the affected
  transitive chain.
- **postcss** (bundled inside `next`'s own dependency tree) — GHSA-qx2v-qp2m-jg93: XSS via
  unescaped `</style>` in PostCSS's stringify output on versions `<8.5.10` (moderate, CVSS
  6.1). Fix requires a semver-major `next` bump per npm's resolution.

No CRITICAL or HIGH findings. Both fixes are marked `isSemVerMajor: true` by npm — not a
quick patch, but not urgent given the moderate severity and that neither path is reachable
in production (dev-server-only for esbuild; the vulnerable postcss version is bundled and
not directly invoked by this app's own CSS build).

### Outdated Dependencies

```
Packages with major version gaps: 2 (excluding intentional pins)
```

- **@types/node**: 20.19.43 → 26.1.0 (6 major versions behind)
- **dependency-cruiser**: 17.4.3 → 18.0.0 (1 major version behind)

Not flagged as gaps (intentional, per `CLAUDE.md`):
- **next-auth**: pinned to `5.0.0-beta.31` (Auth.js v5 beta) — npm's `latest` dist-tag
  still points at the 4.x line; this is the documented intended version, not staleness.
- **zod**: pinned to `^3.24.2` (Zod v3) — `CLAUDE.md` explicitly pins this to avoid v4's
  breaking changes; not staleness.
- **next**, **typescript**: both have newer majors published (`next` 16, `typescript` 6),
  but the installed versions satisfy the project's declared semver ranges (`^15.2.3`,
  `^5.8.2`) — these are available upgrades, not urgent gaps.

## Test Suite

```
Test runner: Vitest
Tests found: 236 tests across 107 test suites
Test execution: passing (236/236)
```

```
Configuration: vitest.config.ts
Framework: Vitest 4.1.8 (installed) — newer patch (4.1.9) available
```

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                              |
|------------|--------|-----------------------------------------------------|
| Lint       | ✓      | Biome (`biome check .`, part of `npm run ci`)        |
| Test       | ✓      | Vitest (`vitest run`, part of `npm run ci`)          |
| Build      | ✓      | `next build`, part of `npm run ci`                   |
| Type check | ✓      | `tsc --noEmit`, part of `npm run ci`                 |
| Security   | ✓      | `npm audit --audit-level=high` (continue-on-error: informational, does not block merge) |

## Configuration

### Low severity

- **`.editorconfig`** — no cross-editor formatting baseline (Biome covers formatting
  within this repo, but `.editorconfig` still helps editors that don't run Biome, e.g.
  indent settings for non-JS files). Fix: add a minimal `.editorconfig` (few minutes,
  optional given Biome already enforces formatting for the files it covers).

All other expected configuration is present: `.gitignore` ✓, `.env.example` ✓,
`biome.jsonc` (formatter/linter) ✓, `tsconfig.json` with `strict: true` ✓.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready-with-compensation
```

| Quality Gate Gap                              | Health-Check Finding                                                        | Status     |
|------------------------------------------------|-------------------------------------------------------------------------------|------------|
| Build tool training-data partial (Biome vs. ESLint/Prettier) | CI runs `biome check .` as the sole lint/format step; no ESLint/Prettier config exists to conflict with it | Mitigated — CI enforces the correct tool, reducing the chance an agent's suggestion drifts unnoticed |

No other quality-gate gaps were identified in the stack assessment to cross-reference.

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. Bump `@types/node` (6 major versions behind)

**Impact**: type definitions for Node.js APIs are 6 majors stale; an agent generating
Node-API-touching code may reference APIs/types that were added or changed after v20.
**Severity**: low
**Effort**: moderate (15–30 min) — verify no breaking type changes affect existing code
**Fix**:

```bash
npm install --save-dev @types/node@latest
npm run typecheck
```

#### 2. Bump `dependency-cruiser` (1 major version behind)

**Impact**: dev-only tooling; low direct impact on agent workflows, but worth keeping
current since it's used for dependency-graph validation.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm install --save-dev dependency-cruiser@latest
```

#### 3. Add `.editorconfig`

**Impact**: minor — Biome already enforces formatting for covered file types; this only
helps consistency for file types Biome doesn't touch.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**: add a minimal `.editorconfig` with `indent_style`, `indent_size`, `end_of_line`,
`charset`, and `insert_final_newline` for the repo root.

No CRITICAL, HIGH, or blocking findings were identified — the audit's 6 moderate findings
are transitive dev-tooling advisories with major-version-only fixes, and both direct
dependencies (`drizzle-kit`, `next`) are pinned deliberately per existing project
conventions.

### Addressed in upcoming lessons (Category B)

Not applicable — CI/CD is already configured, and `CLAUDE.md`/`AGENTS.md` are already
present with project-specific conventions. No Category B gaps to defer.

## Summary

Health status: healthy

The project has zero CRITICAL/HIGH security findings, a fully passing test suite (236/236
across 107 suites), and CI/CD that already covers lint, test, build, type-check, and a
security-audit step. The only gaps are minor: two dev-dependency version lags
(`@types/node`, `dependency-cruiser`) and a missing `.editorconfig` — none block or
meaningfully hinder agent-assisted work on the comfort-compliance-ranking feature.

Next step: address the three quick/moderate fixes above at your convenience (none are
urgent), then proceed with implementation planning for the comfort-compliance-ranking
feature.
