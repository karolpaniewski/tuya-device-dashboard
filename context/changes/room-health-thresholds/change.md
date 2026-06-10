---
id: room-health-thresholds
title: Room Health Thresholds
status: implemented
created: 2026-06-10
updated: 2026-06-10
roadmap_id: S-05
---

## Goal

Wire the existing scoring infrastructure into the user-visible UI. Add `getThreshold` / `setThreshold` tRPC procedures, harden the scoring fallback to use hardcoded global defaults (18–24 °C, gap 3 °C) and minimum-temperature multi-sensor aggregation, surface OK / Too Cold / Too Hot badges and anomaly suggestions in the dashboard's room headers, and provide inline threshold configuration per room in the `/setup` page.

## PRD refs

FR-004, Business Logic

## Prerequisites

F-01 (auth-scaffold) — complete  
F-02 (device-schema) — complete  
S-01 (live-device-overview) — complete  
S-02 (room-assignment-setup) — complete
