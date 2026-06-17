import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		DATABASE_URL: z.string().url(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		AUTH_SECRET: z.string().min(32),
		AUTH_ADMIN_EMAIL: z.string().email(),
		AUTH_ADMIN_PASSWORD: z.string().min(8),
		ENCRYPTION_SECRET: z
			.string()
			.regex(/^[0-9a-f]{64}$/, "must be 64 lowercase hex chars (32 bytes)"),
		TUYA_STUB: z.string().optional(),
		LOG_LEVEL: z
			.enum(["debug", "info", "warn", "error", "silent"])
			.default("info"),
		LOG_DIR: z.string().optional(),
		LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
		AUTH_SECRET: process.env.AUTH_SECRET,
		AUTH_ADMIN_EMAIL: process.env.AUTH_ADMIN_EMAIL,
		AUTH_ADMIN_PASSWORD: process.env.AUTH_ADMIN_PASSWORD,
		ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET,
		TUYA_STUB: process.env.TUYA_STUB,
		LOG_LEVEL: process.env.LOG_LEVEL,
		LOG_DIR: process.env.LOG_DIR,
		LOG_RETENTION_DAYS: process.env.LOG_RETENTION_DAYS,
		// NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
