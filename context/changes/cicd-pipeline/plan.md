# CI/CD Pipeline Implementation Plan

## Overview

Create a GitHub Actions workflow that runs the existing `npm run ci` quality gate (`biome check . && tsc --noEmit && vitest run && next build`) on every PR and every push to `main`. The workflow uploads the compiled `.next/` output as a downloadable artifact on successful `main` builds, decoupling build from deployment to the LAN server.

## Current State Analysis

No `.github/` directory exists. The quality gate is already fully wired in `package.json`:

```
"ci": "biome check . && tsc --noEmit && vitest run && next build"
```

This covers lint (Biome), type checking (tsc), unit/integration tests (Vitest), and production build (Next.js). All that's missing is the GitHub Actions YAML that invokes it.

`next build` bootstraps the Next.js app and validates env vars through `@t3-oss/env-nextjs`. Five vars are required: `DATABASE_URL`, `ENCRYPTION_SECRET`, `AUTH_SECRET`, `AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD`. These must be stored as GitHub Secrets and injected into the job.

`src/test/setup.ts` injects its own env vars for Vitest — the Vitest step does not need GitHub Secrets.

## Desired End State

A `.github/workflows/ci.yml` workflow exists that:
- Runs on every PR open/update and every push to `main`
- Installs dependencies via `npm ci` with npm cache enabled
- Caches `.next/cache` between runs
- Runs `npm run ci` with all required env vars from GitHub Secrets
- Uploads `.next/` (excluding cache) as a named artifact on successful `main` builds
- Blocks PR merges when the check fails (after branch protection is configured)

### Key Discoveries

- `package.json:10` — `"ci"` script already defined; workflow simply calls `npm run ci`
- `src/test/setup.ts` — Vitest sets its own env vars; no secrets needed for the test step
- `vitest.config.ts` — `environment: "node"`, no browser runner; runs cleanly on `ubuntu-latest`
- `tech-stack.md` — `ci_provider: github-actions`, `ci_default_flow: auto-deploy-on-merge`
- `.gitignore` — `db.sqlite` and `.env` are excluded; `.next/` is excluded (workflow uploads it separately)

## What We're NOT Doing

- Automated deployment to the LAN server — artifact upload decouples build from deploy; `git pull && npm ci && npm start` on the server remains manual for this slice
- Matrix builds across multiple Node versions — Node 22 only
- Separate parallel jobs per quality step — single sequential job, stop on first failure
- Docker image build — out of scope for this slice

## Implementation Approach

Single-job GitHub Actions workflow. Sequential steps: checkout → Node 22 setup with npm cache → Next.js build cache restore → `npm ci` → `npm run ci` (with secrets) → cache save → artifact upload (main only). Branch protection is a manual GitHub UI step documented in Phase 2.

## Critical Implementation Details

- **Artifact excludes `.next/cache`**: the build cache is restored/saved separately via `actions/cache`; uploading it inside the artifact wastes storage and is not needed at runtime. Use a path exclusion pattern in `upload-artifact`.
- **`next build` env var concern**: if `next build` ever fails with "database not found", add `npm run db:migrate` as a step before `npm run ci`. This is unlikely (all pages are dynamically rendered behind auth, so no RSC fetches at build time), but it is the correct fix if it surfaces.

---

## Phase 1: GitHub Actions Workflow

### Overview

Create the `.github/workflows/ci.yml` file. This is the entire code deliverable for this slice; no application code changes.

### Changes Required

#### 1. Workflow file

**File**: `.github/workflows/ci.yml`

**Intent**: Define a CI job that runs on PR and `main` push, installs deps, runs the full `ci` script with secrets, caches the Next.js build directory, and uploads the production build artifact on `main`.

**Contract**: The job name must be `ci` (this is the exact string referenced when configuring the required status check in Phase 2). Artifact name should include the commit SHA so builds are identifiable: `nextjs-build-${{ github.sha }}`. The `.next/cache` directory must be excluded from the artifact upload path. Env vars must be injected only on the `Run CI checks` step (not job-level), keeping the scope tight.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"

      - name: Restore Next.js build cache
        uses: actions/cache@v4
        with:
          path: .next/cache
          key: ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
          restore-keys: |
            ${{ runner.os }}-nextjs-${{ hashFiles('**/package-lock.json') }}-
            ${{ runner.os }}-nextjs-

      - name: Install dependencies
        run: npm ci

      - name: Run CI checks
        run: npm run ci
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          ENCRYPTION_SECRET: ${{ secrets.ENCRYPTION_SECRET }}
          AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
          AUTH_ADMIN_EMAIL: ${{ secrets.AUTH_ADMIN_EMAIL }}
          AUTH_ADMIN_PASSWORD: ${{ secrets.AUTH_ADMIN_PASSWORD }}

      - name: Upload build artifact
        if: github.ref == 'refs/heads/main' && success()
        uses: actions/upload-artifact@v4
        with:
          name: nextjs-build-${{ github.sha }}
          path: |
            .next
            !.next/cache
          retention-days: 7
```

### Success Criteria

#### Automated Verification

- Workflow YAML is valid: `npx --yes @actions/toolkit/scripts/workflow-schema-validate .github/workflows/ci.yml 2>/dev/null || echo "validate manually in GitHub"`
- No syntax errors in the file: `cat .github/workflows/ci.yml` renders correctly
- `npm run ci` passes locally with the required env vars set

#### Manual Verification

- Push the workflow file to a branch, open a PR, and confirm the `ci` check appears and turns green
- Confirm `.next/cache` is NOT included in the uploaded artifact (check artifact contents in GitHub Actions UI)
- Confirm the artifact name shows the commit SHA

**Implementation Note**: After this phase passes manual verification, proceed to Phase 2 for repository configuration.

---

## Phase 2: Repository Configuration (Manual)

### Overview

Configure GitHub repository settings to make CI a mandatory merge gate. No code changes — this phase is entirely GitHub UI steps.

### Changes Required

#### 1. GitHub Secrets

**Location**: Repository → Settings → Secrets and variables → Actions → New repository secret

Add five secrets:

| Secret name | Format | Example value |
|---|---|---|
| `DATABASE_URL` | `file:./db.sqlite` | `file:./db.sqlite` |
| `ENCRYPTION_SECRET` | 64 lowercase hex chars | `a3f...` (run `openssl rand -hex 32`) |
| `AUTH_SECRET` | any string ≥ 32 chars | `a3f...` (run `openssl rand -base64 32`) |
| `AUTH_ADMIN_EMAIL` | valid email | `admin@example.com` |
| `AUTH_ADMIN_PASSWORD` | string | any strong password |

`ENCRYPTION_SECRET` must be exactly 64 hex characters (32 bytes). The Zod schema in `src/env.js` enforces this and `next build` will fail if the value is wrong length or contains non-hex chars.

#### 2. Branch protection rule

**Location**: Repository → Settings → Branches → Add branch protection rule

- Branch name pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - Add required check: `ci` (type it exactly — this matches the job name in the workflow)
- ✅ Require branches to be up to date before merging

### Success Criteria

#### Automated Verification

- (none — this phase is GitHub UI configuration)

#### Manual Verification

- Open a test PR; the merge button is greyed out until the `ci` check passes
- Force a lint failure (introduce a biome violation), push to the PR branch, confirm the check fails and blocks merge
- Revert the failure, confirm CI turns green and merge is unblocked
- On a successful merge to `main`, confirm a `nextjs-build-<sha>` artifact appears in the Actions run

---

## Testing Strategy

### Unit / Integration Tests

Already covered by the existing test suite (`npm run vitest`). No new tests are added in this slice — CI wires what exists, it does not introduce new test surface.

### Manual Testing Steps

1. Push the workflow YAML to a feature branch and open a PR
2. Confirm the Actions run appears and all steps complete green
3. Add a deliberate biome error to a file, push, confirm CI fails
4. Revert, confirm CI passes again
5. Merge to `main`; confirm artifact appears in the completed Actions run

## Migration Notes

No application code changes. No database schema changes.

## References

- `package.json:10` — `ci` script definition
- `src/test/setup.ts` — Vitest env var injection (no secrets needed for test step)
- `context/foundation/tech-stack.md` — `ci_provider: github-actions`
- `context/foundation/roadmap.md` — S-06

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: GitHub Actions Workflow

#### Automated

- [x] 1.1 `npm run ci` passes locally with required env vars set — 00e1002
- [x] 1.2 Workflow YAML renders without syntax errors — 00e1002

#### Manual

- [x] 1.3 Push to a branch; `ci` check appears in PR and turns green — b71030f
- [x] 1.4 `.next/cache` is not included in the uploaded artifact — b71030f
- [x] 1.5 Artifact name shows the commit SHA — b71030f

### Phase 2: Repository Configuration

#### Automated

_(none)_

#### Manual

- [x] 2.1 All 5 GitHub Secrets added to repository settings — manual
- [ ] 2.2 Branch protection rule on `main` requires the `ci` check — skipped (requires GitHub Team plan)
- [x] 2.3 A test PR is blocked by a failing CI check and unblocked when it passes — b71030f
- [x] 2.4 Successful `main` merge produces a `nextjs-build-<sha>` artifact — b71030f
