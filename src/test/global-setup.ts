import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// Runs once in the main Vitest process before any workers spawn.
// Applies pending Drizzle migrations to test.db so integration tests
// find a current schema on a fresh checkout or CI environment.
export async function setup() {
	process.env.DATABASE_URL ??= "file:test.db";
	const client = createClient({ url: process.env.DATABASE_URL });
	const db = drizzle(client);
	await migrate(db, { migrationsFolder: "./drizzle" });
	client.close();
}
