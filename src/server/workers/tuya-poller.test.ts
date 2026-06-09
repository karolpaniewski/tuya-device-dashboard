import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
vi.mock("~/server/db", () => ({ db: { select: vi.fn() } }));
vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));

import { db } from "~/server/db";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getTuyaClient } from "~/server/lib/tuya";
import { pollOnce } from "~/server/workers/tuya-poller";

const GATEWAY = {
	tuyaGatewayId: "tuya-gw-1",
	ipAddress: "192.168.1.100",
	localKey: null as string | null, // null skips decryptLocalKey; no crypto mock needed
};

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
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockResolvedValue([GATEWAY]),
		} as never);
		vi.mocked(getTuyaClient).mockReturnValue({
			fetchGatewayDevices: vi
				.fn()
				.mockResolvedValue([
					{ tuyaDeviceId: "d1", isOnline: true, temperatureC: 21 },
				]),
		} as never);

		await pollOnce();

		expect(deviceStateStore.has("d1")).toBe(true);
		const state = deviceStateStore.get("d1")!;
		expect(state.isOnline).toBe(true);
		expect(state.temperatureC).toBe(21);
		expect(Date.now() - state.lastPolledAt.getTime()).toBeLessThan(1000);
	});
});

describe("pollOnce › DB error", () => {
	it("returns early without corrupting existing store entries", async () => {
		const oldDate = new Date(Date.now() - 90_000);
		deviceStateStore.set("d1", {
			isOnline: true,
			temperatureC: 20,
			lastPolledAt: oldDate,
		});

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockRejectedValue(new Error("SQLITE_ERROR")),
		} as never);

		const consoleSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		await pollOnce();

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
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockResolvedValue([GATEWAY]),
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
