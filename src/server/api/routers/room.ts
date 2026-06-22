import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	deviceRoomAssignments,
	devices,
	gateways,
	roomHeatState,
	rooms,
	roomThresholds,
	sites,
} from "~/server/db/schema";
import { ACTIVE_DEVICE_SOURCE } from "~/server/lib/device-source";
import { sendValveStateCommand } from "~/server/lib/valve-control";

export const roomRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.query(async ({ ctx, input }) => {
			const allRooms =
				input.siteId !== "all"
					? await ctx.db
							.select()
							.from(rooms)
							.where(
								and(
									eq(rooms.siteId, input.siteId),
									eq(rooms.source, ACTIVE_DEVICE_SOURCE),
								),
							)
							.orderBy(rooms.createdAt)
					: await ctx.db
							.select()
							.from(rooms)
							.where(eq(rooms.source, ACTIVE_DEVICE_SOURCE))
							.orderBy(rooms.createdAt);

			const assignments = await ctx.db
				.select({ roomId: deviceRoomAssignments.roomId })
				.from(deviceRoomAssignments);

			const countByRoom = new Map<string, number>();
			for (const a of assignments) {
				countByRoom.set(a.roomId, (countByRoom.get(a.roomId) ?? 0) + 1);
			}

			return allRooms.map((room) => ({
				id: room.id,
				name: room.name,
				siteId: room.siteId,
				deviceCount: countByRoom.get(room.id) ?? 0,
			}));
		}),

	create: protectedProcedure
		.input(
			z.object({ name: z.string().min(1).max(255), siteId: z.string().min(1) }),
		)
		.mutation(async ({ ctx, input }) => {
			const [site] = await ctx.db
				.select({ id: sites.id })
				.from(sites)
				.where(eq(sites.id, input.siteId));

			if (!site) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Site not found" });
			}

			const [created] = await ctx.db
				.insert(rooms)
				.values({ name: input.name, siteId: input.siteId })
				.returning({ id: rooms.id, name: rooms.name });

			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "INSERT_FAILED",
				});
			}

			return created;
		}),

	rename: protectedProcedure
		.input(z.object({ id: z.string(), name: z.string().min(1).max(255) }))
		.mutation(async ({ ctx, input }) => {
			const [updated] = await ctx.db
				.update(rooms)
				.set({ name: input.name })
				.where(eq(rooms.id, input.id))
				.returning({ id: rooms.id, name: rooms.name });

			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
			}

			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const assigned = await ctx.db
				.select({ deviceId: deviceRoomAssignments.deviceId })
				.from(deviceRoomAssignments)
				.where(eq(deviceRoomAssignments.roomId, input.id));

			if (assigned.length > 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Room has assigned devices — reassign them first",
				});
			}

			await ctx.db.delete(rooms).where(eq(rooms.id, input.id));

			return { success: true as const };
		}),

	setDeviceRoom: protectedProcedure
		.input(z.object({ deviceId: z.string(), roomId: z.string().nullable() }))
		.mutation(async ({ ctx, input }) => {
			if (input.roomId !== null) {
				const [room] = await ctx.db
					.select({ id: rooms.id, siteId: rooms.siteId })
					.from(rooms)
					.where(eq(rooms.id, input.roomId));

				if (!room) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Room not found",
					});
				}

				const [device] = await ctx.db
					.select({ siteId: devices.siteId })
					.from(devices)
					.where(eq(devices.id, input.deviceId));

				if (device && room.siteId !== device.siteId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "CROSS_SITE_ASSIGNMENT",
					});
				}

				await ctx.db
					.insert(deviceRoomAssignments)
					.values({ deviceId: input.deviceId, roomId: input.roomId })
					.onConflictDoUpdate({
						target: deviceRoomAssignments.deviceId,
						set: { roomId: input.roomId },
					});
			} else {
				await ctx.db
					.delete(deviceRoomAssignments)
					.where(eq(deviceRoomAssignments.deviceId, input.deviceId));
			}

			return { success: true as const };
		}),

	setSite: protectedProcedure
		.input(z.object({ roomId: z.string(), targetSiteId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [targetSite] = await ctx.db
				.select({ id: sites.id })
				.from(sites)
				.where(eq(sites.id, input.targetSiteId));

			if (!targetSite) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Site not found" });
			}

			const [room] = await ctx.db
				.select({ id: rooms.id, siteId: rooms.siteId })
				.from(rooms)
				.where(eq(rooms.id, input.roomId));

			if (!room) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
			}

			if (room.siteId === input.targetSiteId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Room is already assigned to this site",
				});
			}

			const assignedDevices = await ctx.db
				.select({ deviceId: deviceRoomAssignments.deviceId })
				.from(deviceRoomAssignments)
				.where(eq(deviceRoomAssignments.roomId, input.roomId));

			const deviceIds = assignedDevices.map((a) => a.deviceId);

			let gatewayIds: string[] = [];
			if (deviceIds.length > 0) {
				const deviceRows = await ctx.db
					.select({ gatewayId: devices.gatewayId })
					.from(devices)
					.where(inArray(devices.id, deviceIds));

				gatewayIds = [
					...new Set(
						deviceRows
							.map((d) => d.gatewayId)
							.filter((id): id is string => id !== null),
					),
				];
			}

			// A gateway only moves with the room if every device on it is
			// assigned to this room — a device on the same gateway that is
			// unassigned or assigned elsewhere blocks the whole move, since
			// cascading the gateway's siteId would otherwise leave that
			// device's siteId silently inconsistent with its gateway.
			if (gatewayIds.length > 0) {
				const gatewayDeviceRows = await ctx.db
					.select({
						deviceId: devices.id,
						gatewayId: devices.gatewayId,
						roomId: deviceRoomAssignments.roomId,
					})
					.from(devices)
					.leftJoin(
						deviceRoomAssignments,
						eq(deviceRoomAssignments.deviceId, devices.id),
					)
					.where(inArray(devices.gatewayId, gatewayIds));

				const sharedGateway = gatewayDeviceRows.some(
					(row) => row.roomId !== input.roomId,
				);

				if (sharedGateway) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "GATEWAY_SHARED_WITH_OTHER_ROOM",
					});
				}
			}

			await ctx.db.transaction(async (tx) => {
				await tx
					.update(rooms)
					.set({ siteId: input.targetSiteId })
					.where(eq(rooms.id, input.roomId));

				if (deviceIds.length > 0) {
					await tx
						.update(devices)
						.set({ siteId: input.targetSiteId })
						.where(inArray(devices.id, deviceIds));
				}

				if (gatewayIds.length > 0) {
					await tx
						.update(gateways)
						.set({ siteId: input.targetSiteId })
						.where(inArray(gateways.id, gatewayIds));
				}
			});

			return { success: true as const };
		}),

	getThreshold: protectedProcedure
		.input(z.object({ roomId: z.string() }))
		.query(async ({ ctx, input }) => {
			const [row] = await ctx.db
				.select()
				.from(roomThresholds)
				.where(eq(roomThresholds.roomId, input.roomId));

			if (!row) return null;

			return {
				anomalyGapC: row.anomalyGapC,
				maxTempC: row.maxTempC,
				minTempC: row.minTempC,
			};
		}),

	setThreshold: protectedProcedure
		.input(
			z.object({
				anomalyGapC: z.number().min(0),
				maxTempC: z.number(),
				minTempC: z.number(),
				roomId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [room] = await ctx.db
				.select({ id: rooms.id })
				.from(rooms)
				.where(eq(rooms.id, input.roomId));

			if (!room) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
			}

			if (input.minTempC >= input.maxTempC) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Min must be less than max",
				});
			}

			await ctx.db
				.insert(roomThresholds)
				.values({
					anomalyGapC: input.anomalyGapC,
					maxTempC: input.maxTempC,
					minTempC: input.minTempC,
					roomId: input.roomId,
				})
				.onConflictDoUpdate({
					target: roomThresholds.roomId,
					set: {
						anomalyGapC: input.anomalyGapC,
						maxTempC: input.maxTempC,
						minTempC: input.minTempC,
					},
				});

			return { success: true as const };
		}),

	toggleHeat: protectedProcedure
		.input(z.object({ roomId: z.string(), pinnedOff: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const [room] = await ctx.db
				.select({ id: rooms.id })
				.from(rooms)
				.where(eq(rooms.id, input.roomId));

			if (!room) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
			}

			const valveDevices = await ctx.db
				.select({ deviceId: devices.id })
				.from(deviceRoomAssignments)
				.innerJoin(devices, eq(devices.id, deviceRoomAssignments.deviceId))
				.where(
					and(
						eq(deviceRoomAssignments.roomId, input.roomId),
						eq(devices.deviceType, "valve"),
					),
				);

			const now = new Date();
			await ctx.db
				.insert(roomHeatState)
				.values({
					roomId: input.roomId,
					pinnedOff: input.pinnedOff,
					pinnedAt: input.pinnedOff ? now : null,
					releasedAt: input.pinnedOff ? null : now,
				})
				.onConflictDoUpdate({
					target: roomHeatState.roomId,
					set: {
						pinnedOff: input.pinnedOff,
						pinnedAt: input.pinnedOff ? now : null,
						releasedAt: input.pinnedOff ? null : now,
					},
				});

			const results = await Promise.allSettled(
				valveDevices.map((d) =>
					sendValveStateCommand(d.deviceId, !input.pinnedOff),
				),
			);

			const deviceErrors = results.flatMap((result, i) => {
				if (result.status === "fulfilled") return [];
				const device = valveDevices[i];
				if (!device) return [];
				const message =
					result.reason instanceof Error
						? result.reason.message
						: "COMMAND_FAILED";
				return [{ deviceId: device.deviceId, message }];
			});

			return {
				success: true as const,
				pinnedOff: input.pinnedOff,
				deviceErrors,
			};
		}),
});
