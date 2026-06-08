import { createClient } from "@libsql/client";
import bcryptjs from "bcryptjs";
import { drizzle } from "drizzle-orm/libsql";

import { users } from "./schema";

const email = process.env.AUTH_ADMIN_EMAIL;
const password = process.env.AUTH_ADMIN_PASSWORD;
const dbUrl = process.env.DATABASE_URL;

if (!email) {
	console.error("Missing AUTH_ADMIN_EMAIL in environment");
	process.exit(1);
}
if (!password) {
	console.error("Missing AUTH_ADMIN_PASSWORD in environment");
	process.exit(1);
}
if (!dbUrl) {
	console.error("Missing DATABASE_URL in environment");
	process.exit(1);
}

const client = createClient({ url: dbUrl });
const db = drizzle(client);

try {
	const passwordHash = await bcryptjs.hash(password, 12);

	await db
		.insert(users)
		.values({ id: crypto.randomUUID(), email, passwordHash })
		.onConflictDoUpdate({
			target: users.email,
			set: { passwordHash, updatedAt: new Date() },
		});

	console.log(`✓ Seeded admin user: ${email}`);
} catch (err) {
	console.error("Seed failed:", err);
	process.exit(1);
} finally {
	client.close();
}
process.exit(0);
