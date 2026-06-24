import { eq, inArray } from "drizzle-orm";

import { db } from "~/server/db";
import {
	defaultThresholds,
	deviceRoomAssignments,
	devices,
	notificationContacts,
	roomAlertState,
	rooms,
	roomThresholds,
} from "~/server/db/schema";
import { ACTIVE_DEVICE_SOURCE } from "~/server/lib/device-source";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getEmailClient } from "~/server/lib/email";
import { getLogger } from "~/server/lib/log-context";
import {
	DEFAULT_THRESHOLDS,
	type RoomBadge,
	scoreRoom,
} from "~/server/lib/scoring";

interface RoomData {
	roomName: string;
	sensorTemps: number[];
	valveSetpointC: number | null;
}

function roomTempC(data: RoomData): number | null {
	return data.sensorTemps.reduce<number | null>(
		(min, t) => (min === null || t < min ? t : min),
		null,
	);
}

export async function detectAndDispatchAlerts(): Promise<void> {
	const deviceRows = await db
		.select({
			roomId: deviceRoomAssignments.roomId,
			roomName: rooms.name,
			tuyaDeviceId: devices.tuyaDeviceId,
			deviceType: devices.deviceType,
		})
		.from(deviceRoomAssignments)
		.innerJoin(devices, eq(devices.id, deviceRoomAssignments.deviceId))
		.innerJoin(rooms, eq(rooms.id, deviceRoomAssignments.roomId))
		.where(eq(devices.source, ACTIVE_DEVICE_SOURCE));

	const roomData = new Map<string, RoomData>();
	for (const row of deviceRows) {
		const state = deviceStateStore.get(row.tuyaDeviceId);
		const entry: RoomData = roomData.get(row.roomId) ?? {
			roomName: row.roomName,
			sensorTemps: [],
			valveSetpointC: null,
		};
		if (row.deviceType === "sensor" && state?.temperatureC != null) {
			entry.sensorTemps.push(state.temperatureC);
		}
		if (row.deviceType === "valve") {
			entry.valveSetpointC = state?.setpointC ?? null;
		}
		roomData.set(row.roomId, entry);
	}

	const thresholdRows = await db.select().from(roomThresholds);
	const thresholdMap = new Map(
		thresholdRows.map((t) => [
			t.roomId,
			{
				minTempC: t.minTempC ?? null,
				maxTempC: t.maxTempC ?? null,
				anomalyGapC: t.anomalyGapC ?? null,
			},
		]),
	);

	const [defaultThresholdRow] = await db
		.select()
		.from(defaultThresholds)
		.where(eq(defaultThresholds.id, "default"));
	const dbDefaultThresholds = defaultThresholdRow
		? {
				minTempC: defaultThresholdRow.minTempC,
				maxTempC: defaultThresholdRow.maxTempC,
				anomalyGapC: defaultThresholdRow.anomalyGapC,
			}
		: DEFAULT_THRESHOLDS;

	const alertStateRows = await db.select().from(roomAlertState);
	const alertStateMap = new Map(alertStateRows.map((a) => [a.roomId, a]));

	const violations: {
		roomId: string;
		roomName: string;
		badge: "Too Cold" | "Too Hot";
	}[] = [];

	for (const [roomId, data] of roomData) {
		try {
			const thresholds = thresholdMap.get(roomId) ?? dbDefaultThresholds;
			const score = scoreRoom(roomTempC(data), data.valveSetpointC, thresholds);
			const newBadge: RoomBadge = score.badge ?? "OK";
			const existing = alertStateMap.get(roomId);

			if (newBadge === "OK") {
				if (existing && existing.lastBadge !== "OK") {
					await db
						.update(roomAlertState)
						.set({ lastBadge: "OK", enteredAt: null, notifiedAt: null })
						.where(eq(roomAlertState.id, existing.id));
				}
				continue;
			}

			if (!existing || existing.lastBadge === "OK") {
				// New episode.
				if (existing) {
					await db
						.update(roomAlertState)
						.set({
							lastBadge: newBadge,
							enteredAt: new Date(),
							notifiedAt: null,
						})
						.where(eq(roomAlertState.id, existing.id));
				} else {
					await db.insert(roomAlertState).values({
						roomId,
						lastBadge: newBadge,
						enteredAt: new Date(),
						notifiedAt: null,
					});
				}
				violations.push({ roomId, roomName: data.roomName, badge: newBadge });
			} else {
				// Episode already in progress — record a Cold<->Hot flip without re-alerting.
				if (existing.lastBadge !== newBadge) {
					await db
						.update(roomAlertState)
						.set({ lastBadge: newBadge })
						.where(eq(roomAlertState.id, existing.id));
				}
				if (existing.notifiedAt == null) {
					violations.push({ roomId, roomName: data.roomName, badge: newBadge });
				}
			}
		} catch (err) {
			getLogger().error({ err, roomId }, "alert-control.room-failed");
		}
	}

	if (violations.length === 0) return;

	const contacts = await db
		.select({ id: notificationContacts.id })
		.from(notificationContacts);
	if (contacts.length === 0) return;

	try {
		await getEmailClient().sendAlertEmail({ violations });
		await db
			.update(roomAlertState)
			.set({ notifiedAt: new Date() })
			.where(
				inArray(
					roomAlertState.roomId,
					violations.map((v) => v.roomId),
				),
			);
	} catch (err) {
		getLogger().error({ err }, "alert-control.send-failed");
	}
}
