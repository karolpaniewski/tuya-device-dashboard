---
change_id: retention-purge-job
title: Retention purge job — observability + tests for the existing purge
status: implemented
created: 2026-06-25
updated: 2026-06-25
archived_at: null
---

## Notes

Originated from a roadmap risk note claiming no retention/purge job existed
for `deviceTemperatureReadings`. That claim was wrong — a 30-day purge
already shipped in `tuya-poller.ts` in the same commit as temperature-history
itself (`e10ad72`, 2026-06-11), missed by a case-sensitive grep during
research. Shaped and PRD'd against the false premise
(`context/foundation/prd-v8.md`), then corrected during `/10x-plan` once the
actual code was read. Re-scoped to the real, much smaller gap: the existing
purge has no dedicated outcome log line and no test coverage. Retention
stays at 30 days (decided during planning — already shipped/stable, shrinking
it now would only delete currently-harmless data).

See `plan.md` for the full implementation plan and `plan-brief.md` for a
two-page summary.
