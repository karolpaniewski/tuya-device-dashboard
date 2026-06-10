import { describe, expect, it } from "vitest";

import { scoreRoom } from "./scoring";

// Expected values below come from PRD §FR-012 — not from inspecting function output.
// Badge rule: temp < minTempC → "Too Cold"; temp > maxTempC → "Too Hot"; else "OK".
// Null rule:  temperatureC null OR minTempC null OR maxTempC null → badge null, anomaly false.
// Anomaly rule: temp < (setpointC − anomalyGapC) when both non-null; else anomaly false.

const BASE = { minTempC: 18, maxTempC: 24, anomalyGapC: 3 };

describe("scoreRoom — badge (PRD §FR-012)", () => {
	it("below min → Too Cold", () => {
		const result = scoreRoom(15, null, BASE);
		expect(result.badge).toBe("Too Cold");
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});

	it("above max → Too Hot", () => {
		const result = scoreRoom(26, null, BASE);
		expect(result.badge).toBe("Too Hot");
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});

	it("in range → OK", () => {
		const result = scoreRoom(21, null, BASE);
		expect(result.badge).toBe("OK");
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});

	it("at min boundary → OK (inclusive)", () => {
		const result = scoreRoom(18, null, BASE);
		expect(result.badge).toBe("OK");
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});

	it("at max boundary → OK (inclusive)", () => {
		const result = scoreRoom(24, null, BASE);
		expect(result.badge).toBe("OK");
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});
});

describe("scoreRoom — null suppression", () => {
	it("no sensor reading → badge null, anomaly false", () => {
		const result = scoreRoom(null, null, BASE);
		expect(result.badge).toBeNull();
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});

	it("all thresholds null → badge null, anomaly false", () => {
		const result = scoreRoom(21, null, {
			minTempC: null,
			maxTempC: null,
			anomalyGapC: null,
		});
		expect(result.badge).toBeNull();
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});

	it("partial null threshold (minTempC null) → badge null, anomaly false", () => {
		const result = scoreRoom(21, null, {
			minTempC: null,
			maxTempC: 24,
			anomalyGapC: 3,
		});
		expect(result.badge).toBeNull();
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});
});

describe("scoreRoom — anomaly detection", () => {
	it("anomaly triggered: 15 < (20−3)=17 → anomaly true, badge Too Cold", () => {
		const result = scoreRoom(15, 20, BASE);
		expect(result.badge).toBe("Too Cold");
		expect(result.anomaly).toBe(true);
		expect(result.suggestion).not.toBeNull();
	});

	it("anomaly not triggered: 18 >= (20−3)=17 → anomaly false, badge OK", () => {
		const result = scoreRoom(18, 20, BASE);
		expect(result.badge).toBe("OK");
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});

	it("anomaly suppressed when setpointC null → anomaly false", () => {
		const result = scoreRoom(15, null, BASE);
		expect(result.badge).toBe("Too Cold");
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});

	it("anomaly suppressed when anomalyGapC null → anomaly false", () => {
		const result = scoreRoom(15, 20, {
			minTempC: 18,
			maxTempC: 24,
			anomalyGapC: null,
		});
		expect(result.badge).toBe("Too Cold");
		expect(result.anomaly).toBe(false);
		expect(result.suggestion).toBeNull();
	});
});
