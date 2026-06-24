import { describe, expect, it } from "vitest";

import { dropPositionToPercent } from "./map-coordinates";

function rect(
	left: number,
	top: number,
	width: number,
	height: number,
): DOMRect {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON: () => "",
	} as DOMRect;
}

describe("dropPositionToPercent", () => {
	it("in-bounds: maps a point inside the container to its percentage position", () => {
		const result = dropPositionToPercent(50, 25, rect(0, 0, 100, 100));
		expect(result).toEqual({ xPct: 50, yPct: 25 });
	});

	it("negative offset: clamps to 0 when the drop lands left/above the container", () => {
		const result = dropPositionToPercent(-10, -5, rect(0, 0, 100, 100));
		expect(result).toEqual({ xPct: 0, yPct: 0 });
	});

	it("over-100: clamps to 100 when the drop lands right/below the container", () => {
		const result = dropPositionToPercent(150, 120, rect(0, 0, 100, 100));
		expect(result).toEqual({ xPct: 100, yPct: 100 });
	});

	it("accounts for a non-zero container offset", () => {
		const result = dropPositionToPercent(60, 60, rect(20, 20, 80, 80));
		expect(result).toEqual({ xPct: 50, yPct: 50 });
	});
});
