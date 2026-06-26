import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth to prevent NextAuth module-level initialization from interfering;
// the session is injected directly into createCaller so auth() is never called.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));

import { eq } from "drizzle-orm";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import {
	automationModeActivationLogs,
	automationModes,
	automationModeTargets,
	deviceRoomAssignments,
	devices,
	gateways,
	rooms,
	sites,
} from "~/server/db/schema";
import { encryptLocalKey } from "~/server/lib/crypto";

const SESSION = { user: { id: "u1", email: "test@test.com" } } as never;

describe("mode.trigger integration", () => {
	let siteId: string;
	let gatewayId: string;
	let roomId: string;
	let deviceId: string;
	let modeId: string;

	beforeEach(async () => {
		const ts = Date.now();
		siteId = `site-${ts}`;
		gatewayId = `gw-${ts}`;
		roomId = `room-${ts}`;
		deviceId = `dev-${ts}`;
		modeId = `mode-${ts}`;

		await db.insert(sites).values({ id: siteId, name: "Test Site" });
		await db.insert(gateways).values({
			id: gatewayId,
			tuyaGatewayId: `tuya-gw-${ts}`,
			name: "Test Gateway",
			ipAddress: "192.168.1.100",
			localKey: encryptLocalKey("plaintext-key"),
			siteId,
		});
		await db.insert(rooms).values({ id: roomId, name: "Test Room", siteId });
		await db.insert(devices).values({
			id: deviceId,
			tuyaDeviceId: `tuya-dev-${ts}`,
			gatewayId,
			name: "Test Valve",
			deviceType: "valve",
			productKey: "ogx8u5z6",
			siteId,
		});
		await db.insert(deviceRoomAssignments).values({ deviceId, roomId });
		await db.insert(automationModes).values({ id: modeId, name: "Test Mode" });
		await db.insert(automationModeTargets).values({
			modeId,
			roomId,
			targetOn: true,
		});
	});

	afterEach(async () => {
		// Delete in reverse FK order; cascades handle dependents automatically:
		// automationModeTargets + automationModeActivationLogs cascade from automationModes,
		// deviceRoomAssignments cascades from devices.
		await db.delete(automationModes).where(eq(automationModes.id, modeId));
		await db.delete(devices).where(eq(devices.id, deviceId));
		await db.delete(rooms).where(eq(rooms.id, roomId));
		await db.delete(gateways).where(eq(gateways.id, gatewayId));
		await db.delete(sites).where(eq(sites.id, siteId));
	});

	it("applies mode to room valves and writes activation log", async () => {
		const caller = createCaller({
			db,
			session: SESSION,
			headers: new Headers(),
		});

		const result = await caller.mode.trigger({ id: modeId });

		expect(result.results).toHaveLength(1);
		expect(result.results[0]).toMatchObject({ roomId, status: "applied" });

		const [log] = await db
			.select()
			.from(automationModeActivationLogs)
			.where(eq(automationModeActivationLogs.modeId, modeId));

		expect(log).toBeDefined();
		expect(log?.status).toBe("applied");
		expect(log?.triggeredBy).toBe("manual");
		expect(log?.targetOn).toBe(true);
		expect(log?.roomId).toBe(roomId);
	});
});
