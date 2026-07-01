/**
 * Canonical widget ids + default order for the dashboard summary row.
 * Shared between the server router (default-shape fallback) and the
 * client overview component (WIDGET_DEFINITIONS), since device-overview.tsx
 * is a client component and can't import the tRPC router module directly.
 */
export const DEFAULT_WIDGET_ORDER = [
	"kpi-devices",
	"kpi-avg-temp",
	"kpi-alerts",
	"kpi-rooms-ok",
	"kpi-modes",
	"kpi-by-room",
	"room-temp-panel",
	"comfort-compliance-ranking",
] as const;

/**
 * Merges ids present in `defaults` but missing from a saved `order` (e.g. a
 * widget added after the layout was last saved) back in at their position
 * relative to the nearest preceding default id, instead of leaving them to
 * land wherever a generic "append unknown ids at the end" merge would put
 * them — which would visually orphan a new KPI card outside the KPI row.
 */
export function mergeMissingDefaultIds(
	order: string[],
	defaults: readonly string[] = DEFAULT_WIDGET_ORDER,
): string[] {
	const result = [...order];
	const present = new Set(result);
	let anchor: string | null = null;

	for (const id of defaults) {
		if (present.has(id)) {
			anchor = id;
			continue;
		}
		const insertAt = anchor ? result.indexOf(anchor) + 1 : 0;
		result.splice(insertAt, 0, id);
		present.add(id);
		anchor = id;
	}

	return result;
}
