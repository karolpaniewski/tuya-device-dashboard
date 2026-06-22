import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
vi.mock("~/server/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("~/server/lib/valve-control", () => ({
	sendValveStateCommand: vi.fn(),
}));

import { db } from "~/server/db";
import { sendValveStateCommand } from "~/server/lib/valve-control";
import { runModeTick } from "~/server/workers/automation-scheduler";

// Monday, 07:00 — chosen so currentDay=1, currentHour=7, currentMinute=0.
const NOW = new Date(2024, 0, 8, 7, 0, 0);

const baseMode = {
	id: "mode-1",
	name: "Morning",
	daysOfWeek: JSON.stringify([1]),
	fireHour: 7,
	fireMinute: 0,
};

function mockModesQuery(modes: unknown[]) {
	vi.mocked(db.select).mockReturnValueOnce({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue(modes),
			}),
		}),
	} as never);
}

function mockTargetsQuery(targets: { roomId: string; targetOn: boolean }[]) {
	vi.mocked(db.select).mockReturnValueOnce({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(targets),
		}),
	} as never);
}

function mockHeatState(pinnedOff?: boolean) {
	vi.mocked(db.select).mockReturnValueOnce({
		from: vi.fn().mockReturnValue({
			where: vi
				.fn()
				.mockResolvedValue(pinnedOff === undefined ? [] : [{ pinnedOff }]),
		}),
	} as never);
}

function mockValveDevices(deviceIds: string[]) {
	vi.mocked(db.select).mockReturnValueOnce({
		from: vi.fn().mockReturnValue({
			innerJoin: vi.fn().mockReturnValue({
				where: vi
					.fn()
					.mockResolvedValue(deviceIds.map((id) => ({ deviceId: id }))),
			}),
		}),
	} as never);
}

function mockInsertLog() {
	const valuesMock = vi.fn().mockResolvedValue(undefined);
	vi.mocked(db).insert = vi
		.fn()
		.mockReturnValue({ values: valuesMock }) as never;
	return valuesMock;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
});

describe("runModeTick", () => {
	it("does not apply a mode whose daysOfWeek does not include the current day", async () => {
		mockModesQuery([{ ...baseMode, daysOfWeek: JSON.stringify([2, 3]) }]);

		await runModeTick();

		expect(sendValveStateCommand).not.toHaveBeenCalled();
	});

	it("does not apply a mode whose fireHour/fireMinute does not match the current time", async () => {
		mockModesQuery([{ ...baseMode, fireHour: 8 }]);

		await runModeTick();

		expect(sendValveStateCommand).not.toHaveBeenCalled();
	});

	it("applies a matching mode: loads targets and sends a valve command per room", async () => {
		mockModesQuery([baseMode]);
		mockTargetsQuery([{ roomId: "room-1", targetOn: true }]);
		mockHeatState(false);
		mockValveDevices(["d1"]);
		mockInsertLog();
		vi.mocked(sendValveStateCommand).mockResolvedValue(undefined);

		await runModeTick();

		expect(sendValveStateCommand).toHaveBeenCalledWith("d1", true);
	});

	it("skips a pinned room for a matching mode and logs 'skipped-pinned'", async () => {
		mockModesQuery([baseMode]);
		mockTargetsQuery([{ roomId: "room-1", targetOn: true }]);
		mockHeatState(true);
		const logValues = mockInsertLog();

		await runModeTick();

		expect(sendValveStateCommand).not.toHaveBeenCalled();
		expect(logValues).toHaveBeenCalledWith(
			expect.objectContaining({ status: "skipped-pinned" }),
		);
	});

	it("two modes targeting the same room at the same tick: the later-created mode's command wins", async () => {
		const earlierMode = { ...baseMode, id: "mode-early", name: "Early" };
		const laterMode = { ...baseMode, id: "mode-late", name: "Late" };
		// Modes are fetched ordered by createdAt ASC — earlier mode evaluated first.
		mockModesQuery([earlierMode, laterMode]);
		mockTargetsQuery([{ roomId: "room-1", targetOn: true }]); // earlier: ON
		mockHeatState(false);
		mockValveDevices(["d1"]);
		mockInsertLog();
		mockTargetsQuery([{ roomId: "room-1", targetOn: false }]); // later: OFF
		mockHeatState(false);
		mockValveDevices(["d1"]);
		mockInsertLog();
		vi.mocked(sendValveStateCommand).mockResolvedValue(undefined);

		await runModeTick();

		expect(sendValveStateCommand).toHaveBeenNthCalledWith(1, "d1", true);
		expect(sendValveStateCommand).toHaveBeenNthCalledWith(2, "d1", false);
	});
});
