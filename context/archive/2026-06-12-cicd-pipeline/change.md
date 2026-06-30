---
id: cicd-pipeline
title: CI/CD pipeline
status: archived
archived_at: 2026-06-30T12:10:47Z
created: 2026-06-12
updated: 2026-06-30
roadmap_id: S-06
---

Wire the existing `npm run ci` script into GitHub Actions so every PR and push to main runs biome + typecheck + vitest + next build automatically, with the build artifact uploaded on main.
