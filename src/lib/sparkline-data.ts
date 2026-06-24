/**
 * Averages `values` down to at most `targetCount` buckets, preserving order.
 * Smooths sample-to-sample jitter that would otherwise dominate a sparkline's
 * full vertical range when auto-scaled to a small min/max span.
 */
export function downsampleAverage(
	values: number[],
	targetCount: number,
): number[] {
	if (values.length <= targetCount || targetCount <= 0) return values;

	const bucketSize = values.length / targetCount;
	const result: number[] = [];
	for (let i = 0; i < targetCount; i++) {
		const start = Math.floor(i * bucketSize);
		const end = Math.max(Math.floor((i + 1) * bucketSize), start + 1);
		const bucket = values.slice(start, end);
		result.push(bucket.reduce((sum, v) => sum + v, 0) / bucket.length);
	}
	return result;
}
