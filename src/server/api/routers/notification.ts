import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { notificationContacts } from "~/server/db/schema";

function isUniqueConstraintError(error: unknown): boolean {
	// Drizzle wraps the libsql driver error in a DrizzleQueryError, so the
	// driver's `code` lands on `error.cause`, not on `error` itself.
	let current: unknown = error;
	for (let depth = 0; depth < 3 && current instanceof Error; depth++) {
		if ((current as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
			return true;
		}
		current = current.cause;
	}
	return false;
}

export const notificationRouter = createTRPCRouter({
	list: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db
			.select({
				id: notificationContacts.id,
				email: notificationContacts.email,
				createdAt: notificationContacts.createdAt,
			})
			.from(notificationContacts)
			.orderBy(asc(notificationContacts.createdAt));
	}),

	create: protectedProcedure
		.input(z.object({ email: z.string().email() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const [created] = await ctx.db
					.insert(notificationContacts)
					.values({ email: input.email })
					.returning({
						id: notificationContacts.id,
						email: notificationContacts.email,
						createdAt: notificationContacts.createdAt,
					});

				if (!created) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "INSERT_FAILED",
					});
				}

				return created;
			} catch (error) {
				if (isUniqueConstraintError(error)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "DUPLICATE_CONTACT",
					});
				}
				throw error;
			}
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [deleted] = await ctx.db
				.delete(notificationContacts)
				.where(eq(notificationContacts.id, input.id))
				.returning({ id: notificationContacts.id });

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Contact not found",
				});
			}

			return { success: true as const };
		}),
});
