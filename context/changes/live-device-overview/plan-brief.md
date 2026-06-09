# Live Device Overview — Plan Brief

> Full plan: `context/changes/live-device-overview/plan.md`

## What & Why

Build the north star slice: a live dashboard page that shows all discovered Tuya devices grouped by room, each with temperature, online/offline status, device type, and last-polled time. This is S-01 — the core product hypothesis. Without device data flowing end-to-end in the browser, every other slice is decorating an empty shell.

## Starting Point

F-01 and F-02 are complete: auth is wired and the domain schema (`gateways`, `devices`, `rooms`, `deviceRoomAssignments`) is in place. The home page is a placeholder. No Tuya library, no polling worker, no device API, and no device UI exists yet.

## Desired End State

After login, the user sees all devices grouped by room (plus an "Unassigned" section for unassigned devices), each card showing name, temperature (or "—"), an online/offline badge, device type label, and "last updated Xs ago". Data refreshes automatically every 30 seconds via a persistent background polling loop. In development, a stub client returns plausible fixture data without requiring real hardware or local keys.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Background worker mechanism | `instrumentation.ts` | Next.js 15 built-in, zero config change, keeps `next dev --turbo` working | Plan |
| Tuya library | `tuyapi@7.7.1` | Only production-grade Node.js Tuya LAN library on npm | Plan |
| Dev without real keys | Stub client behind interface | Allows full UI development with fixture data; clean swap path when keys arrive | Plan |
| Live state storage | In-memory Map singleton | Zero DB writes per tick; 30s restart recovery is acceptable; correct for ≤50 devices | Plan |
| Frontend refresh | react-query `refetchInterval: 30_000` | Matches existing tRPC+React Query setup; zero infrastructure changes | Plan |
| Unassigned devices | Show in "Unassigned" group | Honest system state on first run; admin can see all devices before S-02 assigns them | Plan |
| Gateway provisioning | Extend `db:seed` | Developer can run full UI with `npm run db:seed` + `npm run dev`; no manual DB steps | Plan |
| Device card content | Name + temp + online + type + last polled | User's preference; last-polled time is derivable from state store without extra columns | Plan |

## Scope

**In scope:**
- `tuyapi` installation + `TuyaGatewayClient` interface with stub + real-placeholder implementations
- In-memory device state store singleton
- `src/instrumentation.ts` — boots polling loop on Next.js startup
- `src/server/workers/tuya-poller.ts` — 30s cycle reading gateways from DB
- `device.overview` tRPC protected procedure — joins DB + state store, groups by room
- `db:seed` extension — 1 fixture gateway + 5 stub devices
- `page.tsx` rewrite + `DeviceOverview`, `RoomGroup`, `DeviceCard` components
- Remove `@ts-expect-error` in `trpc/server.ts` (self-correcting marker placed in F-02)

**Out of scope:**
- Real Tuya gateway communication (placeholder only; needs hardware + keys)
- Room assignment UI (S-02)
- Filter/search (S-03), valve control (S-04), threshold scoring (S-05)
- SSE/WebSocket, pagination, icon libraries

## Architecture / Approach

```
instrumentation.ts (Next.js startup)
    → tuya-poller.ts (setInterval 30s)
        → getTuyaClient() — StubTuyaClient or RealTuyaClient placeholder
        → decryptLocalKey(gw.localKey) before passing to real client
        → deviceStateStore.set(tuyaDeviceId, { isOnline, temperatureC, lastPolledAt })

page.tsx (server component)
    → api.device.overview.prefetch() + <HydrateClient>
        → DeviceOverview (client, useQuery refetchInterval:30s)
            → device.overview procedure
                → db LEFT JOIN devices + rooms + assignments
                → merge with deviceStateStore
                → group into rooms[] + unassigned[]
            → <RoomGroup> per room + Unassigned group
                → <DeviceCard> per device
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Tuya client abstraction + state store | Interface, stub, real-placeholder, state Map, TUYA_STUB env | None significant — pure TS |
| 2. Polling worker + instrumentation | 30s loop wired into Next.js boot | NEXT_RUNTIME guard miss breaks Edge runtime |
| 3. tRPC device router | `device.overview` procedure + @ts-expect-error removal | Drizzle LEFT JOIN shape needs careful mapping |
| 4. Seed extension | Fixture gateway + 5 devices matching stub IDs | encryptLocalKey import path from seed.ts context |
| 5. Frontend overview page | Dashboard page + 3 components, live refresh | Type inference from RouterOutputs; Tailwind Biome class sort |

**Prerequisites:** F-01 (auth), F-02 (schema), `ENCRYPTION_SECRET` in `.env`
**Estimated effort:** ~2-3 sessions, 5 phases

## Open Risks & Assumptions

- Real Tuya client is a placeholder — S-01 production validation gates on hardware + local keys (roadmap open question, user-owned)
- Room assignment is not in S-01 — first run will show all 5 devices as "Unassigned"; this is expected
- `tuyapi` protocol version 3.3 assumed; if devices use 3.4/3.5, the real client implementation will differ

## Success Criteria (Summary)

- After `npm run db:seed` + `npm run dev`, the dashboard renders 5 device cards in "Unassigned" with correct stub temperatures and online/offline states
- Cards auto-refresh every 30 seconds without a page reload
- No internet connection is required at any point
