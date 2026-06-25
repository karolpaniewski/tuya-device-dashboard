import { describe, expect, it } from "vitest";

import {
	angleToSetpoint,
	arcPath,
	dialColor,
	pointerToAngle,
	polarPoint,
	setpointToFraction,
	setpointToSweepAngle,
} from "./dial-math";

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

describe("angleToSetpoint", () => {
	it("the sweep start (210°) maps to min", () => {
		expect(angleToSetpoint(210, 5, 35, 0.5)).toBe(5);
	});

	it("the sweep end (150°, i.e. 510° mod 360) maps to max", () => {
		expect(angleToSetpoint(150, 5, 35, 0.5)).toBe(35);
	});

	it("top of the dial (0°) is the sweep midpoint", () => {
		expect(angleToSetpoint(0, 5, 35, 0.5)).toBe(20);
	});

	it("a dead-zone angle past the gap's midpoint (200°) snaps to min", () => {
		expect(angleToSetpoint(200, 5, 35, 0.5)).toBe(5);
	});

	it("a dead-zone angle before the gap's midpoint (160°) snaps to max", () => {
		expect(angleToSetpoint(160, 5, 35, 0.5)).toBe(35);
	});

	it("rounds a raw value to the nearest step", () => {
		// pos = 273-210 = 63, f = 0.21, raw = 5 + 0.21*30 = 11.3 -> nearest 0.5 step is 11.5
		expect(angleToSetpoint(273, 5, 35, 0.5)).toBe(11.5);
	});
});

describe("setpointToSweepAngle / setpointToFraction", () => {
	it("min maps to the sweep start (210°) and fraction 0", () => {
		expect(setpointToSweepAngle(5, 5, 35)).toBe(210);
		expect(setpointToFraction(5, 5, 35)).toBe(0);
	});

	it("max maps to the sweep end (510°) and fraction 1", () => {
		expect(setpointToSweepAngle(35, 5, 35)).toBe(510);
		expect(setpointToFraction(35, 5, 35)).toBe(1);
	});

	it("the midpoint maps to 360° and fraction 0.5", () => {
		expect(setpointToSweepAngle(20, 5, 35)).toBe(360);
		expect(setpointToFraction(20, 5, 35)).toBe(0.5);
	});

	it("clamps an out-of-range setpoint before converting", () => {
		expect(setpointToFraction(-10, 5, 35)).toBe(0);
		expect(setpointToFraction(100, 5, 35)).toBe(1);
	});
});

describe("polarPoint / arcPath", () => {
	it("0° (top) sits directly above center", () => {
		const p = polarPoint(0, 10, 50);
		expect(p.x).toBeCloseTo(50, 5);
		expect(p.y).toBeCloseTo(40, 5);
	});

	it("90° (right) sits directly right of center", () => {
		const p = polarPoint(90, 10, 50);
		expect(p.x).toBeCloseTo(60, 5);
		expect(p.y).toBeCloseTo(50, 5);
	});

	it("produces a well-formed SVG arc command", () => {
		const path = arcPath(210, 510, 138, 180);
		expect(path).toMatch(
			/^M-?\d+\.\d{2} -?\d+\.\d{2} A 138 138 0 1 1 -?\d+\.\d{2} -?\d+\.\d{2}$/,
		);
	});
});

describe("dialColor", () => {
	it("returns the cool-blue hue at min", () => {
		expect(dialColor(5, 5, 35).stroke).toBe("oklch(0.75 0.13 230.0)");
	});

	it("returns the warm-amber hue at max", () => {
		expect(dialColor(35, 5, 35).stroke).toBe("oklch(0.75 0.13 25.0)");
	});

	it("returns the sage-green hue at the midpoint", () => {
		expect(dialColor(20, 5, 35).stroke).toBe("oklch(0.75 0.13 127.5)");
	});

	it("derives glow from the same hue at higher chroma", () => {
		expect(dialColor(5, 5, 35).glow).toBe("oklch(0.72 0.17 230.0)");
	});
});
