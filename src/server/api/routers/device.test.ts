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
		await expect(
			caller.device.overview({ siteId: "all" }),
		).rejects.toMatchObject({
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
			siteId: "default",
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
				})
				// Third call: sites query
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
		const result = await makeCallerWithRow().device.overview({ siteId: "all" });
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
		const result = await makeCallerWithRow().device.overview({ siteId: "all" });
		// biome-ignore lint/style/noNonNullAssertion: test seeds exactly one device; unassigned[0] is guaranteed
		expect(result.unassigned[0]!.isStale).toBe(true);
	});

	it("never polled: isStale false, isOnline false", async () => {
		// store is clear from afterEach; verify device-absent path
		const result = await makeCallerWithRow().device.overview({ siteId: "all" });
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
			siteId: "default",
		},
		room: { id: "r1", name: "Living Room", siteId: "default" },
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
				})
				// Sites query
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "default", name: "Default" }]),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "all" });
		// Oracle: 15 < minTempC(18) → "Too Cold"; setpointC null → anomaly false
		expect(result.rooms[0]?.badge).toBe("Too Cold");
		expect(result.rooms[0]?.anomaly).toBe(false);
	});
});

// ─── device.temperatureHistory ───────────────────────────────────────────────

describe("device.temperatureHistory", () => {
	it("returns bucketed data for '7d' range", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						groupBy: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([
								{
									bucket: 1700000000,
									temperatureC: "21.5",
									setpointC: "20.0",
								},
							]),
						}),
					}),
				}),
			}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.temperatureHistory({
			tuyaDeviceId: "d1",
			range: "7d",
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.recordedAt).toBeInstanceOf(Date);
		expect(result[0]?.temperatureC).toBe(21.5);
		expect(result[0]?.setpointC).toBe(20);
	});

	it("returns empty array when no readings exist", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						groupBy: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.temperatureHistory({
			tuyaDeviceId: "d1",
			range: "7d",
		});

		expect(result).toHaveLength(0);
	});
});

// ─── device.overview — scoping ───────────────────────────────────────────────

describe("device.overview — scoping", () => {
	afterEach(() => deviceStateStore.clear());

	it("siteId='site-a': returns only devices belonging to site-a", async () => {
		const rowSiteA = {
			device: {
				id: "d1",
				tuyaDeviceId: "tuya-d1",
				name: "Sensor A",
				deviceType: "sensor",
				siteId: "site-a",
			},
			room: null,
		};

		const mockDb = {
			select: vi
				.fn()
				// First: devices+rooms with WHERE on siteId (conditional branch)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([rowSiteA]),
							}),
						}),
					}),
				})
				// Second: roomThresholds
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Third: sites
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "site-a", name: "Site A" }]),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "site-a" });
		expect(result.unassigned).toHaveLength(1);
		expect(result.unassigned[0]?.siteId).toBe("site-a");
	});

	it("siteId='all': returns devices from all sites", async () => {
		const rows = [
			{
				device: {
					id: "d1",
					tuyaDeviceId: "t1",
					name: "A",
					deviceType: "sensor",
					siteId: "site-a",
				},
				room: null,
			},
			{
				device: {
					id: "d2",
					tuyaDeviceId: "t2",
					name: "B",
					deviceType: "sensor",
					siteId: "site-b",
				},
				room: null,
			},
		];

		const mockDb = {
			select: vi
				.fn()
				// First: full scan (no WHERE)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockResolvedValue(rows),
						}),
					}),
				})
				// Second: roomThresholds
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Third: sites
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([
						{ id: "site-a", name: "Site A" },
						{ id: "site-b", name: "Site B" },
					]),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "all" });
		expect(result.unassigned).toHaveLength(2);
	});
});
