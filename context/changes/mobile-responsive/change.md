# S-08 — Mobile-Responsive Layout

Make the dashboard and setup pages usable on 375px mobile viewports without horizontal scroll, with critical interactive elements meeting 44px touch-target minimums.

## Scope

- Dashboard filter bar reflows vertically on mobile
- `PageShell` header text shrinks to stay single-row on mobile
- Button and icon-button touch targets raised to ≥40px on xs breakpoint
- Setup: threshold form inputs expand full-width, room manager action row fits without overflow
- Login card gets side margins on mobile

## Out of scope

- New features or API changes
- Full mobile redesign of setup page (secondary priority — fix overflows only)
- Hamburger navigation or responsive nav pattern
- Dark-mode toggle or any other visual changes

## ID

`mobile-responsive`
