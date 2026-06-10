import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	deviceRoomAssignments,
	rooms,
	roomThresholds,
} from "~/server/db/schema";

export const roomRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		const allRooms = await ctx.db.select().from(rooms).orderBy(rooms.createdAt);

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
			deviceCount: countByRoom.get(room.id) ?? 0,
		}));
	}),

	create: protectedProcedure
		.input(z.object({ name: z.string().min(1).max(255) }))
		.mutation(async ({ ctx, input }) => {
			const [created] = await ctx.db
				.insert(rooms)
				.values({ name: input.name })
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
					.select({ id: rooms.id })
					.from(rooms)
					.where(eq(rooms.id, input.roomId));

				if (!room) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Room not found",
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
});
