import { describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
// Without these, importing route.ts triggers ~/server/auth and ~/server/db
// which fire ~/env Zod validation against the real env vars.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { validateFloorPlanUpload } from "./route";

function makeFile(type: string, sizeBytes: number): File {
	return new File([new Uint8Array(sizeBytes)], "floor-plan", { type });
}

describe("validateFloorPlanUpload", () => {
	it("accepts a PNG under 5MB", () => {
		const result = validateFloorPlanUpload(makeFile("image/png", 1024));
		expect(result.valid).toBe(true);
	});

	it("accepts a JPEG under 5MB", () => {
		const result = validateFloorPlanUpload(makeFile("image/jpeg", 1024));
		expect(result.valid).toBe(true);
	});

	it("accepts a file exactly at the 5MB cap", () => {
		const result = validateFloorPlanUpload(
			makeFile("image/png", 5 * 1024 * 1024),
		);
		expect(result.valid).toBe(true);
	});

	it("rejects an unsupported mime type", () => {
		const result = validateFloorPlanUpload(makeFile("image/gif", 1024));
		expect(result).toEqual({
			valid: false,
			message: "File must be a PNG or JPEG image",
		});
	});

	it("rejects a file over the 5MB cap", () => {
		const result = validateFloorPlanUpload(
			makeFile("image/png", 5 * 1024 * 1024 + 1),
		);
		expect(result).toEqual({
			valid: false,
			message: "File must be 5MB or smaller",
		});
	});

	it("rejects a missing file", () => {
		const result = validateFloorPlanUpload(null);
		expect(result).toEqual({ valid: false, message: "No file provided" });
	});
});
