import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
vi.mock("~/server/db", () => ({ db: { select: vi.fn() } }));
vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));

import { db } from "~/server/db";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getTuyaClient } from "~/server/lib/tuya";
import { pollOnce } from "~/server/workers/tuya-poller";

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
				from: vi.fn().mockResolvedValue([GATEWAY]),
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
				from: vi.fn().mockResolvedValue([GATEWAY]),
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
			lastPolledAt: oldDate,
		});

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockRejectedValue(new Error("SQLITE_ERROR")),
		} as never);

		const consoleSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		await pollOnce();

		// biome-ignore lint/style/noNonNullAssertion: "d1" was seeded in test setup; get() is guaranteed non-null
		expect(deviceStateStore.get("d1")!.lastPolledAt.getTime()).toBe(
			oldDate.getTime(),
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining("DB error"),
			expect.any(Error),
		);
	});
});

describe("pollOnce › gateway fetch error", () => {
	it("catches the error, logs it, and does not write to the store", async () => {
		vi.mocked(db.select)
			.mockReturnValueOnce({
				from: vi.fn().mockResolvedValue([GATEWAY]),
			} as never)
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([DEVICE]),
				}),
			} as never);

		vi.mocked(getTuyaClient).mockReturnValue({
			fetchGatewayDevices: vi.fn().mockRejectedValue(new Error("LAN timeout")),
		} as never);

		const consoleSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		await pollOnce();

		expect(deviceStateStore.has("d1")).toBe(false);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining(GATEWAY.tuyaGatewayId),
			expect.any(Error),
		);
	});
});
