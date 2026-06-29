import { describe, expect, it } from "vitest";

import { computeAutomationFlowLayout } from "./automation-flow-layout";

describe("computeAutomationFlowLayout", () => {
	it("returns empty columns when there are zero modes and zero rooms", () => {
		const layout = computeAutomationFlowLayout(0, 0);
		expect(layout.modes).toEqual([]);
		expect(layout.rooms).toEqual([]);
	});

	it("centers a single mode and a single room on y = 0", () => {
		const layout = computeAutomationFlowLayout(1, 1);
		expect(layout.modes).toEqual([{ x: 0, y: 0 }]);
		expect(layout.rooms).toEqual([{ x: 400, y: 0 }]);
	});

	it("centers an even-length room column symmetrically around y = 0", () => {
		const layout = computeAutomationFlowLayout(0, 4);
		const ys = layout.rooms.map((p) => p.y);
		expect(ys).toEqual([-150, -50, 50, 150]);
		expect(ys.reduce((a: number, b: number) => a + b, 0)).toBe(0);
	});

	it("centers an odd-length mode column symmetrically around y = 0, with a true center item", () => {
		const layout = computeAutomationFlowLayout(3, 0);
		const ys = layout.modes.map((p) => p.y);
		expect(ys).toEqual([-100, 0, 100]);
	});

	it("centers each column independently of the other column's length", () => {
		const layout = computeAutomationFlowLayout(3, 1);
		expect(layout.modes.map((p) => p.y)).toEqual([-100, 0, 100]);
		expect(layout.rooms).toEqual([{ x: 400, y: 0 }]);
	});
});
