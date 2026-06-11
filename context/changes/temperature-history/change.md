---
id: temperature-history
title: Historical temperature data (S-09)
status: implemented
created: 2026-06-11
updated: 2026-06-11
roadmap_id: S-09
---

Persist temperature + setpoint readings to SQLite, expose a tRPC endpoint with
server-side bucketing, and render a modal line-chart (Recharts) reachable from
every device card. Retention: 30 days; purge co-located with the polling worker.
