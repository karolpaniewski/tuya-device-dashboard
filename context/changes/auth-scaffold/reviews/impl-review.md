<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Scaffold — email/password login

- **Plan**: context/changes/auth-scaffold/plan.md
- **Scope**: All phases (1–6 of 6)
- **Date**: 2026-06-08
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  4 warnings  5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Open redirect via unvalidated callbackUrl

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/login/actions.ts:21
- **Detail**: `callbackUrl` read from FormData without validation, passed directly to `redirect()`. Attacker can set value to absolute URL, redirecting user after login to external site. Auth.js validates callbackUrl when it manages redirects but this is bypassed via `redirect: false` + manual `redirect(callbackUrl)`.
- **Fix A ⭐ Recommended**: Validate `rawUrl.startsWith("/") ? rawUrl : "/"`
  - Strength: Eliminates the class entirely; trivial change, no UX impact.
  - Tradeoff: None — absolute URLs in callbackUrl are never legitimate here.
  - Confidence: HIGH — Auth.js itself applies this same check internally.
  - Blind spot: None significant.
- **Fix B**: Delegate redirect to Auth.js (remove redirect:false)
  - Strength: Uses Auth.js trusted-origins list, zero custom code.
  - Tradeoff: Requires rework of error handling in actions.ts.
  - Confidence: MED — needs retesting of error path.
  - Blind spot: callbackUrl validation behavior between beta versions.
- **Decision**: FIXED via Fix A

### F2 — session.user.id relies on undocumented JWT→session default mapping

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/server/auth.ts:11–53
- **Detail**: Session augmented with `user.id: string` but no explicit jwt/session callbacks wire user.id → token.sub → session.user.id. Current Auth.js v5 beta does this by default, but Auth.js docs explicitly recommend explicit callbacks when id is needed in session — this default has changed across beta versions. Future slice procedures (S-01→S-05) will dereference session.user.id as device owner key.
- **Fix**: Add explicit jwt + session callbacks to make the contract stable.
  - Strength: Makes mapping explicit and version-stable; matches Auth.js docs recommendation; 6 lines.
  - Tradeoff: Spreads authConfig.callbacks — slight coupling.
  - Confidence: HIGH — documented approach in Auth.js v5 docs.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 — seed.ts lacks try/catch; client.close() skipped on error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/server/db/seed.ts:27–35
- **Detail**: bcryptjs.hash() and Drizzle insert are top-level await calls with no try/catch. On DB lock (e.g., dev server running), script throws unhandled exception and client.close() is never called.
- **Fix**: Wrap hash + insert in try/catch/finally to guarantee client.close().
- **Decision**: FIXED

### F4 — Biome check fails with 8 auto-fixable errors

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/login/page.tsx, src/app/login/actions.ts, src/server/auth.ts
- **Detail**: `npm run check` exits non-zero: 5× nursery/useSortedClasses, 2× assist/useSortedAttributes, 2× assist/organizeImports. All auto-fixable. Existing scaffold files were clean against this Biome config.
- **Fix**: `npm run check:write` — auto-fixes all 8 issues in one command.
- **Decision**: FIXED

### F5 — Layout.tsx provider nesting inverted vs plan

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/layout.tsx
- **Detail**: Plan said TRPCReactProvider outer, SessionProvider inner. Actual: SessionProvider outer, TRPCReactProvider inner. No functional difference — neither provider depends on the other's context.
- **Fix**: Switch nesting order to match plan.
- **Decision**: FIXED

### F6 — db:seed adds --env-file=.env (beneficial deviation from plan)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package.json
- **Detail**: Plan specified `tsx src/server/db/seed.ts`; actual is `tsx --env-file=.env src/server/db/seed.ts`. The flag is necessary — without it tsx doesn't load .env and seed always fails on env guards. Improvement over the plan.
- **Decision**: ACCEPTED-AS-RULE: tsx scripts require --env-file for .env loading

### F7 — Default .env password identical to .env.example placeholder

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .env (gitignored) / src/env.js
- **Detail**: AUTH_ADMIN_PASSWORD="change-me-on-first-login" passes z.string().min(8) and db:seed will create a real admin with this known value. LAN context and gitignore limit exposure.
- **Decision**: SKIPPED

### F8 — Empty password string accepted by credentials schema

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/server/auth.ts:21
- **Detail**: `password: z.string()` accepts "". bcryptjs.compare("", hash) runs constant-time comparison — no bypass. But empty submission still hits DB query and bcrypt compare unnecessarily.
- **Fix**: `z.string().min(1)` to short-circuit before hitting the DB.
- **Decision**: FIXED

### F9 — Middleware matcher doesn't exclude public/ assets

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:7
- **Detail**: Correct for current scope (no public assets beyond favicon.ico which is excluded). If F-02 or later slice adds logo/manifest to public/, they would be auth-gated and return /login redirect.
- **Decision**: SKIPPED
