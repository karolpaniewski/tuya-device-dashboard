import bcryptjs from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { authConfig } from "./auth.config";

declare module "next-auth" {
	interface Session {
		user: {
			id: string;
		} & DefaultSession["user"];
	}
}

const credentialsSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
	...authConfig,
	session: { strategy: "jwt" },
	callbacks: {
		...authConfig.callbacks,
		jwt({ token, user }) {
			if (user?.id) token.sub = user.id;
			return token;
		},
		session({ session, token }) {
			if (token.sub) session.user.id = token.sub;
			return session;
		},
	},
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
