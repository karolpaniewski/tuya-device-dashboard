import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
vi.mock("~/server/db", () => ({
	db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));
vi.mock("~/server/lib/email", () => ({ getEmailClient: vi.fn() }));

import { db } from "~/server/db";
import { detectAndDispatchAlerts } from "~/server/lib/alert-control";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getEmailClient } from "~/server/lib/email";

const ROOM_1_DEVICE = {
	roomId: "r1",
	roomName: "Room 1",
	tuyaDeviceId: "sensor-r1",
	deviceType: "sensor",
};
const ROOM_2_DEVICE = {
	roomId: "r2",
	roomName: "Room 2",
	tuyaDeviceId: "sensor-r2",
	deviceType: "sensor",
};

function mockDeviceRows(rows: (typeof ROOM_1_DEVICE)[]) {
	vi.mocked(db.select).mockReturnValueOnce({
		from: vi.fn().mockReturnValue({
			innerJoin: vi.fn().mockReturnValue({
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(rows),
				}),
			}),
		}),
	} as never);
}

function mockFrom(rows: unknown[]) {
	vi.mocked(db.select).mockReturnValueOnce({
		from: vi.fn().mockResolvedValue(rows),
	} as never);
}

function mockFromWhere(rows: unknown[]) {
	vi.mocked(db.select).mockReturnValueOnce({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(rows),
		}),
	} as never);
}

// Standard setup: no per-room threshold overrides, no app-wide default row
// (DEFAULT_THRESHOLDS fallback applies), and the given pre-existing alert states.
function mockQueryChain(
	deviceRows: (typeof ROOM_1_DEVICE)[],
	alertStateRows: unknown[],
	contactRows?: unknown[],
) {
	mockDeviceRows(deviceRows);
	mockFrom([]); // roomThresholds — empty, falls back to DEFAULT_THRESHOLDS
	mockFromWhere([]); // defaultThresholds — empty, falls back to DEFAULT_THRESHOLDS
	mockFrom(alertStateRows); // roomAlertState
	if (contactRows !== undefined) mockFrom(contactRows); // notificationContacts
}

function mockInsert() {
	const valuesMock = vi.fn().mockResolvedValue(undefined);
	vi.mocked(db).insert = vi
		.fn()
		.mockReturnValue({ values: valuesMock }) as never;
	return valuesMock;
}

function mockUpdate() {
	const whereMock = vi.fn().mockResolvedValue(undefined);
	const setMock = vi.fn().mockReturnValue({ where: whereMock });
	vi.mocked(db).update = vi.fn().mockReturnValue({ set: setMock }) as never;
	return { setMock, whereMock };
}

beforeEach(() => {
	deviceStateStore.clear();
	vi.resetAllMocks();
});

afterEach(() => vi.restoreAllMocks());

describe("detectAndDispatchAlerts", () => {
	it("OK→Too Cold creates a pending episode and sends", async () => {
		deviceStateStore.set("sensor-r1", {
			isOnline: true,
			temperatureC: 10,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});
		mockQueryChain([ROOM_1_DEVICE], [], [{ id: "c1" }]);
		const insertValues = mockInsert();
		const { setMock, whereMock } = mockUpdate();
		const sendAlertEmail = vi.fn().mockResolvedValue(undefined);
		vi.mocked(getEmailClient).mockReturnValue({ sendAlertEmail });

		await detectAndDispatchAlerts();

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				roomId: "r1",
				lastBadge: "Too Cold",
				notifiedAt: null,
			}),
		);
		expect(sendAlertEmail).toHaveBeenCalledWith({
			violations: [{ roomId: "r1", roomName: "Room 1", badge: "Too Cold" }],
		});
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({ notifiedAt: expect.any(Date) }),
		);
		expect(whereMock).toHaveBeenCalledOnce();
	});

	it("already-pending room is included in the next tick's batch on retry after a simulated send failure", async () => {
		deviceStateStore.set("sensor-r1", {
			isOnline: true,
			temperatureC: 10,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});
		mockQueryChain(
			[ROOM_1_DEVICE],
			[
				{
					id: "state-1",
					roomId: "r1",
					lastBadge: "Too Cold",
					enteredAt: new Date(),
					notifiedAt: null,
				},
			],
			[{ id: "c1" }],
		);
		mockUpdate();
		const sendAlertEmail = vi.fn().mockResolvedValue(undefined);
		vi.mocked(getEmailClient).mockReturnValue({ sendAlertEmail });

		await detectAndDispatchAlerts();

		expect(sendAlertEmail).toHaveBeenCalledWith({
			violations: [{ roomId: "r1", roomName: "Room 1", badge: "Too Cold" }],
		});
	});

	it("Too Cold→Too Hot direct transition does NOT re-send", async () => {
		deviceStateStore.set("sensor-r1", {
			isOnline: true,
			temperatureC: 30,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});
		mockQueryChain(
			[ROOM_1_DEVICE],
			[
				{
					id: "state-1",
					roomId: "r1",
					lastBadge: "Too Cold",
					enteredAt: new Date(),
					notifiedAt: new Date(),
				},
			],
		);
		const { setMock } = mockUpdate();
		const sendAlertEmail = vi.fn();
		vi.mocked(getEmailClient).mockReturnValue({ sendAlertEmail });

		await detectAndDispatchAlerts();

		expect(setMock).toHaveBeenCalledWith({ lastBadge: "Too Hot" });
		expect(sendAlertEmail).not.toHaveBeenCalled();
	});

	it("violated→OK resets the row", async () => {
		deviceStateStore.set("sensor-r1", {
			isOnline: true,
			temperatureC: 21,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});
		mockQueryChain(
			[ROOM_1_DEVICE],
			[
				{
					id: "state-1",
					roomId: "r1",
					lastBadge: "Too Cold",
					enteredAt: new Date(),
					notifiedAt: new Date(),
				},
			],
		);
		const { setMock } = mockUpdate();
		const sendAlertEmail = vi.fn();
		vi.mocked(getEmailClient).mockReturnValue({ sendAlertEmail });

		await detectAndDispatchAlerts();

		expect(setMock).toHaveBeenCalledWith({
			lastBadge: "OK",
			enteredAt: null,
			notifiedAt: null,
		});
		expect(sendAlertEmail).not.toHaveBeenCalled();
	});

	it("zero contacts configured leaves the room pending with no client call", async () => {
		deviceStateStore.set("sensor-r1", {
			isOnline: true,
			temperatureC: 10,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});
		mockQueryChain([ROOM_1_DEVICE], [], []);
		const insertValues = mockInsert();
		const sendAlertEmail = vi.fn();
		vi.mocked(getEmailClient).mockReturnValue({ sendAlertEmail });

		await detectAndDispatchAlerts();

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({ roomId: "r1", lastBadge: "Too Cold" }),
		);
		expect(sendAlertEmail).not.toHaveBeenCalled();
	});

	it("two rooms violating in the same tick produce exactly one sendAlertEmail call with both", async () => {
		deviceStateStore.set("sensor-r1", {
			isOnline: true,
			temperatureC: 10,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});
		deviceStateStore.set("sensor-r2", {
			isOnline: true,
			temperatureC: 30,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});
		mockQueryChain([ROOM_1_DEVICE, ROOM_2_DEVICE], [], [{ id: "c1" }]);
		mockInsert();
		mockUpdate();
		const sendAlertEmail = vi.fn().mockResolvedValue(undefined);
		vi.mocked(getEmailClient).mockReturnValue({ sendAlertEmail });

		await detectAndDispatchAlerts();

		expect(sendAlertEmail).toHaveBeenCalledOnce();
		expect(sendAlertEmail).toHaveBeenCalledWith({
			violations: [
				{ roomId: "r1", roomName: "Room 1", badge: "Too Cold" },
				{ roomId: "r2", roomName: "Room 2", badge: "Too Hot" },
			],
		});
	});
});
