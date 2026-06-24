function clampPct(value: number): number {
	return Math.min(100, Math.max(0, value));
}

/**
 * Converts a drop event's client coordinates into a clamped percentage pair
 * relative to the given container rect. A drop slightly outside the
 * container's bounds still lands at the nearest edge rather than erroring.
 */
export function dropPositionToPercent(
	clientX: number,
	clientY: number,
	containerRect: DOMRect,
): { xPct: number; yPct: number } {
	const xPct = ((clientX - containerRect.left) / containerRect.width) * 100;
	const yPct = ((clientY - containerRect.top) / containerRect.height) * 100;
	return { xPct: clampPct(xPct), yPct: clampPct(yPct) };
}
