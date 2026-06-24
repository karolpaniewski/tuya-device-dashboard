import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import {
	defaultThresholds,
	deviceRoomAssignments,
	devices,
	deviceTemperatureReadings,
	roomAlertState,
	roomHeatState,
	rooms,
	roomThresholds,
	sites,
} from "~/server/db/schema";
import { ACTIVE_DEVICE_SOURCE } from "~/server/lib/device-source";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { sendPlugCommand } from "~/server/lib/plug-control";
import {
	DEFAULT_THRESHOLDS,
	type RoomBadge,
	scoreRoom,
} from "~/server/lib/scoring";
import { sendSetpointCommand } from "~/server/lib/valve-control";

const STALE_THRESHOLD_MS = 60_000;

export const deviceRouter = createTRPCRouter({
	setpoint: protectedProcedure
		.input(
			z.object({ deviceId: z.string(), setpointC: z.number().min(5).max(35) }),
		)
		.mutation(async ({ input }) => {
			const [assignment] = await db
				.select({ roomId: deviceRoomAssignments.roomId })
				.from(deviceRoomAssignments)
				.where(eq(deviceRoomAssignments.deviceId, input.deviceId));

			if (assignment) {
				const [heatState] = await db
					.select({ pinnedOff: roomHeatState.pinnedOff })
					.from(roomHeatState)
					.where(eq(roomHeatState.roomId, assignment.roomId));

				if (heatState?.pinnedOff) {
					return { success: true as const, setpointC: input.setpointC };
				}
			}

			try {
				await sendSetpointCommand(input.deviceId, input.setpointC);
			} catch (err) {
				const message = err instanceof Error ? err.message : "COMMAND_FAILED";
				switch (message) {
					case "DEVICE_NOT_FOUND":
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Device not found",
						});
					case "UNSUPPORTED_DEVICE":
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "UNSUPPORTED_DEVICE",
						});
					case "DEVICE_NOT_PAIRED":
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "DEVICE_NOT_PAIRED",
						});
					case "GATEWAY_NOT_FOUND":
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Gateway not found",
						});
					case "GATEWAY_KEY_NOT_SET":
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "GATEWAY_KEY_NOT_SET",
						});
					case "KEY_DECRYPT_FAILED":
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "KEY_DECRYPT_FAILED",
						});
					default:
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "COMMAND_FAILED",
						});
				}
			}

			return { success: true as const, setpointC: input.setpointC };
		}),

	setPlugState: protectedProcedure
		.input(z.object({ deviceId: z.string(), isOn: z.boolean() }))
		.mutation(async ({ input }) => {
			try {
				await sendPlugCommand(input.deviceId, input.isOn);
			} catch (err) {
				const message = err instanceof Error ? err.message : "COMMAND_FAILED";
				switch (message) {
					case "DEVICE_NOT_FOUND":
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Device not found",
						});
					case "UNSUPPORTED_DEVICE":
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "UNSUPPORTED_DEVICE",
						});
					case "DEVICE_NOT_PAIRED":
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "DEVICE_NOT_PAIRED",
						});
					case "GATEWAY_NOT_FOUND":
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Gateway not found",
						});
					case "GATEWAY_KEY_NOT_SET":
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "GATEWAY_KEY_NOT_SET",
						});
					case "KEY_DECRYPT_FAILED":
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "KEY_DECRYPT_FAILED",
						});
					default:
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "COMMAND_FAILED",
						});
				}
			}

			return { success: true as const, isOn: input.isOn };
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
					? await baseQuery.where(
							and(
								eq(devices.siteId, input.siteId),
								eq(devices.source, ACTIVE_DEVICE_SOURCE),
							),
						)
					: await baseQuery.where(eq(devices.source, ACTIVE_DEVICE_SOURCE));

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
					isOn: state?.isOn ?? null,
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
			const heatStateRows = await ctx.db.select().from(roomHeatState);
			const heatStateMap = new Map(
				heatStateRows.map((h) => [
					h.roomId,
					{ pinnedOff: h.pinnedOff, pinnedAt: h.pinnedAt ?? null },
				]),
			);

			// Separate query to avoid deepening the existing mock chain in tests
			const alertStateRows = await ctx.db.select().from(roomAlertState);
			const alertStateMap = new Map(
				alertStateRows.map((a) => [a.roomId, { notifiedAt: a.notifiedAt }]),
			);

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

			const [defaultThresholdRow] = await ctx.db
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
				const thresholds = thresholdMap.get(room.roomId) ?? dbDefaultThresholds;
				const score = scoreRoom(roomTempC, valveSetpointC, thresholds);
				const heatState = heatStateMap.get(room.roomId) ?? {
					pinnedOff: false,
					pinnedAt: null,
				};
				return {
					...room,
					siteName: siteMap.get(room.siteId) ?? "",
					...score,
					...heatState,
					alertSent: alertStateMap.get(room.roomId)?.notifiedAt != null,
				};
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
	isOn: boolean | null;
	lastPolledAt: Date | null;
	isStale: boolean;
}

// Re-export so the return type of device.overview is fully typed on the client.
export type { RoomBadge };
