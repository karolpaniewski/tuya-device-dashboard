import { createClient } from "@libsql/client";
import bcryptjs from "bcryptjs";
import { drizzle } from "drizzle-orm/libsql";

import { encryptLocalKey } from "../lib/crypto";
import { devices, gateways, sites, users } from "./schema";

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

	await db
		.insert(sites)
		.values({ id: "default", name: "Default" })
		.onConflictDoNothing();

	console.log("✓ Ensured default site");

	const [gateway] = await db
		.insert(gateways)
		.values({
			id: crypto.randomUUID(),
			tuyaGatewayId: "stub-gw-001",
			name: "Main Gateway (stub)",
			ipAddress: "192.168.1.100",
			localKey: encryptLocalKey("stub-local-key-0000000000000000"),
			siteId: "default",
		})
		.onConflictDoUpdate({
			target: gateways.tuyaGatewayId,
			set: { name: "Main Gateway (stub)", ipAddress: "192.168.1.100" },
		})
		.returning({ id: gateways.id });

	if (!gateway) throw new Error("Gateway insert returned no row");
	const gatewayId = gateway.id;

	const stubDevices = [
		{
			tuyaDeviceId: "stub-dev-001",
			name: "Sensor A (Room 1)",
			deviceType: "sensor",
		},
		{
			tuyaDeviceId: "stub-dev-002",
			name: "Sensor B (Room 2)",
			deviceType: "sensor",
		},
		{
			tuyaDeviceId: "stub-dev-003",
			name: "Valve A (Room 1)",
			deviceType: "valve",
			productKey: "ogx8u5z6",
		},
		{
			tuyaDeviceId: "stub-dev-004",
			name: "Valve B (Room 2)",
			deviceType: "valve",
			productKey: "ogx8u5z6",
		},
		{ tuyaDeviceId: "stub-dev-005", name: "Smart Plug 1", deviceType: "plug" },
	];

	for (const dev of stubDevices) {
		await db
			.insert(devices)
			.values({ id: crypto.randomUUID(), gatewayId, siteId: "default", ...dev })
			.onConflictDoUpdate({
				target: devices.tuyaDeviceId,
				set: { name: dev.name, gatewayId, productKey: dev.productKey ?? null },
			});
	}

	console.log("✓ Seeded fixture gateway + 5 devices");
} catch (err) {
	console.error("Seed failed:", err);
	process.exit(1);
} finally {
	client.close();
}
process.exit(0);
