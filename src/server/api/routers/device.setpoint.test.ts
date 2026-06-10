import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));
vi.mock("~/server/lib/crypto", () => ({
	decryptLocalKey: vi.fn().mockReturnValue("plaintext-key"),
}));
vi.mock("~/server/lib/tuya/dp-codes", () => ({
	DP_CODE_MAP: { "test-product-key": 2 },
}));

import { createCaller } from "~/server/api/root";
import { getTuyaClient } from "~/server/lib/tuya";

const MOCK_DEVICE_BASE = {
	id: "dev-1",
	tuyaDeviceId: "tuya-dev-1",
	gatewayId: "gw-1",
	name: "Test Valve",
	deviceType: "valve",
	ipAddress: null,
	localKey: null,
	createdAt: new Date(),
	updatedAt: null,
};

const MOCK_GATEWAY = {
	id: "gw-1",
	tuyaGatewayId: "tuya-gw-1",
	name: "Test Gateway",
	ipAddress: "192.168.1.1",
	localKey: "encrypted-key",
	createdAt: new Date(),
	updatedAt: null,
};

const AUTH_SESSION = { user: { id: "u1", email: "test@test.com" } };

// Builds a db mock where select() is called once for device, once for gateway.
function makeDb(
	deviceRows: unknown[],
	gatewayRows: unknown[] = [MOCK_GATEWAY],
) {
	return {
		select: vi
			.fn()
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(deviceRows),
				}),
			})
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(gatewayRows),
				}),
			}),
	};
}

afterEach(() => vi.resetAllMocks());

describe("device.setpoint — auth gate", () => {
	it("throws UNAUTHORIZED when session null", async () => {
		const caller = createCaller({
			db: {} as never,
			session: null,
			headers: new Headers(),
		});
		await expect(
			caller.device.setpoint({ deviceId: "dev-1", setpointC: 22 }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("device.setpoint — DP validation (BAD_REQUEST)", () => {
	it("throws BAD_REQUEST for unknown productKey", async () => {
		const device = { ...MOCK_DEVICE_BASE, productKey: "unknown-key" };
		const caller = createCaller({
			db: makeDb([device]) as never,
			session: AUTH_SESSION as never,
			headers: new Headers(),
		});
		await expect(
			caller.device.setpoint({ deviceId: "dev-1", setpointC: 22 }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("does not call sendSetpoint on BAD_REQUEST (unknown productKey)", async () => {
		const sendSetpointMock = vi.fn();
		vi.mocked(getTuyaClient).mockReturnValue({
			sendSetpoint: sendSetpointMock,
		} as never);

		const device = { ...MOCK_DEVICE_BASE, productKey: "unknown-key" };
		const caller = createCaller({
			db: makeDb([device]) as never,
			session: AUTH_SESSION as never,
			headers: new Headers(),
		});

		await expect(
			caller.device.setpoint({ deviceId: "dev-1", setpointC: 22 }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });

		expect(sendSetpointMock).not.toHaveBeenCalled();
	});

	it("throws BAD_REQUEST for null productKey", async () => {
		const device = { ...MOCK_DEVICE_BASE, productKey: null };
		const caller = createCaller({
			db: makeDb([device]) as never,
			session: AUTH_SESSION as never,
			headers: new Headers(),
		});
		await expect(
			caller.device.setpoint({ deviceId: "dev-1", setpointC: 22 }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

describe("device.setpoint — command failure", () => {
	it("throws INTERNAL_SERVER_ERROR when tuyapi rejects", async () => {
		const sendSetpointMock = vi.fn().mockRejectedValue(new Error("timeout"));
		vi.mocked(getTuyaClient).mockReturnValue({
			sendSetpoint: sendSetpointMock,
		} as never);

		const device = { ...MOCK_DEVICE_BASE, productKey: "test-product-key" };
		const caller = createCaller({
			db: makeDb([device]) as never,
			session: AUTH_SESSION as never,
			headers: new Headers(),
		});
		await expect(
			caller.device.setpoint({ deviceId: "dev-1", setpointC: 22 }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

describe("device.setpoint — success", () => {
	it("returns { success: true } on success", async () => {
		const sendSetpointMock = vi.fn().mockResolvedValue(undefined);
		vi.mocked(getTuyaClient).mockReturnValue({
			sendSetpoint: sendSetpointMock,
		} as never);

		const device = { ...MOCK_DEVICE_BASE, productKey: "test-product-key" };
		const caller = createCaller({
			db: makeDb([device]) as never,
			session: AUTH_SESSION as never,
			headers: new Headers(),
		});
		const result = await caller.device.setpoint({
			deviceId: "dev-1",
			setpointC: 22,
		});
		expect(result).toMatchObject({ success: true, setpointC: 22 });
	});
});
