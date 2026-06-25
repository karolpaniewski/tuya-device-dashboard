---
project: tuya-device-dashboard
checked_at: 2026-06-25T10:29:08Z
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
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 6 MODERATE, 0 LOW
Direct vs transitive: 2 direct (drizzle-kit, next), 4 transitive (@esbuild-kit/core-utils, @esbuild-kit/esm-loader, esbuild, postcss)
```

All 6 findings are MODERATE — none reach the CRITICAL/HIGH threshold that would block agent-assisted work. Two independent clusters:

- **drizzle-kit → esbuild (dev-only).** `drizzle-kit@0.30.5` pulls in `@esbuild-kit/core-utils` / `@esbuild-kit/esm-loader` → `esbuild@<=0.24.2` (GHSA-67mh-4wv8-2f99 — a vulnerable esbuild dev server can be made to respond to requests from any origin). This only affects local development tooling (drizzle-kit's CLI, not the shipped app), so production exposure is none. `npm audit`'s suggested fix: `drizzle-kit@0.31.10` (semver-major).
- **next → postcss (bundled, nested).** `next@15.5.19` bundles its own internal `postcss@8.4.31` (GHSA-qx2v-qp2m-jg93 — XSS via unescaped `</style>` in PostCSS's stringify output, range `<8.5.10`). This is **not** the project's own top-level `postcss` (already `8.5.15`, safe) — it's Next's internal copy. `npm audit`'s suggested fix (downgrade `next` to `9.3.3`) is a known npm-audit false economy for nested transitive deps — do not follow it; it would be a massive regression. The real fix is either an npm `overrides` entry forcing `postcss >= 8.5.10` everywhere, or waiting for a Next.js patch release that bumps its internal copy.

#### MODERATE findings
- `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `esbuild` — transitive via `drizzle-kit`; dev-only exposure.
- `drizzle-kit` (direct) — same cluster; fix available at `0.31.10` (major bump).
- `next` (direct) — flagged via its own bundled `postcss`; `next` itself is current (15.5.19).
- `postcss` (transitive, nested under `next`, not the top-level dependency) — XSS advisory; see above.

### Outdated Dependencies

```
Packages with major version gaps (2+): 0
```

No package is 2+ major versions behind. Notes worth flagging anyway:

- **`next-auth`**: `npm outdated` reports `current: 5.0.0-beta.31`, `latest: 4.24.14` — this looks like the project is "ahead of latest," which is correct and intentional: npm's `latest` dist-tag still points at the stable v4 line, while this project deliberately runs the v5 beta channel (already named and compensated for in `AGENTS.md`). **Do not** "fix" this by downgrading to v4 — that would break auth entirely.
- **`next`**: `15.5.19` → `16.2.9` available (1 major version). Not at the 2+ threshold, but worth knowing about for future planning.
- **`zod`**: `3.25.76` → `4.4.3` available (1 major version, and zod v4 is a substantial breaking redesign). Not urgent, but plan for a deliberate migration rather than an incidental bump.

## Test Suite

```
Test runner: Vitest
Tests found: 198 tests across 22 test files
Test execution: passing (198/198)
```

```
Configuration: package.json scripts (test, test:watch); no separate vitest.config.* needed for this setup
Framework: Vitest 4.1.8 — note: npm outdated shows 4.1.9 available (patch bump)
```

Verified via the project's actual `npm run test` command. A generic dry-run probe (`vitest run --reporter=basic`) failed on an unrelated reporter-loading quirk in this Vitest version — not a project issue, since the real, project-defined test script runs cleanly.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                      |
|------------|--------|---------------------------------------------|
| Lint       | ✓      | Biome (`biome check .`, part of `npm run ci`) |
| Test       | ✓      | Vitest (`vitest run`, part of `npm run ci`)   |
| Build      | ✓      | `next build`, part of `npm run ci`            |
| Type check | ✓      | `tsc --noEmit`, part of `npm run ci`          |
| Security   | ✗      | not configured — no `npm audit` step, no Dependabot, no CodeQL |

Four of five stages are covered, and CI runs the exact same `npm run ci` gate used locally — no drift between local and CI verification. The one gap is automated security scanning.

## Configuration

### Medium severity

- **No security-scan step in CI** — the 6 moderate `npm audit` findings above are currently only visible by running the command locally; nothing flags new advisories automatically on push. Fix: add a Dependabot config (`.github/dependabot.yml`, `npm` ecosystem) for automated update PRs, and/or add a non-blocking `npm audit --audit-level=high` CI step so HIGH/CRITICAL findings surface in PR checks without failing builds on every moderate advisory.

### Low severity

- **`.editorconfig`** — missing. Low impact: Biome (`biome.jsonc`) already enforces formatting/lint consistency for JS/TS; this would mainly help non-JS files (`.md`, `.yml`) in editors without Biome integration. Fix: add a minimal `.editorconfig` with `charset`, `end_of_line`, `indent_style`, and `trim_trailing_whitespace` defaults.

All other expected configuration is present: `.gitignore`, `.env.example`, `tsconfig.json` (`strict: true`, `noUncheckedIndexedAccess: true`, `checkJs: true`), Biome as the sole linter/formatter, `package-lock.json`.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready
```

| Quality Gate Gap | Health-Check Finding | Status |
|-------------------|------------------------|--------|
| None (12/12 gates passed) | CI enforces type-check, lint, test, and build on every push — reinforces the "typed" and "convention-based" passes with an automated gate, not just a tsconfig declaration | Reinforced |
| NextAuth v5 beta — partial training-data/docs gate (pass-with-note) | `AGENTS.md`'s `## Auth (NextAuth v5 beta)` compensation entry confirmed present and current | Mitigated |

No new gaps surfaced by this health check beyond what the stack assessment already covered. The findings here (dependency audit moderates, missing CI security stage) are operational/maintenance items, not quality-gate failures.

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. Add an npm `overrides` entry (or wait for upstream) for Next's bundled postcss

**Impact**: a moderate XSS advisory (GHSA-qx2v-qp2m-jg93) sits in Next's internal dependency tree; low real-world risk for this LAN-only internal tool, but worth closing cleanly rather than leaving an open advisory.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

```json
// package.json
"overrides": {
  "postcss": "^8.5.15"
}
```
Then `npm install` and confirm `npm run build` still succeeds (it should — the top-level `postcss` is already on this safe version).

#### 2. Upgrade `drizzle-kit` to clear the esbuild dev-server advisory

**Impact**: dev-only exposure (CLI tooling, not the shipped app) via a known esbuild dev-server CORS issue (GHSA-67mh-4wv8-2f99).
**Severity**: medium
**Effort**: moderate (15–30 min — semver-major bump, worth a quick changelog check)
**Fix**:

```bash
npm install -D drizzle-kit@0.31.10
npm run db:generate  # sanity-check the CLI still works against existing migrations
```

#### 3. Add automated security scanning to CI

**Impact**: right now, new dependency advisories are only visible by running `npm audit` manually — nothing surfaces them on a PR.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: add `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

#### 4. Add `.editorconfig`

**Impact**: low — Biome already covers JS/TS formatting; this only smooths over non-JS file editing (`.md`, `.yml`) in editors without Biome integration.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
insert_final_newline = true
```

### Addressed in upcoming lessons (Category B)

Not applicable — this project already has CI/CD (GitHub Actions) and agent instruction files (`CLAUDE.md`, `AGENTS.md`), both actively maintained with real content rather than stubs. There's nothing deferred to a later setup stage; the project has already passed that point. (No deployment-target config exists either, but that's a deliberate choice already documented in this project's roadmap — a LAN-only tool with manual `git pull && build && start` deploy — not a gap.)

## Summary

Health status: healthy

The project's core agent-readiness signals are all clean: a working, fast test suite (198/198 passing across 22 files), strict TypeScript end-to-end, a CI pipeline that mirrors the local dev-check script exactly, and actively-maintained instruction files with real compensation entries already in place. The only findings are routine maintenance items — six moderate (zero critical/high) dependency advisories, no automated security-scan stage in CI, and a missing `.editorconfig` — none of which block or meaningfully complicate agent-assisted work on the current change.

Next step: the four fixes above are optional polish, not blockers — address them whenever convenient (the postcss override and Dependabot config take under 10 minutes combined). The project is ready to proceed straight to implementing the device-card/room-card automation-visibility change (`prd-v9.md`).
