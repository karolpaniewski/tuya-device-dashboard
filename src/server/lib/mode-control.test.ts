import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
vi.mock("~/server/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("~/server/lib/valve-control", () => ({
	sendValveStateCommand: vi.fn(),
}));

import { db } from "~/server/db";
import { applyModeToRooms } from "~/server/lib/mode-control";
import { sendValveStateCommand } from "~/server/lib/valve-control";

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

afterEach(() => vi.resetAllMocks());

describe("applyModeToRooms", () => {
	it("skips a pinned-off room: logs 'skipped-pinned', never calls sendValveStateCommand", async () => {
		mockHeatState(true);
		const logValues = mockInsertLog();

		const results = await applyModeToRooms(
			"mode-1",
			[{ roomId: "room-1", targetOn: true }],
			"manual",
		);

		expect(results).toEqual([{ roomId: "room-1", status: "skipped-pinned" }]);
		expect(sendValveStateCommand).not.toHaveBeenCalled();
		expect(logValues).toHaveBeenCalledWith(
			expect.objectContaining({
				modeId: "mode-1",
				roomId: "room-1",
				triggeredBy: "manual",
				status: "skipped-pinned",
			}),
		);
	});

	it("all devices succeed: status 'applied', sendValveStateCommand called per valve with the target state", async () => {
		mockHeatState(false);
		mockValveDevices(["d1", "d2"]);
		const logValues = mockInsertLog();
		vi.mocked(sendValveStateCommand).mockResolvedValue(undefined);

		const results = await applyModeToRooms(
			"mode-1",
			[{ roomId: "room-1", targetOn: true }],
			"schedule",
		);

		expect(results).toEqual([{ roomId: "room-1", status: "applied" }]);
		expect(sendValveStateCommand).toHaveBeenCalledWith("d1", true);
		expect(sendValveStateCommand).toHaveBeenCalledWith("d2", true);
		expect(logValues).toHaveBeenCalledWith(
			expect.objectContaining({ status: "applied", triggeredBy: "schedule" }),
		);
	});

	it("one device fails: status 'failed' with its error captured, log row records the error", async () => {
		mockHeatState(false);
		mockValveDevices(["d1", "d2"]);
		const logValues = mockInsertLog();
		vi.mocked(sendValveStateCommand)
			.mockRejectedValueOnce(new Error("COMMAND_FAILED"))
			.mockResolvedValueOnce(undefined);

		const results = await applyModeToRooms(
			"mode-1",
			[{ roomId: "room-1", targetOn: false }],
			"manual",
		);

		expect(results).toEqual([
			{ roomId: "room-1", status: "failed", error: "COMMAND_FAILED" },
		]);
		expect(logValues).toHaveBeenCalledWith(
			expect.objectContaining({ status: "failed", error: "COMMAND_FAILED" }),
		);
	});

	it("processes multiple room targets in order, writing one log row per room", async () => {
		mockHeatState(false);
		mockValveDevices(["d1"]);
		mockHeatState(true);
		const logValues = mockInsertLog();
		vi.mocked(sendValveStateCommand).mockResolvedValue(undefined);

		const results = await applyModeToRooms(
			"mode-1",
			[
				{ roomId: "room-1", targetOn: true },
				{ roomId: "room-2", targetOn: false },
			],
			"schedule",
		);

		expect(results).toEqual([
			{ roomId: "room-1", status: "applied" },
			{ roomId: "room-2", status: "skipped-pinned" },
		]);
		expect(logValues).toHaveBeenCalledTimes(2);
	});
});
