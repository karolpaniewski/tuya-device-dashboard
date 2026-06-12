/**
 * Production seed — inserts real Tuya gateway + devices.
 *
 * Required env vars (add to .env before running):
 *   TUYA_GATEWAY_IP   — local IP of the Zigbee gateway, e.g. 192.168.1.50
 *   TUYA_GATEWAY_KEY  — plain-text localKey from Tuya IoT Platform
 *
 * Run:
 *   npx tsx src/server/db/seed-production.ts
 */

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { encryptLocalKey } from "../lib/crypto";
import { devices, gateways, sites } from "./schema";

const dbUrl = process.env.DATABASE_URL;
const gatewayIp = process.env.TUYA_GATEWAY_IP;
const gatewayKey = process.env.TUYA_GATEWAY_KEY;

if (!dbUrl) {
	console.error("Missing DATABASE_URL");
	process.exit(1);
}
if (!gatewayIp) {
	console.error("Missing TUYA_GATEWAY_IP");
	process.exit(1);
}
if (!gatewayKey) {
	console.error("Missing TUYA_GATEWAY_KEY");
	process.exit(1);
}

const client = createClient({ url: dbUrl });
const db = drizzle(client);

const GATEWAY_TUYA_ID = "bf8ee8139d2392aab69x6h";

const REAL_DEVICES = [
	// Thermostatic valves (wkf) — product ogx8u5z6, DP 2 = temp_set, DP 3 = temp_current
	{
		tuyaDeviceId: "bfe8a6fabd4ea18991ivod",
		name: "Ecomm 5",
		deviceType: "valve",
		nodeId: "a4c13814785ac635",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf80dcdce67dfb393fzasc",
		name: "FOTO 1",
		deviceType: "valve",
		nodeId: "a4c1383be595e19f",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf847011d6301fe56cwbwu",
		name: "Logistyka 2",
		deviceType: "valve",
		nodeId: "a4c1383db23dff27",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf074913d2a58e3489yan1",
		name: "Ecomm 4",
		deviceType: "valve",
		nodeId: "a4c13858ad2b637a",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf2ac443e0a197eff0kjve",
		name: "Korytarz 2",
		deviceType: "valve",
		nodeId: "a4c1386c5f9d3f22",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bfbcca95caddef1bb9wrws",
		name: "IT 2",
		deviceType: "valve",
		nodeId: "a4c138893825ac96",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf2366a05720705cdcwmql",
		name: "Korytarz 1",
		deviceType: "valve",
		nodeId: "a4c13898037bf2bb",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf1e9f81162bc77d97rh8s",
		name: "Ecomm 3",
		deviceType: "valve",
		nodeId: "a4c1387f11461d5d",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf13401abcf112ced7wwk8",
		name: "Ecomm 1",
		deviceType: "valve",
		nodeId: "a4c138ddc7c712ab",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bfaad448fdf3f0a0769erh",
		name: "Ecomm 2",
		deviceType: "valve",
		nodeId: "a4c138e614f1c97d",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf1e3e65697c71b093ghtf",
		name: "Biuro Handlowe",
		deviceType: "valve",
		nodeId: "a4c138edacb6e87a",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf944e48991abab7a5rxmq",
		name: "Logistyka 1",
		deviceType: "valve",
		nodeId: "a4c138c10ae93db7",
		productKey: "ogx8u5z6",
	},
	{
		tuyaDeviceId: "bf059f12c654681112lskm",
		name: "IT 1",
		deviceType: "valve",
		nodeId: "a4c138cab997d55d",
		productKey: "ogx8u5z6",
	},
	// Smart plugs (cz)
	{
		tuyaDeviceId: "bfa1589260b5ff509ewi6q",
		name: "Smart plug 4",
		deviceType: "plug",
		nodeId: "a4c138004a83f7ea",
		productKey: "fgwhjm9j",
	},
	{
		tuyaDeviceId: "bff388181779553f74xlo3",
		name: "Smart plug 3",
		deviceType: "plug",
		nodeId: "a4c1382abf277732",
		productKey: "fgwhjm9j",
	},
	{
		tuyaDeviceId: "bfb401a6066caacff9dy3k",
		name: "Smart plug 7",
		deviceType: "plug",
		nodeId: "a4c138684d63bcad",
		productKey: "fgwhjm9j",
	},
	{
		tuyaDeviceId: "bff6436cd6a6b1e5c4d5ah",
		name: "Smart plug 5",
		deviceType: "plug",
		nodeId: "a4c13899ba946a19",
		productKey: "fgwhjm9j",
	},
	{
		tuyaDeviceId: "bf198894ade6df1702iyd1",
		name: "Smart plug Ecommerce",
		deviceType: "plug",
		nodeId: "a4c138af1a7662e2",
		productKey: "fgwhjm9j",
	},
	{
		tuyaDeviceId: "bfa378a4bf67213817knzt",
		name: "Smart plug 6",
		deviceType: "plug",
		nodeId: "a4c138db12bfa128",
		productKey: "fgwhjm9j",
	},
	// Temperature/humidity sensors (wsdcg)
	{
		tuyaDeviceId: "bfb62648077e6e093cefk5",
		name: "Temperature Humidity Sensor",
		deviceType: "sensor",
		nodeId: "a4c13842710527fc",
		productKey: "plwbuwzx",
	},
	{
		tuyaDeviceId: "bfa660d6fe7ed666545fv4",
		name: "Czujnik temperatury Ecommerce",
		deviceType: "sensor",
		nodeId: "a4c138d20eb03a6a",
		productKey: "plwbuwzx",
	},
] as const;

try {
	await db
		.insert(sites)
		.values({ id: "default", name: "Default" })
		.onConflictDoNothing();

	const [gateway] = await db
		.insert(gateways)
		.values({
			id: crypto.randomUUID(),
			tuyaGatewayId: GATEWAY_TUYA_ID,
			name: "Main Gateway (THP10-Z-X)",
			ipAddress: gatewayIp,
			localKey: encryptLocalKey(gatewayKey),
			siteId: "default",
		})
		.onConflictDoUpdate({
			target: gateways.tuyaGatewayId,
			set: { ipAddress: gatewayIp, localKey: encryptLocalKey(gatewayKey) },
		})
		.returning({ id: gateways.id });

	if (!gateway) throw new Error("Gateway insert returned no row");
	const gatewayId = gateway.id;

	console.log(`✓ Gateway ${GATEWAY_TUYA_ID} upserted (db id: ${gatewayId})`);

	for (const dev of REAL_DEVICES) {
		await db
			.insert(devices)
			.values({
				id: crypto.randomUUID(),
				gatewayId,
				siteId: "default",
				...dev,
			})
			.onConflictDoUpdate({
				target: devices.tuyaDeviceId,
				set: {
					name: dev.name,
					gatewayId,
					nodeId: dev.nodeId,
					productKey: dev.productKey,
				},
			});
	}

	console.log(`✓ Upserted ${REAL_DEVICES.length} devices`);
} catch (err) {
	console.error("Production seed failed:", err);
	process.exit(1);
} finally {
	client.close();
}
process.exit(0);
