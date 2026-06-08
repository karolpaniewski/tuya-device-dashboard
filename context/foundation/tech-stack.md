---
starter_id: t3
package_manager: npm
project_name: tuya-device-dashboard
hints:
  language_family: js
  team_size: solo
  deployment_target: vercel
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: true
  self_check_answers:
    typed: false
    from_official_starter: false
    conventions: false
    docs_current: false
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Solo developer building a LAN-only Tuya device dashboard in TypeScript. Custom path because the registry's recommended default (10x-astro-starter) is categorically incompatible — Supabase requires cloud access and Cloudflare Pages cannot run a persistent polling process, both of which are hard PRD requirements. t3 (Next.js + Drizzle + NextAuth + Tailwind) was chosen over bare Next.js for its batteries: NextAuth covers FR-001 (login), Drizzle with SQLite covers local config persistence with no cloud dependency, and tRPC provides typed end-to-end contracts. Initial deployment targets Vercel for development convenience; production deployment migrates to a self-hosted Node.js server on the company LAN, which supports Next.js natively. The 30-second device polling loop runs as a persistent side-process alongside the Next.js custom server. Self-check came back 0/5 — the stack is new territory; quality_override is recorded and agent guidance will be needed for Next.js App Router, tRPC, and Drizzle conventions.
