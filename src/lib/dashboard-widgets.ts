/**
 * Canonical widget ids + default order for the dashboard summary row.
 * Shared between the server router (default-shape fallback) and the
 * client overview component (WIDGET_DEFINITIONS), since device-overview.tsx
 * is a client component and can't import the tRPC router module directly.
 */
export const DEFAULT_WIDGET_ORDER = [
	"kpi-devices",
	"kpi-avg-temp",
	"kpi-rooms-ok",
	"kpi-alerts",
	"kpi-by-room",
	"room-temp-panel",
] as const;
