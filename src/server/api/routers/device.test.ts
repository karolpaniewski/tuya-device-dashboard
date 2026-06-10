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
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockResolvedValue([syntheticRow]),
					}),
				}),
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
		expect(result.unassigned[0]!.isStale).toBe(true);
	});

	it("never polled: isStale false, isOnline false", async () => {
		// store is clear from afterEach; verify device-absent path
		const result = await makeCallerWithRow().device.overview();
		const device = result.unassigned[0]!;
		expect(device.isStale).toBe(false);
		expect(device.isOnline).toBe(false);
		expect(device.lastPolledAt).toBeNull();
	});
});
