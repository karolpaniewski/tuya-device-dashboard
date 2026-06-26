import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { db as appDb } from "~/server/db";
import {
	automationModes,
	automationModeTargets,
	rooms,
} from "~/server/db/schema";
import { applyModeToRooms } from "~/server/lib/mode-control";

type Db = typeof appDb;

const targetInput = z.object({
	roomId: z.string(),
	targetOn: z.boolean(),
});

const scheduleInput = z
	.object({
		daysOfWeek: z
			.array(z.number().int().min(0).max(6))
			.min(1)
			.max(7)
			.refine((days) => new Set(days).size === days.length, {
				message: "Days of week must be unique",
			}),
		fireHour: z.number().int().min(0).max(23),
		fireMinute: z.number().int().min(0).max(59),
	})
	.nullable();

const modeInput = z.object({
	name: z.string().min(1).max(255),
	targets: z.array(targetInput).min(1),
	schedule: scheduleInput,
});

type Schedule = {
	daysOfWeek: number[];
	fireHour: number;
	fireMinute: number;
};

async function validateTargetsSameSite(
	db: Db,
	roomIds: string[],
): Promise<void> {
	const uniqueRoomIds = [...new Set(roomIds)];

	const roomRows = await db
		.select({ id: rooms.id, siteId: rooms.siteId })
		.from(rooms)
		.where(inArray(rooms.id, uniqueRoomIds));

	if (roomRows.length !== uniqueRoomIds.length) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
	}

	const siteIds = new Set(roomRows.map((r) => r.siteId));
	if (siteIds.size > 1) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "CROSS_SITE_TARGETS",
		});
	}
}

async function findOverlapWarnings(
	db: Db,
	roomIds: string[],
	schedule: Schedule | null,
	excludeModeId?: string,
): Promise<string[]> {
	if (!schedule) return [];

	const targetRows = await db
		.select({
			modeId: automationModeTargets.modeId,
			roomName: rooms.name,
		})
		.from(automationModeTargets)
		.innerJoin(rooms, eq(rooms.id, automationModeTargets.roomId))
		.where(inArray(automationModeTargets.roomId, roomIds));

	const otherModeIds = [...new Set(targetRows.map((r) => r.modeId))].filter(
		(id) => id !== excludeModeId,
	);

	if (otherModeIds.length === 0) return [];

	const otherModes = await db
		.select()
		.from(automationModes)
		.where(
			and(
				inArray(automationModes.id, otherModeIds),
				isNotNull(automationModes.daysOfWeek),
			),
		);

	const warnings: string[] = [];
	for (const mode of otherModes) {
		if (
			mode.daysOfWeek === null ||
			mode.fireHour === null ||
			mode.fireMinute === null
		) {
			continue;
		}

		const days = JSON.parse(mode.daysOfWeek) as number[];
		const overlapsDay = days.some((d) => schedule.daysOfWeek.includes(d));
		const sameTime =
			mode.fireHour === schedule.fireHour &&
			mode.fireMinute === schedule.fireMinute;

		if (overlapsDay && sameTime) {
			const roomNames = targetRows
				.filter((r) => r.modeId === mode.id)
				.map((r) => r.roomName);
			warnings.push(
				`Overlaps with mode "${mode.name}" on ${roomNames.join(", ")} at the same day/time`,
			);
		}
	}

	return warnings;
}

export const modeRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.query(async ({ ctx, input }) => {
			const targetRows = await ctx.db
				.select({
					modeId: automationModeTargets.modeId,
					roomId: automationModeTargets.roomId,
					targetOn: automationModeTargets.targetOn,
					roomName: rooms.name,
					roomSiteId: rooms.siteId,
				})
				.from(automationModeTargets)
				.innerJoin(rooms, eq(rooms.id, automationModeTargets.roomId));

			const scopedRows =
				input.siteId !== "all"
					? targetRows.filter((r) => r.roomSiteId === input.siteId)
					: targetRows;

			const modeIds = [...new Set(scopedRows.map((r) => r.modeId))];

			if (modeIds.length === 0) return [];

			const modes = await ctx.db
				.select()
				.from(automationModes)
				.where(inArray(automationModes.id, modeIds))
				.orderBy(automationModes.createdAt);

			return modes.map((mode) => ({
				id: mode.id,
				name: mode.name,
				daysOfWeek: mode.daysOfWeek
					? (JSON.parse(mode.daysOfWeek) as number[])
					: null,
				fireHour: mode.fireHour,
				fireMinute: mode.fireMinute,
				targets: scopedRows
					.filter((r) => r.modeId === mode.id)
					.map((r) => ({
						roomId: r.roomId,
						roomName: r.roomName,
						targetOn: r.targetOn,
					})),
			}));
		}),

	create: protectedProcedure
		.input(modeInput)
		.mutation(async ({ ctx, input }) => {
			const roomIds = input.targets.map((t) => t.roomId);
			await validateTargetsSameSite(ctx.db, roomIds);

			const warnings = await findOverlapWarnings(
				ctx.db,
				roomIds,
				input.schedule,
			);

			const id = await ctx.db.transaction(async (tx) => {
				const [created] = await tx
					.insert(automationModes)
					.values({
						name: input.name,
						daysOfWeek: input.schedule
							? JSON.stringify(input.schedule.daysOfWeek)
							: null,
						fireHour: input.schedule?.fireHour ?? null,
						fireMinute: input.schedule?.fireMinute ?? null,
					})
					.returning({ id: automationModes.id });

				if (!created) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "INSERT_FAILED",
					});
				}

				await tx.insert(automationModeTargets).values(
					input.targets.map((t) => ({
						modeId: created.id,
						roomId: t.roomId,
						targetOn: t.targetOn,
					})),
				);

				return created.id;
			});

			return { id, warnings };
		}),

	update: protectedProcedure
		.input(modeInput.extend({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [existing] = await ctx.db
				.select({ id: automationModes.id })
				.from(automationModes)
				.where(eq(automationModes.id, input.id));

			if (!existing) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Mode not found" });
			}

			const roomIds = input.targets.map((t) => t.roomId);
			await validateTargetsSameSite(ctx.db, roomIds);

			const warnings = await findOverlapWarnings(
				ctx.db,
				roomIds,
				input.schedule,
				input.id,
			);

			await ctx.db.transaction(async (tx) => {
				await tx
					.update(automationModes)
					.set({
						name: input.name,
						daysOfWeek: input.schedule
							? JSON.stringify(input.schedule.daysOfWeek)
							: null,
						fireHour: input.schedule?.fireHour ?? null,
						fireMinute: input.schedule?.fireMinute ?? null,
						updatedAt: new Date(),
					})
					.where(eq(automationModes.id, input.id));

				await tx
					.delete(automationModeTargets)
					.where(eq(automationModeTargets.modeId, input.id));

				await tx.insert(automationModeTargets).values(
					input.targets.map((t) => ({
						modeId: input.id,
						roomId: t.roomId,
						targetOn: t.targetOn,
					})),
				);
			});

			return { id: input.id, warnings };
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [existing] = await ctx.db
				.select({ id: automationModes.id })
				.from(automationModes)
				.where(eq(automationModes.id, input.id));

			if (!existing) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Mode not found" });
			}

			await ctx.db
				.delete(automationModes)
				.where(eq(automationModes.id, input.id));
			return { success: true as const };
		}),

	addTarget: protectedProcedure
		.input(z.object({ modeId: z.string(), roomId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [existingMode] = await ctx.db
				.select({ id: automationModes.id })
				.from(automationModes)
				.where(eq(automationModes.id, input.modeId));

			if (!existingMode) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Mode not found" });
			}

			const [room] = await ctx.db
				.select({ id: rooms.id, siteId: rooms.siteId })
				.from(rooms)
				.where(eq(rooms.id, input.roomId));

			if (!room) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
			}

			const existingTargetRooms = await ctx.db
				.select({ siteId: rooms.siteId })
				.from(automationModeTargets)
				.innerJoin(rooms, eq(rooms.id, automationModeTargets.roomId))
				.where(eq(automationModeTargets.modeId, input.modeId));

			const existingSiteIds = new Set(existingTargetRooms.map((r) => r.siteId));
			if (existingSiteIds.size > 0 && !existingSiteIds.has(room.siteId)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "CROSS_SITE_TARGETS",
				});
			}

			try {
				await ctx.db.insert(automationModeTargets).values({
					modeId: input.modeId,
					roomId: input.roomId,
					targetOn: true,
				});
			} catch (e) {
				if (
					e instanceof Error &&
					e.message.includes("UNIQUE constraint failed")
				) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "MODE_ALREADY_CONNECTED",
					});
				}
				throw e;
			}

			return { success: true as const };
		}),

	removeTarget: protectedProcedure
		.input(z.object({ modeId: z.string(), roomId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [existing] = await ctx.db
				.select({ id: automationModes.id })
				.from(automationModes)
				.where(eq(automationModes.id, input.modeId));

			if (!existing) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Mode not found" });
			}

			await ctx.db
				.delete(automationModeTargets)
				.where(
					and(
						eq(automationModeTargets.modeId, input.modeId),
						eq(automationModeTargets.roomId, input.roomId),
					),
				);

			return { success: true as const };
		}),

	trigger: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [mode] = await ctx.db
				.select({ id: automationModes.id })
				.from(automationModes)
				.where(eq(automationModes.id, input.id));

			if (!mode) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Mode not found" });
			}

			const targets = await ctx.db
				.select({
					roomId: automationModeTargets.roomId,
					targetOn: automationModeTargets.targetOn,
				})
				.from(automationModeTargets)
				.where(eq(automationModeTargets.modeId, input.id));

			const results = await applyModeToRooms(mode.id, targets, "manual");

			return { results };
		}),
});
