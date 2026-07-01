import { scoreRoom } from "~/server/lib/scoring";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ComplianceBucket {
	bucketStartMs: number;
	temperatureC: number | null;
}

export interface RoomComplianceThresholds {
	minTempC: number | null;
	maxTempC: number | null;
}

export interface RoomComplianceResult {
	pctOutOfThreshold: number | null;
	avgDegreesOffThreshold: number | null;
	daysWithData: number;
}

export function computeRoomCompliance(
	buckets: ComplianceBucket[],
	thresholds: RoomComplianceThresholds,
): RoomComplianceResult {
	const daysWithData = new Set(
		buckets
			.filter((b) => b.temperatureC !== null)
			.map((b) => Math.floor(b.bucketStartMs / DAY_MS)),
	).size;

	if (thresholds.minTempC === null || thresholds.maxTempC === null) {
		return {
			pctOutOfThreshold: null,
			avgDegreesOffThreshold: null,
			daysWithData,
		};
	}

	let nonNullCount = 0;
	let outOfThresholdCount = 0;
	let degreesOffSum = 0;

	for (const bucket of buckets) {
		if (bucket.temperatureC === null) continue;
		nonNullCount++;

		const { badge } = scoreRoom(bucket.temperatureC, null, {
			minTempC: thresholds.minTempC,
			maxTempC: thresholds.maxTempC,
			anomalyGapC: null,
		});
		if (badge === "OK" || badge === null) continue;

		outOfThresholdCount++;
		degreesOffSum +=
			badge === "Too Cold"
				? thresholds.minTempC - bucket.temperatureC
				: bucket.temperatureC - thresholds.maxTempC;
	}

	return {
		pctOutOfThreshold:
			nonNullCount === 0 ? null : (outOfThresholdCount / nonNullCount) * 100,
		avgDegreesOffThreshold:
			outOfThresholdCount === 0 ? null : degreesOffSum / outOfThresholdCount,
		daysWithData,
	};
}
