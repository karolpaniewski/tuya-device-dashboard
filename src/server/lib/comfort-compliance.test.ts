import { describe, expect, it } from "vitest";

import {
	type ComplianceBucket,
	computeRoomCompliance,
} from "./comfort-compliance";

// Expected values below come from the plan's contract (comfort-compliance-ranking
// plan.md, Phase 1 §1-2) — not from inspecting function output.
// Badge rule reused from scoreRoom: temp < minTempC → "Too Cold"; temp > maxTempC
// → "Too Hot"; else "OK". Null buckets are excluded from the % denominator but
// still count toward day-coverage grouping as "no data for that hour."

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const THRESHOLDS = { minTempC: 18, maxTempC: 24 };

function buildBuckets(values: (number | null)[]): ComplianceBucket[] {
	return values.map((temperatureC, i) => ({
		bucketStartMs: i * HOUR_MS,
		temperatureC,
	}));
}

describe("computeRoomCompliance", () => {
	it("all-OK room → 0% out of threshold, no severity stat, full 7-day coverage", () => {
		const buckets = buildBuckets(Array<number>(168).fill(21));
		const result = computeRoomCompliance(buckets, THRESHOLDS);
		expect(result.pctOutOfThreshold).toBe(0);
		expect(result.avgDegreesOffThreshold).toBeNull();
		expect(result.daysWithData).toBe(7);
	});

	it("all-cold room → 100% out of threshold, correct avg degrees-off", () => {
		// 15°C is 3°C below the 18°C minimum in every bucket.
		const buckets = buildBuckets(Array<number>(168).fill(15));
		const result = computeRoomCompliance(buckets, THRESHOLDS);
		expect(result.pctOutOfThreshold).toBe(100);
		expect(result.avgDegreesOffThreshold).toBeCloseTo(3);
		expect(result.daysWithData).toBe(7);
	});

	it("all-hot room → 100% out of threshold, correct avg degrees-off", () => {
		// 27°C is 3°C above the 24°C maximum in every bucket.
		const buckets = buildBuckets(Array<number>(168).fill(27));
		const result = computeRoomCompliance(buckets, THRESHOLDS);
		expect(result.pctOutOfThreshold).toBe(100);
		expect(result.avgDegreesOffThreshold).toBeCloseTo(3);
		expect(result.daysWithData).toBe(7);
	});

	it("mixed buckets → % and avg-off computed only over violating buckets", () => {
		// Half the week (84h) in range at 21°C, half (84h) too cold at 16°C
		// (2°C below the 18°C minimum).
		const values = [
			...Array<number>(84).fill(21),
			...Array<number>(84).fill(16),
		];
		const buckets = buildBuckets(values);
		const result = computeRoomCompliance(buckets, THRESHOLDS);
		expect(result.pctOutOfThreshold).toBeCloseTo(50);
		expect(result.avgDegreesOffThreshold).toBeCloseTo(2);
		expect(result.daysWithData).toBe(7);
	});

	it("null-threshold room → both stats null, day-coverage still computed", () => {
		const buckets = buildBuckets(Array<number>(168).fill(21));
		const result = computeRoomCompliance(buckets, {
			minTempC: null,
			maxTempC: 24,
		});
		expect(result.pctOutOfThreshold).toBeNull();
		expect(result.avgDegreesOffThreshold).toBeNull();
		expect(result.daysWithData).toBe(7);
	});

	it("zero-data room → both stats null, daysWithData 0", () => {
		const buckets = buildBuckets(Array<null>(168).fill(null));
		const result = computeRoomCompliance(buckets, THRESHOLDS);
		expect(result.pctOutOfThreshold).toBeNull();
		expect(result.avgDegreesOffThreshold).toBeNull();
		expect(result.daysWithData).toBe(0);
	});

	it("partial-coverage room (data on 4 of 7 days) → daysWithData 4, % over existing buckets only", () => {
		// Data only in the first 96 hours (4 calendar days), the rest is a gap.
		const values = [
			...Array<number>(96).fill(21),
			...Array<null>(72).fill(null),
		];
		const buckets = buildBuckets(values);
		const result = computeRoomCompliance(buckets, THRESHOLDS);
		expect(result.daysWithData).toBe(4);
		expect(result.pctOutOfThreshold).toBe(0);
		expect(result.avgDegreesOffThreshold).toBeNull();
	});

	it("day-coverage groups by UTC calendar day, not by bucket count", () => {
		// One non-null bucket in each of days 0, 2, and 5 (of a 0-6 index range) →
		// 3 distinct covered days, regardless of the 4 total non-null buckets.
		const buckets: ComplianceBucket[] = [
			{ bucketStartMs: 0 * DAY_MS + 1 * HOUR_MS, temperatureC: 21 },
			{ bucketStartMs: 0 * DAY_MS + 5 * HOUR_MS, temperatureC: 21 },
			{ bucketStartMs: 2 * DAY_MS + 3 * HOUR_MS, temperatureC: 21 },
			{ bucketStartMs: 5 * DAY_MS + 10 * HOUR_MS, temperatureC: 21 },
		];
		const result = computeRoomCompliance(buckets, THRESHOLDS);
		expect(result.daysWithData).toBe(3);
	});
});
