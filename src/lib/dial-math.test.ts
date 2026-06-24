import { describe, expect, it } from "vitest";

import {
	angleToSetpoint,
	pointerToAngle,
	setpointToAngle,
	setpointToColor,
} from "./dial-math";

describe("angleToSetpoint / setpointToAngle", () => {
	it("round-trips an in-range value through angle and back", () => {
		const angle = setpointToAngle(20, 5, 35);
		expect(angleToSetpoint(angle, 5, 35, 0.5)).toBe(20);
	});

	it("clamps a below-min angle to the minimum value", () => {
		expect(angleToSetpoint(-45, 5, 35, 0.5)).toBe(5);
	});

	it("clamps an above-max angle to the maximum value", () => {
		expect(angleToSetpoint(400, 5, 35, 0.5)).toBe(35);
	});

	it("round-trips the exact max boundary without wrapping to min", () => {
		const angle = setpointToAngle(35, 5, 35);
		expect(angle).toBe(360);
		expect(angleToSetpoint(angle, 5, 35, 0.5)).toBe(35);
	});

	it("rounds a raw value to the nearest step", () => {
		// 5 + (100/360)*30 = 13.33... -> nearest 0.5 step is 13.5
		expect(angleToSetpoint(100, 5, 35, 0.5)).toBe(13.5);
	});

	it("clamps an out-of-range setpoint before converting to an angle", () => {
		expect(setpointToAngle(-10, 5, 35)).toBe(0);
		expect(setpointToAngle(100, 5, 35)).toBe(360);
	});
});

describe("pointerToAngle", () => {
	const center = { x: 50, y: 50 };

	it("12 o'clock (straight up) is 0°", () => {
		expect(
			pointerToAngle(center.x, center.y - 10, center.x, center.y),
		).toBeCloseTo(0, 5);
	});

	it("3 o'clock (straight right) is 90°", () => {
		expect(
			pointerToAngle(center.x + 10, center.y, center.x, center.y),
		).toBeCloseTo(90, 5);
	});

	it("6 o'clock (straight down) is 180°", () => {
		expect(
			pointerToAngle(center.x, center.y + 10, center.x, center.y),
		).toBeCloseTo(180, 5);
	});

	it("9 o'clock (straight left) is 270°", () => {
		expect(
			pointerToAngle(center.x - 10, center.y, center.x, center.y),
		).toBeCloseTo(270, 5);
	});
});

describe("setpointToColor", () => {
	it("returns the cool-blue stop at min", () => {
		expect(setpointToColor(5, 5, 35)).toBe("rgb(56, 189, 248)");
	});

	it("returns the warm-orange stop at max", () => {
		expect(setpointToColor(35, 5, 35)).toBe("rgb(251, 146, 60)");
	});

	it("returns an intermediate color at the midpoint", () => {
		expect(setpointToColor(20, 5, 35)).toBe("rgb(154, 168, 154)");
	});
});
