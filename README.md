# Tuya Device Dashboard

A LAN-only web dashboard for small facility teams that replaces one-by-one device management in the Tuya mobile app. Provides a live device overview grouped by room, per-room temperature health monitoring, floor-plan map view, automation modes with scheduling, and a persistent event log.

## What it does

- **Live device overview** — polls Tuya gateways every 30 s over LAN; shows each room's temperature, setpoint, valve state, and health badge (OK / Too Cold / Too Hot)
- **Temperature thresholds** — per-room min/max/anomaly configuration with a site-wide fallback; email alerts via Resend when a room enters a violation
- **Automation modes** — named modes with room-level valve targeting, day-of-week scheduling, and a flow-chart editor for bulk room assignment
- **Floor-plan map** — drag devices onto a site floor-plan image to see their physical placement
- **Event log** — `/events` page showing the last 24 h of domain events (heat toggles, threshold breaches, connectivity changes, sent email alerts) with room/device filtering

## Tech stack

Next.js 15 · React 19 · tRPC v11 · Drizzle ORM + libsql (SQLite) · NextAuth v5 · Tailwind CSS · Biome · Vitest

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | SQLite file path, e.g. `file:./db.sqlite` |
| `AUTH_SECRET` | yes | Random 32-byte hex — run `openssl rand -hex 32` |
| `AUTH_ADMIN_EMAIL` | yes | Login email for the seeded admin account |
| `AUTH_ADMIN_PASSWORD` | yes | Login password for the seeded admin account |
| `ENCRYPTION_SECRET` | yes | 64-char hex for AES-256-GCM local-key encryption — run `openssl rand -hex 32` |
| `RESEND_API_KEY` | no | Resend API key for real alert emails |
| `EMAIL_FROM` | no | Sender address, e.g. `alerts@yourdomain.com` |
| `EMAIL_STUB` | no | Set `true` to log alert emails instead of sending them |
| `APP_BASE_URL` | no | Base URL included in alert email links |

### 3. Run migrations and seed

```bash
npm run db:migrate   # apply all schema migrations
npm run db:seed      # create the admin account and a default site
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected to `/login`.

### Default credentials

Use the values you set in `AUTH_ADMIN_EMAIL` / `AUTH_ADMIN_PASSWORD`. The defaults in `.env.example` are:

```
Email:    admin@company.local
Password: change-me-on-first-login
```

## Available scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Production build |
| `npm run ci` | Full check — biome + tsc + vitest + next build |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed admin account and default site |
| `npm run db:seed:demo` | Seed demo devices (no real hardware needed) |
| `npm run db:studio` | Open Drizzle Studio to browse the database |
| `npm run test` | Run Vitest test suite |

## Project structure

```
src/
  app/                   # Next.js App Router pages
    events/              # Event log page
    automation-flow/     # Flow-chart mode editor
    map/                 # Floor-plan map view
    setup/               # Device/room/gateway configuration
  server/
    api/routers/         # tRPC procedures (room, device, event, mode, …)
    db/                  # Drizzle schema + migrations
    lib/                 # Business logic (scoring, alert-control, crypto, …)
    workers/             # Tuya polling loop + automation scheduler
context/foundation/      # PRD, test plan, roadmap, and shaping docs
```
