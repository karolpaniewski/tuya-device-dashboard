import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
// Without these, importing createCaller triggers ~/server/auth and ~/server/db
// which fire ~/env Zod validation against the real env vars.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";
import { deviceStateStore } from "~/server/lib/device-state-store";

describe("device.overview — auth gate", () => {
	it("throws UNAUTHORIZED when session is null", async () => {
		const caller = createCaller({
			// db is never reached: enforceUserIsAuthed fires before the procedure body
			db: {} as never,
			session: null,
			headers: new Headers(),
		});
		await expect(caller.device.overview()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});

describe("device.overview — stale detection", () => {
	afterEach(() => deviceStateStore.clear());

	const syntheticRow = {
		device: {
			id: "d1",
			tuyaDeviceId: "tuya-d1",
			name: "Dev",
			deviceType: "sensor",
		},
		room: null,
	};

	function makeCallerWithRow() {
		const mockDb = {
			select: vi
				.fn()
				// First call: main devices+rooms query
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockResolvedValue([syntheticRow]),
						}),
					}),
				})
				// Second call: roomThresholds query — no rooms assigned, returns []
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([]),
				}),
		};
		return createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});
	}

	it("fresh data: isStale false", async () => {
		deviceStateStore.set("tuya-d1", {
			isOnline: true,
			temperatureC: 21,
			setpointC: null,
			lastPolledAt: new Date(Date.now() - 10_000),
		});
		const result = await makeCallerWithRow().device.overview();
		// biome-ignore lint/style/noNonNullAssertion: test seeds exactly one device; unassigned[0] is guaranteed
		expect(result.unassigned[0]!.isStale).toBe(false);
	});

	it("stale data: isStale true", async () => {
		deviceStateStore.set("tuya-d1", {
			isOnline: true,
			temperatureC: 21,
			setpointC: null,
			lastPolledAt: new Date(Date.now() - 61_000),
		});
		const result = await makeCallerWithRow().device.overview();
		// biome-ignore lint/style/noNonNullAssertion: test seeds exactly one device; unassigned[0] is guaranteed
		expect(result.unassigned[0]!.isStale).toBe(true);
	});

	it("never polled: isStale false, isOnline false", async () => {
		// store is clear from afterEach; verify device-absent path
		const result = await makeCallerWithRow().device.overview();
		// biome-ignore lint/style/noNonNullAssertion: test seeds exactly one device; unassigned[0] is guaranteed
		const device = result.unassigned[0]!;
		expect(device.isStale).toBe(false);
		expect(device.isOnline).toBe(false);
		expect(device.lastPolledAt).toBeNull();
	});
});

describe("device.overview — room scoring", () => {
	afterEach(() => deviceStateStore.clear());

	const sensorRow = {
		device: {
			id: "d1",
			tuyaDeviceId: "tuya-d1",
			name: "Sensor 1",
			deviceType: "sensor",
		},
		room: { id: "r1", name: "Living Room" },
	};

	it("badge Too Cold and anomaly false when temp below min, setpoint null (PRD §FR-012)", async () => {
		deviceStateStore.set("tuya-d1", {
			isOnline: true,
			temperatureC: 15,
			setpointC: null,
			lastPolledAt: new Date(),
		});

		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockResolvedValue([sensorRow]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi
						.fn()
						.mockResolvedValue([
							{ roomId: "r1", minTempC: 18, maxTempC: 24, anomalyGapC: 3 },
						]),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview();
		// Oracle: 15 < minTempC(18) → "Too Cold"; setpointC null → anomaly false
		expect(result.rooms[0]?.badge).toBe("Too Cold");
		expect(result.rooms[0]?.anomaly).toBe(false);
	});
});
