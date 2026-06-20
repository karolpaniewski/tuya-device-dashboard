// Hardcoded for now — every query that lists devices/rooms/gateways for display
// filters to this source. Real hardware stays in the DB untouched; flip this to
// "real" (or replace with a per-request lookup) when a Demo/Real toggle UI ships.
export const ACTIVE_DEVICE_SOURCE = "demo" as const;
