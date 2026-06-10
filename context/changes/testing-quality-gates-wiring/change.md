---
change_id: testing-quality-gates-wiring
title: Wire quality gates (lint, typecheck, Vitest) as required CI floor
status: implemented
created: 2026-06-10
updated: 2026-06-10
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Quality gates wiring".
Risks covered: cross-cutting (all five risks — #1 auth-gate, #2 worker stale-state, #3 crypto, #4 command pipeline, #5 scoring).
Test types planned: gates (lint, typecheck, Vitest) — naming and wiring only, no YAML authoring.
Risk response intent:
- Cross-cutting: prove that the gates wired in Phases 1–3 actually run on every PR — lint + typecheck + Vitest unit/integration suite must all be required gates; CI must not allow a merge that skips any of these; the post-edit hook (Vitest) should be documented as the recommended local gate.
After creating the folder, follow the downstream continuation rule (proceed directly to /10x-research).
