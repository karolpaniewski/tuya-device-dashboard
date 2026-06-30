import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
vi.mock("~/server/db", () => ({ db: { select: vi.fn(), delete: vi.fn() } }));
vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));
vi.mock("~/server/lib/alert-control", () => ({
	detectAndDispatchAlerts: vi.fn(),
}));
vi.mock("~/server/lib/log-context", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/server/lib/log-context")>();
	return {
		...actual,
		getLogger: vi.fn(() => ({
			info: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		})),
	};
});

import { lt } from "drizzle-orm";
import { db } from "~/server/db";
import { deviceTemperatureReadings, eventLog } from "~/server/db/schema";
import { detectAndDispatchAlerts } from "~/server/lib/alert-control";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getLogger } from "~/server/lib/log-context";
import { getTuyaClient } from "~/server/lib/tuya";
import {
	pollOnce,
	purgeOldEvents,
	purgeOldReadings,
} from "~/server/workers/tuya-poller";

const GATEWAY = {
	id: "gw-db-1",
	tuyaGatewayId: "tuya-gw-1",
	ipAddress: "192.168.1.100",
	localKey: null as string | null, // null skips decryptLocalKey; no crypto mock needed
};

const DEVICE = { tuyaDeviceId: "d1", nodeId: null };

beforeEach(() => {
	deviceStateStore.clear();
	vi.resetAllMocks();
	// vi.resetAllMocks() wipes the vi.mock() factory's default getLogger
	// implementation too, so re-arm it; individual tests can still override
	// the return value to assert on specific log calls.
	vi.mocked(getLogger).mockReturnValue({
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	} as never);
	// Suppress console output during tests
	vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("pollOnce › happy path", () => {
	it("updates the store with fresh entries after a successful poll", async () => {
		vi.mocked(db.select)
			// First call: gateways
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([GATEWAY]),
				}),
			} as never)
			// Second call: devices for gateway
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([DEVICE]),
				}),
			} as never);

		const mockInsert = vi
			.fn()
			.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
		vi.mocked(db).insert = mockInsert as never;

		vi.mocked(getTuyaClient).mockReturnValue({
			fetchGatewayDevices: vi.fn().mockResolvedValue([
				{
					tuyaDeviceId: "d1",
					isOnline: true,
					temperatureC: 21,
					setpointC: 20,
				},
			]),
		} as never);

		await pollOnce();

		expect(deviceStateStore.has("d1")).toBe(true);
		// biome-ignore lint/style/noNonNullAssertion: "d1" was set immediately above; get() is guaranteed non-null
		const state = deviceStateStore.get("d1")!;
		expect(state.isOnline).toBe(true);
		expect(state.temperatureC).toBe(21);
		expect(Date.now() - state.lastPolledAt.getTime()).toBeLessThan(1000);
		// History insert was called with the reading
		expect(mockInsert).toHaveBeenCalledOnce();
	});

	it("does not insert when temperatureC and setpointC are both null", async () => {
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([GATEWAY]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([DEVICE]),
				}),
			} as never);

		const mockInsert = vi
			.fn()
			.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
		vi.mocked(db).insert = mockInsert as never;

		vi.mocked(getTuyaClient).mockReturnValue({
			fetchGatewayDevices: vi.fn().mockResolvedValue([
				{
					tuyaDeviceId: "d1",
					isOnline: true,
					temperatureC: null,
					setpointC: null,
				},
			]),
		} as never);

		await pollOnce();

		expect(mockInsert).not.toHaveBeenCalled();
	});
});

describe("pollOnce › DB error", () => {
	it("returns early without corrupting existing store entries", async () => {
		const oldDate = new Date(Date.now() - 90_000);
		deviceStateStore.set("d1", {
			isOnline: true,
			temperatureC: 20,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: oldDate,
		});

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockRejectedValue(new Error("SQLITE_ERROR")),
			}),
		} as never);

		await pollOnce();

		// biome-ignore lint/style/noNonNullAssertion: "d1" was seeded in test setup; get() is guaranteed non-null
		expect(deviceStateStore.get("d1")!.lastPolledAt.getTime()).toBe(
			oldDate.getTime(),
		);
	});
});

describe("pollOnce › gateway fetch error", () => {
	it("catches the error, logs it, and does not write to the store", async () => {
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([GATEWAY]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([DEVICE]),
				}),
			} as never);

		vi.mocked(getTuyaClient).mockReturnValue({
			fetchGatewayDevices: vi.fn().mockRejectedValue(new Error("LAN timeout")),
		} as never);

		await pollOnce();

		expect(deviceStateStore.has("d1")).toBe(false);
	});
});

describe("pollOnce › alert dispatch", () => {
	it("calls detectAndDispatchAlerts exactly once per tick", async () => {
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		} as never);

		await pollOnce();

		expect(detectAndDispatchAlerts).toHaveBeenCalledOnce();
	});

	it("a thrown error from detectAndDispatchAlerts does not abort the rest of the tick", async () => {
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([GATEWAY]),
				}),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([DEVICE]),
				}),
			} as never);

		const mockInsert = vi
			.fn()
			.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
		vi.mocked(db).insert = mockInsert as never;

		vi.mocked(getTuyaClient).mockReturnValue({
			fetchGatewayDevices: vi.fn().mockResolvedValue([
				{
					tuyaDeviceId: "d1",
					isOnline: true,
					temperatureC: 21,
					setpointC: 20,
				},
			]),
		} as never);

		vi.mocked(detectAndDispatchAlerts).mockRejectedValue(
			new Error("alert-control blew up"),
		);

		await pollOnce();

		// The earlier steps (store update, history insert) still completed —
		// the alert-control failure is caught and doesn't unwind the tick.
		expect(mockInsert).toHaveBeenCalledOnce();
		expect(deviceStateStore.has("d1")).toBe(true);
	});
});

describe("purgeOldReadings", () => {
	const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
	const NOW = new Date("2026-06-25T00:00:00.000Z").getTime();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function stubDelete(outcome: { rowsAffected: number } | Error) {
		const mockWhere =
			outcome instanceof Error
				? vi.fn().mockRejectedValue(outcome)
				: vi.fn().mockResolvedValue(outcome);
		vi.mocked(db).delete = vi
			.fn()
			.mockReturnValue({ where: mockWhere }) as never;
		return mockWhere;
	}

	it("deletes with a strict less-than cutoff exactly 30 days before now", async () => {
		const mockWhere = stubDelete({ rowsAffected: 0 });

		await purgeOldReadings();

		const cutoff = new Date(NOW - RETENTION_MS);
		const actualCondition = mockWhere.mock.calls[0]?.[0];
		// Deep-equals a real lt() call (not lte/gt) — proves the strict
		// less-than semantics this plan documents are still wired up.
		expect(actualCondition).toEqual(
			lt(deviceTemperatureReadings.recordedAt, cutoff),
		);

		// A reading older than the window is < cutoff → deleted.
		expect(new Date(cutoff.getTime() - 1).getTime() < cutoff.getTime()).toBe(
			true,
		);
		// A reading within the window is not < cutoff → kept.
		expect(new Date(cutoff.getTime() + 1).getTime() < cutoff.getTime()).toBe(
			false,
		);
		// A reading exactly at the boundary is not < cutoff → kept (strict, not <=).
		const boundaryReading = new Date(cutoff.getTime());
		expect(boundaryReading.getTime() < cutoff.getTime()).toBe(false);
	});

	it("logs the purge outcome with the deleted row count on success", async () => {
		stubDelete({ rowsAffected: 42 });
		const mockLogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() };
		vi.mocked(getLogger).mockReturnValue(mockLogger as never);

		await purgeOldReadings();

		expect(mockLogger.info).toHaveBeenCalledWith(
			{ rowsDeleted: 42 },
			"tuya-poller.purge-complete",
		);
	});

	it("catches a thrown error from db.delete and does not propagate", async () => {
		stubDelete(new Error("SQLITE_ERROR"));
		const mockLogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() };
		vi.mocked(getLogger).mockReturnValue(mockLogger as never);

		await expect(purgeOldReadings()).resolves.toBeUndefined();

		expect(mockLogger.info).not.toHaveBeenCalled();
		expect(mockLogger.error).toHaveBeenCalledOnce();
	});
});

describe("purgeOldEvents", () => {
	const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
	const NOW = new Date("2026-06-25T00:00:00.000Z").getTime();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function stubDelete(outcome: { rowsAffected: number } | Error) {
		const mockWhere =
			outcome instanceof Error
				? vi.fn().mockRejectedValue(outcome)
				: vi.fn().mockResolvedValue(outcome);
		vi.mocked(db).delete = vi
			.fn()
			.mockReturnValue({ where: mockWhere }) as never;
		return mockWhere;
	}

	it("deletes with a strict less-than cutoff exactly 30 days before now", async () => {
		const mockWhere = stubDelete({ rowsAffected: 0 });

		await purgeOldEvents();

		const cutoff = new Date(NOW - RETENTION_MS);
		const actualCondition = mockWhere.mock.calls[0]?.[0];
		expect(actualCondition).toEqual(lt(eventLog.createdAt, cutoff));

		expect(new Date(cutoff.getTime() - 1).getTime() < cutoff.getTime()).toBe(
			true,
		);
		expect(new Date(cutoff.getTime() + 1).getTime() < cutoff.getTime()).toBe(
			false,
		);
		const boundaryReading = new Date(cutoff.getTime());
		expect(boundaryReading.getTime() < cutoff.getTime()).toBe(false);
	});

	it("logs the purge outcome with the deleted row count on success", async () => {
		stubDelete({ rowsAffected: 7 });
		const mockLogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() };
		vi.mocked(getLogger).mockReturnValue(mockLogger as never);

		await purgeOldEvents();

		expect(mockLogger.info).toHaveBeenCalledWith(
			{ rowsDeleted: 7 },
			"tuya-poller.event-purge-complete",
		);
	});

	it("catches a thrown error from db.delete and does not propagate", async () => {
		stubDelete(new Error("SQLITE_ERROR"));
		const mockLogger = { info: vi.fn(), error: vi.fn(), debug: vi.fn() };
		vi.mocked(getLogger).mockReturnValue(mockLogger as never);

		await expect(purgeOldEvents()).resolves.toBeUndefined();

		expect(mockLogger.info).not.toHaveBeenCalled();
		expect(mockLogger.error).toHaveBeenCalledOnce();
	});
});
