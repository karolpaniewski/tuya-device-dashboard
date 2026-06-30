# CI/CD Pipeline — Plan Brief

> Full plan: `context/changes/cicd-pipeline/plan.md`

## What & Why

Wire the existing `npm run ci` quality gate into GitHub Actions so every PR and push to `main` runs lint, typecheck, tests, and a production build automatically. The goal is to catch regressions before merge, not after — currently there is no `.github/` directory and quality checks are manual-only.

## Starting Point

`package.json` already defines `"ci": "biome check . && tsc --noEmit && vitest run && next build"` covering all four quality dimensions. Six test files exist under `src/`. No `.github/` directory exists; nothing runs in CI today.

## Desired End State

A `.github/workflows/ci.yml` exists that triggers on every PR and `main` push, runs `npm run ci` with required env vars from GitHub Secrets, caches Node modules and the Next.js build directory, and uploads a `nextjs-build-<sha>` artifact on successful `main` builds. A branch protection rule on `main` makes the `ci` check a required merge gate.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Triggers | Push to `main` + all PRs | Catch failures before and after merge | Plan |
| Node version | 22 (latest LTS) | Longest forward runway | Plan |
| Caching | npm + `.next/cache` | Faster runs without correctness risk | Plan |
| Env vars in CI | GitHub Secrets (5) | `next build` validates env via Zod at build time | Plan |
| Fail mode | Stop at first failure | Fast feedback; no wasted minutes | Plan |
| Artifact | `.next/` excl. cache on `main` | Decouples build from manual LAN deploy | Plan |
| Branch protection | Required check named `ci` | Give the gate actual teeth | Plan |

## Scope

**In scope:** workflow YAML, npm + Next.js cache setup, secrets injection, artifact upload, branch protection configuration

**Out of scope:** automated deployment to the LAN server, Docker image build, matrix builds, parallel job splitting

## Architecture / Approach

Single job (`ci`) on `ubuntu-latest`. Sequential steps: checkout → Node 22 setup with npm cache → restore `.next/cache` → `npm ci` → `npm run ci` (secrets injected here only) → upload artifact (main + success only). Branch protection is a GitHub UI step documented in Phase 2.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. GitHub Actions Workflow | `.github/workflows/ci.yml` wiring the `ci` script | `next build` may fail if env var Zod validation rejects a malformed secret value |
| 2. Repository Configuration | 5 secrets added + branch protection rule on `main` | Manual step — easy to skip; without it, the check runs but merges are never blocked |

**Prerequisites:** repository must be pushed to GitHub  
**Estimated effort:** ~1 session (workflow YAML is ~40 lines; secrets + branch protection is ~10 minutes of GitHub UI)

## Open Risks & Assumptions

- If `next build` fails with "database not found", add `npm run db:migrate` before `npm run ci` in the workflow — the fix is one line.
- `ENCRYPTION_SECRET` must be exactly 64 lowercase hex characters; a random value generated with `openssl rand -hex 32` satisfies this.

## Success Criteria (Summary)

- A PR shows a `ci` check that blocks merge until green
- A `main` merge produces a downloadable `nextjs-build-<sha>` artifact in GitHub Actions
- Forcing a lint/type/test failure causes the check to fail and blocks the PR
