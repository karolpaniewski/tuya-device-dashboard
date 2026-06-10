import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	deviceRoomAssignments,
	devices,
	gateways,
	rooms,
} from "~/server/db/schema";
import { decryptLocalKey } from "~/server/lib/crypto";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getTuyaClient } from "~/server/lib/tuya";
import { DP_CODE_MAP } from "~/server/lib/tuya/dp-codes";

const STALE_THRESHOLD_MS = 60_000;

export const deviceRouter = createTRPCRouter({
	setpoint: protectedProcedure
		.input(z.object({ deviceId: z.string(), setpointC: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const [device] = await ctx.db
				.select()
				.from(devices)
				.where(eq(devices.id, input.deviceId));

			if (!device) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
			}

			if (device.productKey === null || !(device.productKey in DP_CODE_MAP)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "UNSUPPORTED_DEVICE",
				});
			}
			const dps = DP_CODE_MAP[device.productKey]!;

			if (device.gatewayId === null) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "DEVICE_NOT_PAIRED",
				});
			}

			const [gateway] = await ctx.db
				.select()
				.from(gateways)
				.where(eq(gateways.id, device.gatewayId));

			if (!gateway) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Gateway not found",
				});
			}

			let plainKey: string;
			try {
				plainKey = decryptLocalKey(gateway.localKey ?? "");
			} catch {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "KEY_DECRYPT_FAILED",
				});
			}

			const client = getTuyaClient();
			try {
				await client.sendSetpoint(
					{
						tuyaGatewayId: gateway.tuyaGatewayId,
						ipAddress: gateway.ipAddress ?? null,
						localKey: plainKey,
					},
					{ dps, set: input.setpointC },
				);
			} catch {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "COMMAND_FAILED",
				});
			}

			return { success: true as const, setpointC: input.setpointC };
		}),

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
			const isStale = state?.lastPolledAt
				? Date.now() - state.lastPolledAt.getTime() > STALE_THRESHOLD_MS
				: false;
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
				isStale,
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
	isStale: boolean;
}
