import { eq } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_WIDGET_ORDER } from "~/lib/dashboard-widgets";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { dashboardLayout } from "~/server/db/schema";

const LAYOUT_ID = "default";

export const dashboardLayoutRouter = createTRPCRouter({
	get: protectedProcedure.query(async ({ ctx }) => {
		const [row] = await ctx.db
			.select()
			.from(dashboardLayout)
			.where(eq(dashboardLayout.id, LAYOUT_ID));

		if (!row) {
			return {
				widgetOrder: [...DEFAULT_WIDGET_ORDER],
				hiddenWidgets: [] as string[],
				roomOrder: [] as string[],
			};
		}

		return {
			widgetOrder: JSON.parse(row.widgetOrder) as string[],
			hiddenWidgets: JSON.parse(row.hiddenWidgets) as string[],
			roomOrder: JSON.parse(row.roomOrder) as string[],
		};
	}),

	save: protectedProcedure
		.input(
			z.object({
				widgetOrder: z.array(z.string()),
				hiddenWidgets: z.array(z.string()),
				roomOrder: z.array(z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.insert(dashboardLayout)
				.values({
					id: LAYOUT_ID,
					widgetOrder: JSON.stringify(input.widgetOrder),
					hiddenWidgets: JSON.stringify(input.hiddenWidgets),
					roomOrder: JSON.stringify(input.roomOrder),
				})
				.onConflictDoUpdate({
					target: dashboardLayout.id,
					set: {
						widgetOrder: JSON.stringify(input.widgetOrder),
						hiddenWidgets: JSON.stringify(input.hiddenWidgets),
						roomOrder: JSON.stringify(input.roomOrder),
						updatedAt: new Date(),
					},
				});

			return { success: true as const };
		}),
});
