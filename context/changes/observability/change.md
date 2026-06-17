---
id: observability
title: Observability infrastructure
status: implemented
updated: 2026-06-17
roadmap_id: S-07
---

Replace raw `console.*` calls in production runtime code (tRPC middleware, routers, Tuya poller/scheduler/real-client) with structured Pino logging that carries request/user/device context automatically, redacts `localKey`/`passwordHash` by path, and optionally writes a rotated, retention-capped file on disk when `LOG_DIR` is configured for the self-hosted LAN deployment.
