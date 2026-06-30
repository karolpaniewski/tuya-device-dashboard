import { desc, eq, gte } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { devices, eventLog, rooms } from "~/server/db/schema";

export const eventRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

		return ctx.db
			.select({
				id: eventLog.id,
				createdAt: eventLog.createdAt,
				eventType: eventLog.eventType,
				roomId: eventLog.roomId,
				deviceId: eventLog.deviceId,
				payload: eventLog.payload,
				roomName: rooms.name,
				deviceName: devices.name,
			})
			.from(eventLog)
			.leftJoin(rooms, eq(eventLog.roomId, rooms.id))
			.leftJoin(devices, eq(eventLog.deviceId, devices.tuyaDeviceId))
			.where(gte(eventLog.createdAt, since))
			.orderBy(desc(eventLog.createdAt))
			.limit(200);
	}),
});
