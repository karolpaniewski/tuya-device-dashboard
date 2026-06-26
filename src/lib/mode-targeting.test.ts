import { describe, expect, it } from "vitest";

import {
	formatModeSchedule,
	getAllModesForCanvas,
	getModesForRoom,
} from "./mode-targeting";

function mode(
	overrides: Partial<Parameters<typeof getModesForRoom>[1][number]>,
) {
	return {
		id: "mode-1",
		name: "Mode",
		daysOfWeek: null,
		fireHour: null,
		fireMinute: null,
		targets: [],
		...overrides,
	};
}

describe("getModesForRoom", () => {
	it("returns an empty array when no mode targets the room", () => {
		const modes = [
			mode({
				id: "m1",
				targets: [{ roomId: "other-room", roomName: "Other", targetOn: true }],
			}),
		];
		expect(getModesForRoom("room-1", modes)).toEqual([]);
	});

	it("returns the single mode targeting the room", () => {
		const modes = [
			mode({
				id: "m1",
				name: "Evening Heat",
				targets: [{ roomId: "room-1", roomName: "Room 1", targetOn: true }],
			}),
		];
		expect(getModesForRoom("room-1", modes)).toEqual([
			{
				id: "m1",
				name: "Evening Heat",
				targetOn: true,
				daysOfWeek: null,
				fireHour: null,
				fireMinute: null,
			},
		]);
	});

	it("returns both modes when two modes simultaneously target the room", () => {
		const modes = [
			mode({
				id: "m1",
				name: "Mode A",
				targets: [{ roomId: "room-1", roomName: "Room 1", targetOn: true }],
			}),
			mode({
				id: "m2",
				name: "Mode B",
				targets: [{ roomId: "room-1", roomName: "Room 1", targetOn: false }],
			}),
		];
		const result = getModesForRoom("room-1", modes);
		expect(result).toHaveLength(2);
		expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
	});

	it("returns the targetOn value specific to the queried room when a mode targets multiple rooms differently", () => {
		const modes = [
			mode({
				id: "m1",
				name: "Multi-room mode",
				targets: [
					{ roomId: "room-1", roomName: "Room 1", targetOn: true },
					{ roomId: "room-2", roomName: "Room 2", targetOn: false },
				],
			}),
		];
		expect(getModesForRoom("room-1", modes)).toEqual([
			expect.objectContaining({ id: "m1", targetOn: true }),
		]);
		expect(getModesForRoom("room-2", modes)).toEqual([
			expect.objectContaining({ id: "m1", targetOn: false }),
		]);
	});

	it("excludes a mode that does not target the room in question", () => {
		const modes = [
			mode({
				id: "m1",
				targets: [{ roomId: "room-2", roomName: "Room 2", targetOn: true }],
			}),
		];
		expect(getModesForRoom("room-1", modes)).toEqual([]);
	});
});

describe("getAllModesForCanvas", () => {
	it("returns an empty array when there are no modes", () => {
		expect(getAllModesForCanvas("room-1", [])).toEqual([]);
	});

	it("marks a mode as connected with correct targetOn when it targets the room", () => {
		const modes = [
			mode({
				id: "m1",
				name: "Morning",
				targets: [{ roomId: "room-1", roomName: "Room 1", targetOn: true }],
			}),
		];
		expect(getAllModesForCanvas("room-1", modes)).toEqual([
			{
				id: "m1",
				name: "Morning",
				daysOfWeek: null,
				fireHour: null,
				fireMinute: null,
				isConnected: true,
				targetOn: true,
			},
		]);
	});

	it("marks a mode as unconnected with targetOn null when it does not target the room", () => {
		const modes = [
			mode({
				id: "m1",
				name: "Morning",
				targets: [{ roomId: "other-room", roomName: "Other", targetOn: true }],
			}),
		];
		expect(getAllModesForCanvas("room-1", modes)).toEqual([
			{
				id: "m1",
				name: "Morning",
				daysOfWeek: null,
				fireHour: null,
				fireMinute: null,
				isConnected: false,
				targetOn: null,
			},
		]);
	});

	it("returns all modes regardless of connection, with correct states for each", () => {
		const modes = [
			mode({
				id: "m1",
				name: "Connected",
				targets: [{ roomId: "room-1", roomName: "Room 1", targetOn: false }],
			}),
			mode({
				id: "m2",
				name: "Unconnected",
				targets: [{ roomId: "other-room", roomName: "Other", targetOn: true }],
			}),
		];
		const result = getAllModesForCanvas("room-1", modes);
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			id: "m1",
			isConnected: true,
			targetOn: false,
		});
		expect(result[1]).toMatchObject({
			id: "m2",
			isConnected: false,
			targetOn: null,
		});
	});
});

describe("formatModeSchedule", () => {
	it("returns the manual-trigger label when there is no schedule", () => {
		expect(
			formatModeSchedule({
				daysOfWeek: null,
				fireHour: null,
				fireMinute: null,
			}),
		).toBe("Manual trigger only");
	});

	it("formats sorted days and zero-padded time", () => {
		expect(
			formatModeSchedule({ daysOfWeek: [5, 1, 3], fireHour: 6, fireMinute: 5 }),
		).toBe("Mon Wed Fri · 06:05");
	});
});
