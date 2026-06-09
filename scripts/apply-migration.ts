import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
	console.error("Missing DATABASE_URL");
	process.exit(1);
}

const client = createClient({ url: dbUrl });
const sql = readFileSync("./drizzle/0000_mushy_wasp.sql", "utf-8");
const statements = sql
	.split("--> statement-breakpoint")
	.map((s) => s.trim())
	.filter(Boolean);

for (const stmt of statements) {
	try {
		await client.execute(stmt);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("already exists")) {
			console.log(`  skip (already exists): ${stmt.slice(0, 60)}…`);
		} else {
			console.error(`  FAILED: ${msg}`);
			console.error(`  stmt: ${stmt.slice(0, 120)}`);
		}
	}
}

console.log("✓ Migration applied");
client.close();
process.exit(0);
