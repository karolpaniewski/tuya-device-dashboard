import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	automationRules,
	deviceRoomAssignments,
	devices,
	rooms,
} from "~/server/db/schema";
import { ACTIVE_DEVICE_SOURCE } from "~/server/lib/device-source";

const createInput = z.object({
	name: z.string().min(1).max(255),
	deviceId: z.string(),
	daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
	fireHour: z.number().int().min(0).max(23),
	fireMinute: z.number().int().min(0).max(59),
	targetSetpointC: z.number().min(5).max(35),
	tempThresholdC: z.number().min(5).max(35).optional(),
});

export const automationRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.query(async ({ ctx, input }) => {
			const baseQuery = ctx.db
				.select({
					rule: automationRules,
					deviceName: devices.name,
					roomName: rooms.name,
				})
				.from(automationRules)
				.innerJoin(devices, eq(devices.id, automationRules.deviceId))
				.leftJoin(
					deviceRoomAssignments,
					eq(deviceRoomAssignments.deviceId, devices.id),
				)
				.leftJoin(rooms, eq(rooms.id, deviceRoomAssignments.roomId))
				.orderBy(automationRules.createdAt);

			const rows =
				input.siteId !== "all"
					? await baseQuery.where(
							and(
								eq(devices.siteId, input.siteId),
								eq(devices.source, ACTIVE_DEVICE_SOURCE),
							),
						)
					: await baseQuery.where(eq(devices.source, ACTIVE_DEVICE_SOURCE));

			return rows.map((row) => ({
				id: row.rule.id,
				name: row.rule.name,
				deviceId: row.rule.deviceId,
				deviceName: row.deviceName,
				roomName: row.roomName ?? null,
				daysOfWeek: JSON.parse(row.rule.daysOfWeek) as number[],
				fireHour: row.rule.fireHour,
				fireMinute: row.rule.fireMinute,
				targetSetpointC: row.rule.targetSetpointC,
				tempThresholdC: row.rule.tempThresholdC,
				isEnabled: row.rule.isEnabled,
			}));
		}),

	create: protectedProcedure
		.input(createInput)
		.mutation(async ({ ctx, input }) => {
			const [device] = await ctx.db
				.select({ id: devices.id, deviceType: devices.deviceType })
				.from(devices)
				.where(eq(devices.id, input.deviceId));

			if (!device) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
			}

			if (device.deviceType !== "valve") {
				throw new TRPCError({ code: "BAD_REQUEST", message: "NOT_A_VALVE" });
			}

			const [assignment] = await ctx.db
				.select({ roomId: deviceRoomAssignments.roomId })
				.from(deviceRoomAssignments)
				.where(eq(deviceRoomAssignments.deviceId, input.deviceId));

			if (assignment) {
				const roomDeviceRows = await ctx.db
					.select({ deviceId: deviceRoomAssignments.deviceId })
					.from(deviceRoomAssignments)
					.where(eq(deviceRoomAssignments.roomId, assignment.roomId));
				const roomDeviceIds = roomDeviceRows.map((r) => r.deviceId);

				const existingRules = roomDeviceIds.length
					? await ctx.db
							.select()
							.from(automationRules)
							.where(
								and(
									inArray(automationRules.deviceId, roomDeviceIds),
									eq(automationRules.isEnabled, true),
								),
							)
					: [];

				const hasConflict = existingRules.some((rule) => {
					const days = JSON.parse(rule.daysOfWeek) as number[];
					const overlapsDay = days.some((d) => input.daysOfWeek.includes(d));
					return (
						overlapsDay &&
						rule.fireHour === input.fireHour &&
						rule.fireMinute === input.fireMinute
					);
				});

				if (hasConflict) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "RULE_CONFLICT",
					});
				}
			}

			const [created] = await ctx.db
				.insert(automationRules)
				.values({
					name: input.name,
					deviceId: input.deviceId,
					daysOfWeek: JSON.stringify(input.daysOfWeek),
					fireHour: input.fireHour,
					fireMinute: input.fireMinute,
					targetSetpointC: input.targetSetpointC,
					tempThresholdC: input.tempThresholdC ?? null,
				})
				.returning({ id: automationRules.id });

			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "INSERT_FAILED",
				});
			}

			return { id: created.id };
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.delete(automationRules)
				.where(eq(automationRules.id, input.id));
			return { success: true as const };
		}),

	toggle: protectedProcedure
		.input(z.object({ id: z.string(), isEnabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const [updated] = await ctx.db
				.update(automationRules)
				.set({ isEnabled: input.isEnabled, updatedAt: new Date() })
				.where(eq(automationRules.id, input.id))
				.returning({ id: automationRules.id });

			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });
			}

			return { success: true as const };
		}),
});
