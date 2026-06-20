import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { defaultThresholds } from "~/server/db/schema";
import { DEFAULT_THRESHOLDS } from "~/server/lib/scoring";

const DEFAULT_THRESHOLDS_ID = "default";

export const settingsRouter = createTRPCRouter({
	getDefaultThresholds: protectedProcedure.query(async ({ ctx }) => {
		const [row] = await ctx.db
			.select()
			.from(defaultThresholds)
			.where(eq(defaultThresholds.id, DEFAULT_THRESHOLDS_ID));

		if (!row) {
			return { ...DEFAULT_THRESHOLDS };
		}

		return {
			minTempC: row.minTempC,
			maxTempC: row.maxTempC,
			anomalyGapC: row.anomalyGapC,
		};
	}),

	setDefaultThresholds: protectedProcedure
		.input(
			z.object({
				minTempC: z.number(),
				maxTempC: z.number(),
				anomalyGapC: z.number().min(0),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.minTempC >= input.maxTempC) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Min must be less than max",
				});
			}

			await ctx.db
				.insert(defaultThresholds)
				.values({
					id: DEFAULT_THRESHOLDS_ID,
					minTempC: input.minTempC,
					maxTempC: input.maxTempC,
					anomalyGapC: input.anomalyGapC,
				})
				.onConflictDoUpdate({
					target: defaultThresholds.id,
					set: {
						minTempC: input.minTempC,
						maxTempC: input.maxTempC,
						anomalyGapC: input.anomalyGapC,
						updatedAt: new Date(),
					},
				});

			return { success: true as const };
		}),
});
