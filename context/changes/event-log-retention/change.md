---
id: event-log-retention
title: Event log retention purge
status: implementing
created: 2026-06-30
updated: 2026-06-30
roadmap_id: ~
---

Add a retention purge job for event_log — analogous to the existing
purgeOldReadings() in tuya-poller.ts. Rows older than 30 days deleted
every ~30 min via the existing poll-counter gate.
