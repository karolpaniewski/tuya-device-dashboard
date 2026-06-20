---
project: tuya-device-dashboard
checked_at: 2026-06-20T13:20:00Z
health_status: needs-attention
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
  high: 1
  moderate: 6
  low: 0
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 4
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
Summary: 0 CRITICAL, 1 HIGH, 6 MODERATE, 0 LOW
Direct vs transitive: 2 direct (drizzle-kit, next), 1 direct+high (drizzle-orm); remaining 4 are transitive (@esbuild-kit/core-utils, @esbuild-kit/esm-loader, esbuild, postcss)
```

#### HIGH findings

- **drizzle-orm** 0.41.0 (installed, direct) — GHSA-gpj5-g38j-94v9: SQL injection via improperly escaped SQL identifiers, affects versions `<0.45.2`. Fix: `npm install drizzle-orm@^0.45.2` (flagged by npm as a semver-major bump even though it's a 0.x→0.x change — review Drizzle's 0.42–0.45 changelogs before upgrading, then re-run the test suite).

#### MODERATE findings

- **drizzle-kit** 0.30.5 (direct, dev dependency) and its transitive deps **@esbuild-kit/core-utils**, **@esbuild-kit/esm-loader**, **esbuild** — GHSA-67mh-4wv8-2f99: esbuild's dev server can be made to respond to arbitrary requests from any website. Only affects local `drizzle-kit` workflows (`db:generate`, `db:push`, `db:studio`), not the deployed app. Fix: `npm install -D drizzle-kit@^0.31.10`.
- **next** 15.5.19 (direct) and its bundled, transitive **postcss** copy — GHSA-qx2v-qp2m-jg93: PostCSS XSS via unescaped `</style>` in stringified CSS output, affects postcss `<8.5.10`. npm's `fixAvailable` field suggests downgrading `next` to `9.3.3` — that is not a real fix, it's npm audit's heuristic picking the oldest version outside the vulnerable range. The practical remediation is to track a Next.js patch release that bumps its internal postcss copy; no safe action is available today without a much larger Next.js version change.

### Outdated Dependencies

```
Packages with major version gaps: 4 (2+ majors behind), plus several 1-major-behind direct deps worth tracking
```

- **@types/node**: 20.19.43 → 26.0.0 (6 major versions behind). Types-only package — low runtime risk, but worth a deliberate bump since it can mask Node API drift.
- **typescript**: 5.9.3 → 6.0.3 (1 major behind).
- **next**: 15.5.19 → 16.2.9 (1 major behind).
- **zod**: 3.25.76 → 4.4.3 (1 major behind) — zod v4 changed several validation/error APIs; this is a deliberate migration, not a drop-in bump.
- **drizzle-orm** / **drizzle-kit**: already covered above — their "latest" bump also resolves the HIGH/MODERATE audit findings.
- Note: `npm outdated` reports `next-auth`'s "latest" as `4.24.14`, lower than the installed `5.0.0-beta.31`. This is an npm dist-tag artifact, not a real downgrade signal — `next-auth`'s `latest` tag still points at the v4 line while v5 ships under a `beta` tag; the project is deliberately on the v5 beta channel (also flagged in `stack-assessment.md`).

## Test Suite

```
Test runner: Vitest
Tests found: 114 tests across 53 suites
Test execution: passing (114/114)
```

```
Configuration: vitest.config.ts
Framework: Vitest 4.1.8
```

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                      |
|------------|--------|---------------------------------------------|
| Lint       | ✓      | Biome (`biome check .`)                     |
| Test       | ✓      | Vitest (`vitest run`)                       |
| Build      | ✓      | `next build`                                |
| Type check | ✓      | `tsc --noEmit`                              |
| Security   | ✗      | not configured — no `npm audit` step, no Dependabot config |

## Configuration

### High severity

All expected high-severity configuration is present — no gaps. (`.gitignore` correctly excludes `.env`/`.env*.local`; `tsconfig.json` has `strict: true`.)

### Medium severity

All expected medium-severity configuration is present — no gaps. (`biome.jsonc` covers both linting and formatting.)

### Low severity

- **`.editorconfig`** — missing. Minor: cross-editor formatting consistency is already covered by Biome for this codebase, so the practical impact is small. Fix: add a basic `.editorconfig` if contributors use editors that don't read `biome.jsonc`.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready
```

The stack assessment found no quality-gate failures (typed, convention-based, popular-in-training, well-documented all pass) — so there are no compensation strategies to verify here. This health-check's findings are independent of stack choice: they're operational (a real dependency vulnerability, a CI gap, some version drift), not architecture-shaped. The two reports agree on the one item they share: stack-assessment flagged the NextAuth beta dependency and the absent deployment config as minor watch-items, not gates; this health-check reinforces the same two observations from the operational side (outdated-deps note above, and the Category B item below).

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Patch the Drizzle ORM SQL-injection advisory

**Impact**: Drizzle ORM is the project's only database access layer, fronting an auth-gated admin app. A SQL-injection-class flaw in the ORM itself is the most consequential finding in this report — any agent-assisted change that touches query-building code should not be layered on top of a known-vulnerable ORM version.
**Severity**: high
**Effort**: moderate (15–30 min: review changelog, bump, re-run `npm run ci`)
**Fix**:

```bash
npm install drizzle-orm@^0.45.2
npm run ci
```

### 2. Add a security-scan stage to CI

**Impact**: The CI pipeline already gates lint, types, tests, and build — but nothing currently catches a newly-disclosed advisory (like the one in fix #1) before it lands on `main`. Without this, the next vulnerable dependency ships silently.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: add a step to `.github/workflows/ci.yml` (or fold into `npm run ci`):

```yaml
      - name: Audit dependencies
        run: npm audit --audit-level=high
```

### 3. Bump `drizzle-kit` to clear the esbuild dev-server advisory

**Impact**: Lower urgency than #1 — `drizzle-kit` only runs locally (`db:generate`, `db:push`, `db:studio`), never in the deployed app — but it's a one-line fix that clears 4 of the 6 MODERATE findings at once.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

```bash
npm install -D drizzle-kit@^0.31.10
npm run db:generate
```

### 4. Schedule the zod v3→v4 migration deliberately

**Impact**: zod is used at tRPC's input-validation boundary throughout the API layer; v4 changed several validation and error-shape APIs. Not urgent, but it's the one outdated dependency here with real breaking-change surface — worth a dedicated pass rather than a drive-by bump during unrelated work.
**Severity**: low
**Effort**: significant (> 1 hour — touches every tRPC router's input schemas)
**Fix**: review the [zod v4 migration guide], then bump and fix call sites incrementally, router by router, with `npm run test` after each.

### Addressed in upcoming lessons (Category B)

### No deployment configuration in-repo

**Lesson**: infrastructure and deployment
**What you'll do there**: set up a deployment target (platform config, `Dockerfile`, or equivalent) — this is also flagged in `stack-assessment.md` as a non-blocking observation. No action needed before agent-assisted feature work.

## Summary

Health status: needs-attention

The project's day-to-day agent-collaboration tooling is solid: a working Vitest suite (114/114 passing), a CI pipeline that already gates lint/types/tests/build, strict TypeScript, and clean `.gitignore`/config hygiene. The one real gap is a HIGH-severity SQL-injection advisory in the installed Drizzle ORM version, compounded by the fact that CI has no security-scan stage to have caught it automatically — that's the pairing that earns "needs-attention" rather than "healthy." Everything else (moderate esbuild/postcss advisories, a few outdated direct dependencies) is routine maintenance, not urgent.

Next step: patch the Drizzle ORM advisory and add the CI audit step (fixes #1–#2 above), then proceed to agent onboarding — the remaining items (drizzle-kit bump, zod migration) can be scheduled alongside normal feature work.
