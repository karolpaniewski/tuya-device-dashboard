---
project: tuya-device-dashboard
checked_at: 2026-06-26T00:00:00Z
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
  moderate: 4
  low: 0
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 4
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm 11.13.0
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 4 MODERATE, 0 LOW
Direct vs transitive: 1 direct (drizzle-kit), 3 transitive (@esbuild-kit/core-utils, @esbuild-kit/esm-loader, esbuild)
```

All 4 findings are MODERATE and confined to a single dependency cluster that
does not affect the production application:

- **drizzle-kit → esbuild dev-server advisory.** `drizzle-kit@0.30.5` pulls in
  `@esbuild-kit/core-utils` / `@esbuild-kit/esm-loader` → `esbuild@<=0.24.2`
  (GHSA-67mh-4wv8-2f99 — a vulnerable esbuild dev server can respond to
  cross-origin requests). This only affects `drizzle-kit`'s CLI (local database
  tooling); the production Next.js app is not involved. Fix available:
  `drizzle-kit@0.31.10` (semver-major bump).

No CRITICAL or HIGH findings. No production-path exposure.

#### MODERATE findings

- `esbuild` (transitive) — esbuild dev-server CORS issue; via `drizzle-kit`.
- `@esbuild-kit/core-utils` (transitive) — same cluster.
- `@esbuild-kit/esm-loader` (transitive) — same cluster.
- `drizzle-kit` (direct) — root of the cluster; fix available at `0.31.10`.

### Outdated Dependencies

```
Packages with major version gaps: 4
```

Notable gaps (direct dependencies only):

- **`next`**: 15.5.19 → 16.2.9 (1 major version). Not urgent — Next.js major
  releases typically have breaking changes in the App Router API; upgrade
  requires deliberate review of the changelog.
- **`typescript`**: 5.9.3 → 6.0.3 (1 major version). TypeScript 6 changes
  some strict-mode behaviors. Do not upgrade as an incidental bump — plan a
  dedicated verification pass.
- **`zod`**: 3.25.76 → 4.4.3 (1 major version). Zod v4 is a substantial
  breaking redesign (new API, different error shapes). tRPC and Drizzle
  integrations may not support v4 yet. Plan a deliberate migration when
  the ecosystem stabilizes — do not bump as part of any other change.
- **`@types/node`**: 20.x → 26.x (6 major versions, dev dependency). Low
  urgency but a large drift; will need addressing when upgrading Node.js runtime.

Note on `next-auth`: `npm outdated` reports `current: 5.0.0-beta.31`,
`latest: 4.24.14` — this is intentional. npm's `latest` dist-tag still points
at stable v4; this project deliberately runs the v5 beta channel. Do not
"fix" by downgrading.

## Test Suite

```
Test runner: Vitest 4.1.8
Tests found: 216 tests across 25 test files
Test execution: passing (216/216)
```

```
Configuration: vitest.config.ts (globalSetup: global-setup.ts, setupFiles: setup.ts)
Framework: Vitest 4.x — globalSetup runs DB migration once; setupFiles injects TUYA_STUB env per worker
```

The suite has grown significantly from the prior health check (198 → 216 tests,
22 → 25 files). Coverage includes: integration tests for tRPC routers
(mode.trigger full chain), unit tests for server-lib functions (valve-control
branch coverage), and mocked DB tests for device and room routers.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                       |
|------------|--------|---------------------------------------------|
| Lint       | ✓      | Biome (`biome check .`, part of `npm run ci`) |
| Test       | ✓      | Vitest (`vitest run`, part of `npm run ci`)   |
| Build      | ✓      | `next build`, part of `npm run ci`            |
| Type check | ✓      | `tsc --noEmit`, part of `npm run ci`          |
| Security   | ✗      | No `npm audit` step, no Dependabot, no CodeQL |

CI runs the same `npm run ci` gate used locally — no drift between local and
CI verification.

## Configuration

### Low severity

- **`.editorconfig` missing** — Biome already enforces JS/TS formatting; the
  main gap is non-JS files (`.md`, `.yml`) in editors without Biome integration.
  Fix: add a minimal `.editorconfig` (see Recommended Fixes #4 below).

All other expected configuration is present and healthy: `.gitignore`,
`.env.example`, `tsconfig.json` (`strict: true`, `noUncheckedIndexedAccess:
true`), `biome.jsonc` as linter/formatter, `package-lock.json`.

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready
```

| Quality Gate Gap | Health-Check Finding | Status |
|---|---|---|
| None (all gates passed) | CI enforces type-check, lint, test, build on every push — reinforces the "typed" and "convention-based" passes operationally | Reinforced |
| NextAuth v5 beta — partial training-data/docs (pass-with-note) | `AGENTS.md` `## Auth (NextAuth v5 beta)` compensation confirmed present | Mitigated |
| React Flow v12 import path — recommended AGENTS.md addition | Section NOT yet added to `AGENTS.md` | Open — fix before implementing |

The one open item from the stack assessment: the recommended `## Flow chart
(@xyflow/react)` section has not been added to `AGENTS.md` yet. This is the
highest-priority fix for the current change scope.

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. Add `## Flow chart (@xyflow/react)` section to AGENTS.md

**Impact**: without this entry, an agent generating the drag-to-connect
interaction is likely to use the old `reactflow` import (v10/v11 era) instead
of the installed `@xyflow/react` package. This causes a module-not-found error
at runtime — a silent, hard-to-diagnose failure.
**Severity**: high (for this change scope)
**Effort**: quick (< 5 min)
**Fix**: add the following to `AGENTS.md`:

```markdown
## Flow chart (@xyflow/react)

The installed package is `@xyflow/react` (v12), NOT the old `reactflow` package.
Always use:

  import { ReactFlow, useNodesState, useEdgesState, addEdge } from '@xyflow/react';
  import '@xyflow/react/dist/style.css';

Never import from `reactflow` — it is not installed.

Key API for the editable automation flow:
- `onConnect: (connection) => void` — fired when the user draws a new edge;
  call the tRPC mutation to create an automationModeTargets row here.
- `onEdgesDelete: (edges) => void` — fired when an edge is deleted (click +
  delete key, or backspace); call the tRPC mutation to delete the row here.
- Custom nodes: register in `nodeTypes` (object defined OUTSIDE the component
  to avoid re-renders). Source handles use `<Handle type="source" />`;
  target handles use `<Handle type="target" />`.
- The `ReactFlowProvider` wrapper is required when calling hooks like
  `useReactFlow()` outside the `<ReactFlow>` component itself.
```

#### 2. Upgrade `drizzle-kit` to clear the esbuild dev-server advisory

**Impact**: dev-only exposure via a known esbuild dev-server CORS issue
(GHSA-67mh-4wv8-2f99). Not production-blocking, but a semver-major drizzle-kit
upgrade is a good opportunity to clear the advisory and pick up CLI improvements.
**Severity**: medium
**Effort**: moderate (15–30 min — semver-major bump, check changelog)
**Fix**:

```bash
npm install -D drizzle-kit@latest
npm run db:generate  # confirm the CLI still works against existing migrations
```

#### 3. Add Dependabot for automated security scanning

**Impact**: current advisories are only visible by running `npm audit` manually;
nothing surfaces new advisories on a push.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**: create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
```

#### 4. Add `.editorconfig`

**Impact**: low — Biome covers JS/TS; this fills the gap for `.md` and `.yml`
files in editors without Biome integration.
**Severity**: low
**Effort**: quick (< 5 min)
**Fix**:

```ini
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

Not applicable. This project already has CI/CD (GitHub Actions), agent
instruction files (`CLAUDE.md`, `AGENTS.md`), and no deferred setup steps.
The only deferred item is deployment config — intentionally absent (LAN-only
tool with manual deploy), not a gap.

## Summary

Health status: healthy

The project's core signals are all clean: 216 tests passing across 25 files,
strict TypeScript end-to-end, CI that mirrors the local dev-check exactly, and
actively-maintained instruction files. The only findings are routine maintenance
items plus one scope-specific action: adding the `@xyflow/react` import guidance
to `AGENTS.md` before starting the editable automation flow implementation.
That one addition (Fix #1 above, under 5 minutes) is the only thing that stands
between this project and a smooth agent-assisted implementation run. The
dependency advisory (drizzle-kit MODERATE, dev-only) and the missing
Dependabot config are background maintenance — they do not affect the
upcoming implementation.

Next step: apply Fix #1 (AGENTS.md `## Flow chart` section), then proceed
to `/10x-plan` for the editable automation flow implementation plan.
