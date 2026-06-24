import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { gateways, rooms, sites } from "~/server/db/schema";

export const siteRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db
			.select({
				id: sites.id,
				name: sites.name,
				createdAt: sites.createdAt,
				floorPlanImagePath: sites.floorPlanImagePath,
			})
			.from(sites)
			.orderBy(asc(sites.name));
	}),

	create: protectedProcedure
		.input(z.object({ name: z.string().min(1).max(255) }))
		.mutation(async ({ ctx, input }) => {
			const [created] = await ctx.db
				.insert(sites)
				.values({ name: input.name })
				.returning({ id: sites.id, name: sites.name });

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
				.update(sites)
				.set({ name: input.name })
				.where(eq(sites.id, input.id))
				.returning({ id: sites.id, name: sites.name });

			if (!updated) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
			}

			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const allSites = await ctx.db.select({ id: sites.id }).from(sites);
			if (allSites.length <= 1) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "CANNOT_DELETE_LAST_SITE",
				});
			}

			const [hasRoom] = await ctx.db
				.select({ id: rooms.id })
				.from(rooms)
				.where(eq(rooms.siteId, input.id));

			if (hasRoom) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "SITE_NOT_EMPTY",
				});
			}

			const [hasGateway] = await ctx.db
				.select({ id: gateways.id })
				.from(gateways)
				.where(eq(gateways.siteId, input.id));

			if (hasGateway) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "SITE_NOT_EMPTY",
				});
			}

			await ctx.db.delete(sites).where(eq(sites.id, input.id));

			return { success: true as const };
		}),
});
