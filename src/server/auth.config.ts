import type { NextAuthConfig } from "next-auth";

// Edge-safe config — no bcryptjs, Drizzle, or libsql imports.
// Imported by both middleware.ts and auth.ts.
export const authConfig: NextAuthConfig = {
	pages: {
		signIn: "/login",
	},
	callbacks: {
		authorized({ auth }) {
			return !!auth?.user;
		},
	},
	providers: [],
};
