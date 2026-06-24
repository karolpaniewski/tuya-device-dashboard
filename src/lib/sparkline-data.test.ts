import { describe, expect, it } from "vitest";

import { downsampleAverage } from "./sparkline-data";

describe("downsampleAverage", () => {
	it("returns the input unchanged when already at or below the target count", () => {
		expect(downsampleAverage([1, 2, 3], 5)).toEqual([1, 2, 3]);
		expect(downsampleAverage([1, 2, 3], 3)).toEqual([1, 2, 3]);
	});

	it("averages evenly-divisible buckets", () => {
		// 6 values, 3 buckets of 2 → [avg(1,2), avg(3,4), avg(5,6)]
		expect(downsampleAverage([1, 2, 3, 4, 5, 6], 3)).toEqual([1.5, 3.5, 5.5]);
	});

	it("handles a non-evenly-divisible length without dropping values", () => {
		const result = downsampleAverage([1, 2, 3, 4, 5], 2);
		expect(result).toHaveLength(2);
		// every input value must land in exactly one bucket
		expect(result[0]).toBeCloseTo((1 + 2) / 2, 5);
	});

	it("smooths a noisy small-range series toward its overall trend", () => {
		const noisy = [19.0, 19.4, 19.1, 19.5, 19.2, 20.0, 19.8, 20.2];
		const result = downsampleAverage(noisy, 2);
		expect(result).toHaveLength(2);
		expect(result[0]).toBeLessThan(result[1] as number);
	});
});
