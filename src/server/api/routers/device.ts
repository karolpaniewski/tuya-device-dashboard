import { eq } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { deviceRoomAssignments, devices, rooms } from "~/server/db/schema";
import { deviceStateStore } from "~/server/lib/device-state-store";

export const deviceRouter = createTRPCRouter({
	overview: protectedProcedure.query(async ({ ctx }) => {
		const rows = await ctx.db
			.select({ device: devices, room: rooms })
			.from(devices)
			.leftJoin(
				deviceRoomAssignments,
				eq(deviceRoomAssignments.deviceId, devices.id),
			)
			.leftJoin(rooms, eq(rooms.id, deviceRoomAssignments.roomId));

		const roomsMap = new Map<
			string,
			{ roomId: string; roomName: string; devices: DeviceItem[] }
		>();
		const unassigned: DeviceItem[] = [];

		for (const row of rows) {
			const state = deviceStateStore.get(row.device.tuyaDeviceId);
			const item: DeviceItem = {
				id: row.device.id,
				tuyaDeviceId: row.device.tuyaDeviceId,
				name: row.device.name,
				deviceType: row.device.deviceType as "sensor" | "valve" | "plug",
				roomId: row.room?.id ?? null,
				roomName: row.room?.name ?? null,
				isOnline: state?.isOnline ?? false,
				temperatureC: state?.temperatureC ?? null,
				lastPolledAt: state?.lastPolledAt ?? null,
			};

			if (row.room) {
				const existing = roomsMap.get(row.room.id);
				if (existing) {
					existing.devices.push(item);
				} else {
					roomsMap.set(row.room.id, {
						roomId: row.room.id,
						roomName: row.room.name,
						devices: [item],
					});
				}
			} else {
				unassigned.push(item);
			}
		}

		return {
			rooms: Array.from(roomsMap.values()),
			unassigned,
		};
	}),
});

interface DeviceItem {
	id: string;
	tuyaDeviceId: string;
	name: string;
	deviceType: "sensor" | "valve" | "plug";
	roomId: string | null;
	roomName: string | null;
	isOnline: boolean;
	temperatureC: number | null;
	lastPolledAt: Date | null;
}
