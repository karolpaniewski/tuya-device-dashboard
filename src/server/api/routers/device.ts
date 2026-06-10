import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	deviceRoomAssignments,
	devices,
	gateways,
	rooms,
	roomThresholds,
} from "~/server/db/schema";
import { decryptLocalKey } from "~/server/lib/crypto";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { type RoomBadge, scoreRoom } from "~/server/lib/scoring";
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
				setpointC: state?.setpointC ?? null,
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

		// Separate query to avoid deepening the existing mock chain in tests
		const thresholdRows = await ctx.db.select().from(roomThresholds);
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

		const scoredRooms = Array.from(roomsMap.values()).map((room) => {
			const sensor = room.devices.find(
				(d) => d.deviceType === "sensor" && d.temperatureC !== null,
			);
			const valve = room.devices.find((d) => d.deviceType === "valve");
			const valveSetpointC = valve
				? (deviceStateStore.get(valve.tuyaDeviceId)?.setpointC ?? null)
				: null;
			const thresholds = thresholdMap.get(room.roomId) ?? {
				minTempC: null,
				maxTempC: null,
				anomalyGapC: null,
			};
			const score = scoreRoom(
				sensor?.temperatureC ?? null,
				valveSetpointC,
				thresholds,
			);
			return { ...room, ...score };
		});

		return { rooms: scoredRooms, unassigned };
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
	setpointC: number | null;
	lastPolledAt: Date | null;
	isStale: boolean;
}

// Re-export so the return type of device.overview is fully typed on the client.
export type { RoomBadge };
