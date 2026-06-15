import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	deviceRoomAssignments,
	devices,
	deviceTemperatureReadings,
	gateways,
	rooms,
	roomThresholds,
	sites,
} from "~/server/db/schema";
import { decryptLocalKey } from "~/server/lib/crypto";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { type RoomBadge, scoreRoom } from "~/server/lib/scoring";
import { getTuyaClient } from "~/server/lib/tuya";
import { DP_CODE_MAP } from "~/server/lib/tuya/dp-codes";

const STALE_THRESHOLD_MS = 60_000;
const DEFAULT_THRESHOLDS = { anomalyGapC: 3, maxTempC: 24, minTempC: 18 };

export const deviceRouter = createTRPCRouter({
	setpoint: protectedProcedure
		.input(
			z.object({ deviceId: z.string(), setpointC: z.number().min(5).max(35) }),
		)
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
			// biome-ignore lint/style/noNonNullAssertion: productKey presence in DP_CODE_MAP validated by guard above
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

			if (!gateway.localKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "GATEWAY_KEY_NOT_SET",
				});
			}

			let plainKey: string;
			try {
				plainKey = decryptLocalKey(gateway.localKey);
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
					{
						dps,
						set: Math.round(input.setpointC * 10),
						cid: device.nodeId ?? undefined,
					},
				);
			} catch {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "COMMAND_FAILED",
				});
			}

			return { success: true as const, setpointC: input.setpointC };
		}),

	rename: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				siteId: z.string(),
				name: z.string().min(1).max(255),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [updated] = await ctx.db
				.update(devices)
				.set({ name: input.name, updatedAt: new Date() })
				.where(and(eq(devices.id, input.id), eq(devices.siteId, input.siteId)))
				.returning({ id: devices.id });
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
			}
			return { success: true as const };
		}),

	reorder: protectedProcedure
		.input(
			z.object({
				siteId: z.string(),
				items: z
					.array(
						z.object({ id: z.string(), sortOrder: z.number().int().min(0) }),
					)
					.max(200),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.items.length === 0) return { success: true as const };
			const ids = input.items.map((d) => d.id);
			const existing = await ctx.db
				.select({ id: devices.id })
				.from(devices)
				.where(and(inArray(devices.id, ids), eq(devices.siteId, input.siteId)));
			if (existing.length !== ids.length) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "One or more devices not found",
				});
			}
			await ctx.db.transaction(async (tx) => {
				for (const { id, sortOrder } of input.items) {
					await tx
						.update(devices)
						.set({ sortOrder, updatedAt: new Date() })
						.where(and(eq(devices.id, id), eq(devices.siteId, input.siteId)));
				}
			});
			return { success: true as const };
		}),

	move: protectedProcedure
		.input(
			z.object({
				deviceId: z.string(),
				roomId: z.string().nullable(),
				siteId: z.string(),
				items: z
					.array(
						z.object({ id: z.string(), sortOrder: z.number().int().min(0) }),
					)
					.max(200),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.roomId !== null) {
				const [room] = await ctx.db
					.select({ id: rooms.id, siteId: rooms.siteId })
					.from(rooms)
					.where(eq(rooms.id, input.roomId));
				if (!room) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
				}
				if (room.siteId !== input.siteId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "CROSS_SITE_ASSIGNMENT",
					});
				}
			}

			await ctx.db.transaction(async (tx) => {
				if (input.roomId !== null) {
					await tx
						.insert(deviceRoomAssignments)
						.values({ deviceId: input.deviceId, roomId: input.roomId })
						.onConflictDoUpdate({
							target: deviceRoomAssignments.deviceId,
							set: { roomId: input.roomId },
						});
				} else {
					await tx
						.delete(deviceRoomAssignments)
						.where(eq(deviceRoomAssignments.deviceId, input.deviceId));
				}
				for (const { id, sortOrder } of input.items) {
					await tx
						.update(devices)
						.set({ sortOrder, updatedAt: new Date() })
						.where(and(eq(devices.id, id), eq(devices.siteId, input.siteId)));
				}
			});
			return { success: true as const };
		}),

	temperatureHistory: protectedProcedure
		.input(
			z.object({
				tuyaDeviceId: z.string(),
				range: z.enum(["1h", "24h", "7d"]),
			}),
		)
		.query(async ({ ctx, input }) => {
			const nowSeconds = Math.floor(Date.now() / 1000);
			const rangeSecs = { "1h": 3600, "24h": 86400, "7d": 604800 } as const;
			const fromTs = new Date((nowSeconds - rangeSecs[input.range]) * 1000);

			if (input.range === "1h") {
				return ctx.db
					.select({
						recordedAt: deviceTemperatureReadings.recordedAt,
						temperatureC: deviceTemperatureReadings.temperatureC,
						setpointC: deviceTemperatureReadings.setpointC,
					})
					.from(deviceTemperatureReadings)
					.where(
						and(
							eq(deviceTemperatureReadings.tuyaDeviceId, input.tuyaDeviceId),
							gte(deviceTemperatureReadings.recordedAt, fromTs),
						),
					)
					.orderBy(asc(deviceTemperatureReadings.recordedAt));
			}

			const bucketSize = input.range === "24h" ? 300 : 3600;
			const bucketExpr = sql<number>`(${deviceTemperatureReadings.recordedAt} / ${bucketSize}) * ${bucketSize}`;
			const rows = await ctx.db
				.select({
					bucket: bucketExpr,
					temperatureC: sql<
						string | null
					>`AVG(${deviceTemperatureReadings.temperatureC})`,
					setpointC: sql<
						string | null
					>`AVG(${deviceTemperatureReadings.setpointC})`,
				})
				.from(deviceTemperatureReadings)
				.where(
					and(
						eq(deviceTemperatureReadings.tuyaDeviceId, input.tuyaDeviceId),
						gte(deviceTemperatureReadings.recordedAt, fromTs),
					),
				)
				.groupBy(bucketExpr)
				.orderBy(asc(bucketExpr));

			return rows.map((r) => ({
				recordedAt: new Date(r.bucket * 1000),
				temperatureC: r.temperatureC !== null ? Number(r.temperatureC) : null,
				setpointC: r.setpointC !== null ? Number(r.setpointC) : null,
			}));
		}),

	overview: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.query(async ({ ctx, input }) => {
			const baseQuery = ctx.db
				.select({ device: devices, room: rooms })
				.from(devices)
				.leftJoin(
					deviceRoomAssignments,
					eq(deviceRoomAssignments.deviceId, devices.id),
				)
				.leftJoin(rooms, eq(rooms.id, deviceRoomAssignments.roomId))
				.orderBy(asc(devices.sortOrder));

			const rows =
				input.siteId !== "all"
					? await baseQuery.where(eq(devices.siteId, input.siteId))
					: await baseQuery;

			const roomsMap = new Map<
				string,
				{
					roomId: string;
					roomName: string;
					siteId: string;
					devices: DeviceItem[];
				}
			>();
			const unassigned: DeviceItem[] = [];

			for (const row of rows) {
				const state = deviceStateStore.get(row.device.tuyaDeviceId);
				const isStale = state?.lastPolledAt
					? Date.now() - state.lastPolledAt.getTime() > STALE_THRESHOLD_MS
					: false;
				const deviceSiteId = row.device.siteId ?? "";
				const item: DeviceItem = {
					id: row.device.id,
					tuyaDeviceId: row.device.tuyaDeviceId,
					name: row.device.name,
					deviceType: row.device.deviceType as "sensor" | "valve" | "plug",
					roomId: row.room?.id ?? null,
					roomName: row.room?.name ?? null,
					siteId: deviceSiteId,
					nodeId: row.device.nodeId ?? null,
					sortOrder: row.device.sortOrder,
					isOnline: state?.isOnline ?? false,
					temperatureC: state?.temperatureC ?? null,
					setpointC: state?.setpointC ?? null,
					humidityPct: state?.humidityPct ?? null,
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
							siteId: row.room.siteId ?? "",
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

			const siteRows = await ctx.db
				.select({ id: sites.id, name: sites.name })
				.from(sites);
			const siteMap = new Map(siteRows.map((s) => [s.id, s.name]));

			const scoredRooms = Array.from(roomsMap.values()).map((room) => {
				const roomTempC = room.devices
					.filter((d) => d.deviceType === "sensor")
					.flatMap((d) => (d.temperatureC !== null ? [d.temperatureC] : []))
					.reduce<number | null>(
						(min, t) => (min === null || t < min ? t : min),
						null,
					);
				const valve = room.devices.find((d) => d.deviceType === "valve");
				const valveSetpointC = valve
					? (deviceStateStore.get(valve.tuyaDeviceId)?.setpointC ?? null)
					: null;
				const thresholds = thresholdMap.get(room.roomId) ?? DEFAULT_THRESHOLDS;
				const score = scoreRoom(roomTempC, valveSetpointC, thresholds);
				return { ...room, siteName: siteMap.get(room.siteId) ?? "", ...score };
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
	siteId: string;
	nodeId: string | null;
	sortOrder: number;
	isOnline: boolean;
	temperatureC: number | null;
	setpointC: number | null;
	humidityPct: number | null;
	lastPolledAt: Date | null;
	isStale: boolean;
}

// Re-export so the return type of device.overview is fully typed on the client.
export type { RoomBadge };
