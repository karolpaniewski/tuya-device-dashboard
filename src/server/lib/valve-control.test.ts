import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({ db: { select: vi.fn() } }));
vi.mock("~/server/lib/tuya", () => ({ getTuyaClient: vi.fn() }));
vi.mock("~/server/lib/crypto", () => ({
	decryptLocalKey: vi.fn().mockReturnValue("plaintext-key"),
}));
vi.mock("~/server/lib/tuya/dp-codes", () => ({
	DP_CODE_MAP: {},
	VALVE_STATE_DP_CODE_MAP: { "test-product-key": 3 },
}));

import { db } from "~/server/db";
import { decryptLocalKey } from "~/server/lib/crypto";
import { getTuyaClient } from "~/server/lib/tuya";
import { sendValveStateCommand } from "~/server/lib/valve-control";

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

function mockDbSelect(
	deviceRows: unknown[],
	gatewayRows: unknown[] = [MOCK_GATEWAY],
) {
	vi.mocked(db.select)
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(deviceRows),
			}),
		} as never)
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(gatewayRows),
			}),
		} as never);
}

afterEach(() => vi.resetAllMocks());

describe("sendValveStateCommand", () => {
	it("throws DEVICE_NOT_FOUND when the device does not exist", async () => {
		mockDbSelect([]);
		await expect(sendValveStateCommand("dev-1", false)).rejects.toThrow(
			"DEVICE_NOT_FOUND",
		);
	});

	it("throws UNSUPPORTED_DEVICE when productKey is not in VALVE_STATE_DP_CODE_MAP", async () => {
		const device = { ...MOCK_DEVICE_BASE, productKey: "unknown-key" };
		mockDbSelect([device]);
		await expect(sendValveStateCommand("dev-1", false)).rejects.toThrow(
			"UNSUPPORTED_DEVICE",
		);
	});

	it("happy path: calls sendSwitch with the DP-3 dps value and the correct boolean set", async () => {
		vi.mocked(decryptLocalKey).mockReturnValue("plaintext-key");
		const sendSwitchMock = vi.fn().mockResolvedValue(undefined);
		vi.mocked(getTuyaClient).mockReturnValue({
			sendSwitch: sendSwitchMock,
		} as never);

		const device = { ...MOCK_DEVICE_BASE, productKey: "test-product-key" };
		mockDbSelect([device]);

		await sendValveStateCommand("dev-1", false);

		expect(sendSwitchMock).toHaveBeenCalledWith(
			expect.objectContaining({ localKey: "plaintext-key" }),
			expect.objectContaining({ dps: 3, set: false }),
		);
	});
});
