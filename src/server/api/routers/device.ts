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
import {
	type ComplianceBucket,
	computeRoomCompliance,
} from "~/server/lib/comfort-compliance";
import { ACTIVE_DEVICE_SOURCE } from "~/server/lib/device-source";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { sendPlugCommand } from "~/server/lib/plug-control";
import {
	DEFAULT_THRESHOLDS,
	type RoomBadge,
	scoreRoom,
} from "~/server/lib/scoring";
import { sendSetpointCommand } from "~/server/lib/valve-control";

const SEVEN_DAYS_SECS = 604_800;
const BUCKET_SIZE_SECS = 3600;
const BUCKET_COUNT = SEVEN_DAYS_SECS / BUCKET_SIZE_SECS; // 168

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

	setMapPosition: protectedProcedure
		.input(
			z.object({
				deviceId: z.string(),
				siteId: z.string(),
				xPct: z.number().min(0).max(100),
				yPct: z.number().min(0).max(100),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [updated] = await ctx.db
				.update(devices)
				.set({
					mapXPct: input.xPct,
					mapYPct: input.yPct,
					updatedAt: new Date(),
				})
				.where(
					and(eq(devices.id, input.deviceId), eq(devices.siteId, input.siteId)),
				)
				.returning({ id: devices.id });
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
			}
			return { success: true as const };
		}),

	clearMapPosition: protectedProcedure
		.input(z.object({ deviceId: z.string(), siteId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [updated] = await ctx.db
				.update(devices)
				.set({ mapXPct: null, mapYPct: null, updatedAt: new Date() })
				.where(
					and(eq(devices.id, input.deviceId), eq(devices.siteId, input.siteId)),
				)
				.returning({ id: devices.id });
			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
			}
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
					mapXPct: row.device.mapXPct ?? null,
					mapYPct: row.device.mapYPct ?? null,
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

	comfortComplianceRanking: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.query(async ({ ctx, input }) => {
			const allRoomRows =
				input.siteId !== "all"
					? await ctx.db
							.select({ id: rooms.id, name: rooms.name })
							.from(rooms)
							.where(eq(rooms.siteId, input.siteId))
					: await ctx.db.select({ id: rooms.id, name: rooms.name }).from(rooms);

			if (allRoomRows.length === 0) return [];

			// Match `overview`'s room membership rule (a room only "exists" there
			// once it has at least one assigned device) so every ranked row here
			// is guaranteed to resolve when clicked through to the detail sheet.
			const roomsWithDeviceRows = await ctx.db
				.selectDistinct({ roomId: deviceRoomAssignments.roomId })
				.from(devices)
				.innerJoin(
					deviceRoomAssignments,
					eq(deviceRoomAssignments.deviceId, devices.id),
				)
				.where(
					input.siteId !== "all"
						? and(
								eq(devices.siteId, input.siteId),
								eq(devices.source, ACTIVE_DEVICE_SOURCE),
							)
						: eq(devices.source, ACTIVE_DEVICE_SOURCE),
				);
			const roomIdsWithDevices = new Set(
				roomsWithDeviceRows.map((r) => r.roomId),
			);
			const roomRows = allRoomRows.filter((r) => roomIdsWithDevices.has(r.id));

			if (roomRows.length === 0) return [];

			const roomIds = roomRows.map((r) => r.id);
			const sensorRoomRows = await ctx.db
				.select({
					tuyaDeviceId: devices.tuyaDeviceId,
					roomId: deviceRoomAssignments.roomId,
				})
				.from(devices)
				.innerJoin(
					deviceRoomAssignments,
					eq(deviceRoomAssignments.deviceId, devices.id),
				)
				.where(
					and(
						eq(devices.deviceType, "sensor"),
						eq(devices.source, ACTIVE_DEVICE_SOURCE),
						inArray(deviceRoomAssignments.roomId, roomIds),
					),
				);

			const roomDeviceMap = new Map<string, string[]>();
			for (const row of sensorRoomRows) {
				const list = roomDeviceMap.get(row.roomId);
				if (list) {
					list.push(row.tuyaDeviceId);
				} else {
					roomDeviceMap.set(row.roomId, [row.tuyaDeviceId]);
				}
			}

			const thresholdRows = await ctx.db.select().from(roomThresholds);
			const thresholdMap = new Map(
				thresholdRows.map((t) => [
					t.roomId,
					{ minTempC: t.minTempC ?? null, maxTempC: t.maxTempC ?? null },
				]),
			);

			const [defaultThresholdRow] = await ctx.db
				.select()
				.from(defaultThresholds)
				.where(eq(defaultThresholds.id, "default"));
			const dbDefaultThresholds = defaultThresholdRow
				? {
						minTempC: defaultThresholdRow.minTempC,
						maxTempC: defaultThresholdRow.maxTempC,
					}
				: {
						minTempC: DEFAULT_THRESHOLDS.minTempC,
						maxTempC: DEFAULT_THRESHOLDS.maxTempC,
					};

			const allTuyaDeviceIds = sensorRoomRows.map((r) => r.tuyaDeviceId);

			const nowSeconds = Math.floor(Date.now() / 1000);
			const nowBucketSecs =
				Math.floor(nowSeconds / BUCKET_SIZE_SECS) * BUCKET_SIZE_SECS;
			const fromBucketSecs = nowBucketSecs - BUCKET_COUNT * BUCKET_SIZE_SECS;
			const fromTs = new Date(fromBucketSecs * 1000);

			const deviceBucketMap = new Map<string, Map<number, number>>();
			if (allTuyaDeviceIds.length > 0) {
				const bucketExpr = sql<number>`(${deviceTemperatureReadings.recordedAt} / ${BUCKET_SIZE_SECS}) * ${BUCKET_SIZE_SECS}`;
				const readingRows = await ctx.db
					.select({
						tuyaDeviceId: deviceTemperatureReadings.tuyaDeviceId,
						bucket: bucketExpr,
						temperatureC: sql<
							string | null
						>`AVG(${deviceTemperatureReadings.temperatureC})`,
					})
					.from(deviceTemperatureReadings)
					.where(
						and(
							inArray(deviceTemperatureReadings.tuyaDeviceId, allTuyaDeviceIds),
							gte(deviceTemperatureReadings.recordedAt, fromTs),
						),
					)
					.groupBy(deviceTemperatureReadings.tuyaDeviceId, bucketExpr);

				for (const row of readingRows) {
					if (row.temperatureC === null) continue;
					let bucketMap = deviceBucketMap.get(row.tuyaDeviceId);
					if (!bucketMap) {
						bucketMap = new Map();
						deviceBucketMap.set(row.tuyaDeviceId, bucketMap);
					}
					bucketMap.set(row.bucket, Number(row.temperatureC));
				}
			}

			const bucketStartsSecs = Array.from(
				{ length: BUCKET_COUNT },
				(_, i) => fromBucketSecs + i * BUCKET_SIZE_SECS,
			);

			const results = roomRows.map((room) => {
				const tuyaDeviceIds = roomDeviceMap.get(room.id) ?? [];
				const thresholds = thresholdMap.get(room.id) ?? dbDefaultThresholds;

				const buckets: ComplianceBucket[] = bucketStartsSecs.map(
					(bucketStartSecs) => {
						let min: number | null = null;
						for (const tuyaDeviceId of tuyaDeviceIds) {
							const val = deviceBucketMap
								.get(tuyaDeviceId)
								?.get(bucketStartSecs);
							if (val !== undefined && (min === null || val < min)) {
								min = val;
							}
						}
						return { bucketStartMs: bucketStartSecs * 1000, temperatureC: min };
					},
				);

				const compliance = computeRoomCompliance(buckets, thresholds);
				return {
					roomId: room.id,
					roomName: room.name,
					...compliance,
				};
			});

			return results.sort((a, b) => {
				if (a.pctOutOfThreshold === null && b.pctOutOfThreshold === null) {
					return 0;
				}
				if (a.pctOutOfThreshold === null) return 1;
				if (b.pctOutOfThreshold === null) return -1;
				return b.pctOutOfThreshold - a.pctOutOfThreshold;
			});
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
	mapXPct: number | null;
	mapYPct: number | null;
}

// Re-export so the return type of device.overview is fully typed on the client.
export type { RoomBadge };
