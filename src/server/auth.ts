import bcryptjs from "bcryptjs";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { authConfig } from "./auth.config";
import { eq } from "drizzle-orm";

declare module "next-auth" {
	interface Session {
		user: {
			id: string;
		} & DefaultSession["user"];
	}
}

const credentialsSchema = z.object({
	email: z.string().email(),
	password: z.string(),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
	...authConfig,
	session: { strategy: "jwt" },
	providers: [
		Credentials({
			async authorize(credentials) {
				const parsed = credentialsSchema.safeParse(credentials);
				if (!parsed.success) return null;

				const { email, password } = parsed.data;

				const [user] = await db
					.select()
					.from(users)
					.where(eq(users.email, email))
					.limit(1);

				if (!user) return null;

				const passwordMatch = await bcryptjs.compare(
					password,
					user.passwordHash,
				);
				if (!passwordMatch) return null;

				return { id: user.id, email: user.email };
			},
		}),
	],
});
