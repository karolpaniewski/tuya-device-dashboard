---
change_id: testing-valve-control-scoring
title: Valve control + threshold scoring tests (Phase 3 rollout)
status: implemented
created: 2026-06-09
updated: 2026-06-10
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Valve control + threshold scoring".
Risks covered: Risk #4 (komenda setpoint do złego DP code lub bez potwierdzenia → zawór zablokowany, użytkownik nie widzi błędu), Risk #5 (scoring progów temperaturowych produkuje zły badge lub brakujący alert).
Test types planned: unit (scoring), integration (command pipeline), smoke z hardware.
Risk response intent:
- Risk #4: prove FR-012 command feedback contract — komenda z nieznanym DP code musi być flagowana jako "unsupported" zanim wysłana; failed command → specyficzny błąd w UI, nie silence; HTTP 200 ≠ fizyczna zmiana na urządzeniu.
- Risk #5: prove scoreRoom(sensors, setpoint, thresholds) z known inputs → expected badge (OK/Too Cold/Too Hot); edge: brak sensorów w pokoju → brak badge, nie error; multi-sensor → agregacja worst-case zgodna z PRD; nie assert output = co funkcja teraz zwraca (implementation mirror anti-pattern).
