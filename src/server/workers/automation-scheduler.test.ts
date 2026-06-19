import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
vi.mock("~/server/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("~/server/lib/valve-control", () => ({
	sendSetpointCommand: vi.fn(),
}));

import { db } from "~/server/db";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { sendSetpointCommand } from "~/server/lib/valve-control";
import {
	getRoomAvgTemperature,
	runAutomationTick,
} from "~/server/workers/automation-scheduler";

// Monday, 07:00 — chosen so currentDay=1, currentHour=7, currentMinute=0.
const NOW = new Date(2024, 0, 8, 7, 0, 0);

const baseRule = {
	id: "rule-1",
	deviceId: "device-1",
	daysOfWeek: JSON.stringify([1]),
	fireHour: 7,
	fireMinute: 0,
	targetSetpointC: 21,
	tempThresholdC: null as number | null,
};

function mockRulesQuery(rules: (typeof baseRule)[]) {
	vi.mocked(db.select).mockReturnValueOnce({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(rules),
		}),
	} as never);
}

function mockInsert() {
	const valuesMock = vi.fn().mockResolvedValue(undefined);
	vi.mocked(db).insert = vi
		.fn()
		.mockReturnValue({ values: valuesMock }) as never;
	return valuesMock;
}

beforeEach(() => {
	deviceStateStore.clear();
	vi.resetAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("runAutomationTick", () => {
	it("does not execute a rule whose daysOfWeek does not include the current day", async () => {
		mockRulesQuery([{ ...baseRule, daysOfWeek: JSON.stringify([2, 3]) }]);
		const logValues = mockInsert();

		await runAutomationTick();

		expect(sendSetpointCommand).not.toHaveBeenCalled();
		expect(logValues).not.toHaveBeenCalled();
	});

	it("does not execute a rule whose fireHour/fireMinute does not match the current time", async () => {
		mockRulesQuery([{ ...baseRule, fireHour: 8 }]);
		const logValues = mockInsert();

		await runAutomationTick();

		expect(sendSetpointCommand).not.toHaveBeenCalled();
		expect(logValues).not.toHaveBeenCalled();
	});

	it("calls sendSetpointCommand and logs success for a matching rule with no threshold", async () => {
		mockRulesQuery([baseRule]);
		const logValues = mockInsert();
		vi.mocked(sendSetpointCommand).mockResolvedValue(undefined);

		await runAutomationTick();

		expect(sendSetpointCommand).toHaveBeenCalledWith("device-1", 21);
		expect(logValues).toHaveBeenCalledWith(
			expect.objectContaining({ ruleId: "rule-1", status: "success" }),
		);
	});

	it("skips execution and logs 'skipped' when the room average meets the temperature threshold", async () => {
		mockRulesQuery([{ ...baseRule, tempThresholdC: 20 }]);
		const logValues = mockInsert();
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ deviceId: "device-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ tuyaDeviceId: "tuya-sensor-1" }]),
				}),
			} as never);
		deviceStateStore.set("tuya-sensor-1", {
			isOnline: true,
			temperatureC: 25,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: NOW,
		});

		await runAutomationTick();

		expect(sendSetpointCommand).not.toHaveBeenCalled();
		expect(logValues).toHaveBeenCalledWith(
			expect.objectContaining({ ruleId: "rule-1", status: "skipped" }),
		);
	});

	it("logs 'failed' with the error message when sendSetpointCommand throws", async () => {
		mockRulesQuery([baseRule]);
		const logValues = mockInsert();
		vi.mocked(sendSetpointCommand).mockRejectedValue(
			new Error("COMMAND_FAILED"),
		);

		await runAutomationTick();

		expect(logValues).toHaveBeenCalledWith(
			expect.objectContaining({
				ruleId: "rule-1",
				status: "failed",
				error: "COMMAND_FAILED",
			}),
		);
	});
});

describe("getRoomAvgTemperature", () => {
	it("returns null when the device has no room assignment", async () => {
		vi.mocked(db.select).mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		} as never);

		const result = await getRoomAvgTemperature("device-1");

		expect(result).toBeNull();
	});

	it("returns null when the room has no sensor devices", async () => {
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ deviceId: "device-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			} as never);

		const result = await getRoomAvgTemperature("device-1");

		expect(result).toBeNull();
	});

	it("returns null when sensors exist but all readings are stale (> 5 min)", async () => {
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ deviceId: "sensor-device-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ tuyaDeviceId: "tuya-sensor-1" }]),
				}),
			} as never);
		deviceStateStore.set("tuya-sensor-1", {
			isOnline: true,
			temperatureC: 22,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(NOW.getTime() - 10 * 60 * 1000),
		});

		const result = await getRoomAvgTemperature("device-1");

		expect(result).toBeNull();
	});

	it("returns the average of multiple fresh readings", async () => {
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi
						.fn()
						.mockResolvedValue([
							{ deviceId: "sensor-device-1" },
							{ deviceId: "sensor-device-2" },
						]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi
						.fn()
						.mockResolvedValue([
							{ tuyaDeviceId: "tuya-sensor-1" },
							{ tuyaDeviceId: "tuya-sensor-2" },
						]),
				}),
			} as never);
		deviceStateStore.set("tuya-sensor-1", {
			isOnline: true,
			temperatureC: 20,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: NOW,
		});
		deviceStateStore.set("tuya-sensor-2", {
			isOnline: true,
			temperatureC: 24,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: NOW,
		});

		const result = await getRoomAvgTemperature("device-1");

		expect(result).toBe(22);
	});

	it("returns the single sensor's reading directly when only one sensor is fresh", async () => {
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ deviceId: "sensor-device-1" }]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ tuyaDeviceId: "tuya-sensor-1" }]),
				}),
			} as never);
		deviceStateStore.set("tuya-sensor-1", {
			isOnline: true,
			temperatureC: 19.5,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: NOW,
		});

		const result = await getRoomAvgTemperature("device-1");

		expect(result).toBe(19.5);
	});
});
