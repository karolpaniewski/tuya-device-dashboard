---
id: cicd-pipeline
title: CI/CD pipeline
status: implementing
updated: 2026-06-10
roadmap_id: S-06
---

Wire the existing `npm run ci` script into GitHub Actions so every PR and push to main runs biome + typecheck + vitest + next build automatically, with the build artifact uploaded on main.
