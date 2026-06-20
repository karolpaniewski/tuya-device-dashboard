/**
 * Demo seed — fabricated gateway + ~40 devices across a realistic office
 * room mix, for demoing without touching real Tuya hardware. Real devices
 * are left untouched (source='real'); demo devices get source='demo'.
 *
 * Run:
 *   npx tsx src/server/db/seed-demo.ts
 */

import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { encryptLocalKey } from "../lib/crypto";
import {
	deviceRoomAssignments,
	devices,
	gateways,
	rooms,
	sites,
} from "./schema";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
	console.error("Missing DATABASE_URL");
	process.exit(1);
}

const client = createClient({ url: dbUrl });
const db = drizzle(client);

const GATEWAY_TUYA_ID = "demo-gw-001";

const PRODUCT_KEYS = {
	valve: "ogx8u5z6",
	plug: "fgwhjm9j",
	sensor: "plwbuwzx",
} as const;

const TYPE_LABELS = {
	valve: "Valve",
	plug: "Plug",
	sensor: "Sensor",
} as const;

interface RoomPlan {
	name: string;
	valves: number;
	sensors: number;
	plugs: number;
}

// 9 rooms, realistic office mix, mostly sensors + valves with a handful of plugs
const ROOM_PLAN: RoomPlan[] = [
	{ name: "Reception", valves: 1, sensors: 1, plugs: 1 },
	{ name: "Open Office North", valves: 3, sensors: 3, plugs: 1 },
	{ name: "Open Office South", valves: 3, sensors: 3, plugs: 1 },
	{ name: "Conference Room A", valves: 1, sensors: 1, plugs: 1 },
	{ name: "Conference Room B", valves: 1, sensors: 1, plugs: 0 },
	{ name: "Server Room", valves: 0, sensors: 2, plugs: 1 },
	{ name: "Kitchen", valves: 1, sensors: 1, plugs: 1 },
	{ name: "Warehouse", valves: 6, sensors: 3, plugs: 0 },
	{ name: "Executive Office", valves: 1, sensors: 1, plugs: 1 },
];

interface DemoDevice {
	tuyaDeviceId: string;
	nodeId: string;
	name: string;
	deviceType: "sensor" | "valve" | "plug";
	productKey: string;
	roomName: string;
}

function buildDevices(): DemoDevice[] {
	const counters = { valve: 0, sensor: 0, plug: 0 };
	const result: DemoDevice[] = [];

	for (const room of ROOM_PLAN) {
		const specs: { type: "valve" | "sensor" | "plug"; count: number }[] = [
			{ type: "valve", count: room.valves },
			{ type: "sensor", count: room.sensors },
			{ type: "plug", count: room.plugs },
		];
		for (const { type, count } of specs) {
			for (let i = 0; i < count; i++) {
				counters[type] += 1;
				const index = String(counters[type]).padStart(2, "0");
				result.push({
					tuyaDeviceId: `demo-${type}-${index}`,
					nodeId: `demo-node-${type}-${index}`,
					name: `${room.name} ${TYPE_LABELS[type]} ${count > 1 ? i + 1 : ""}`.trim(),
					deviceType: type,
					productKey: PRODUCT_KEYS[type],
					roomName: room.name,
				});
			}
		}
	}

	return result;
}

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
			name: "Demo Gateway (fabricated)",
			ipAddress: null,
			localKey: encryptLocalKey("demo-local-key-0000000000000000"),
			siteId: "default",
			source: "demo",
		})
		.onConflictDoUpdate({
			target: gateways.tuyaGatewayId,
			set: { name: "Demo Gateway (fabricated)", source: "demo" },
		})
		.returning({ id: gateways.id });

	if (!gateway) throw new Error("Gateway insert returned no row");
	const gatewayId = gateway.id;

	console.log(`✓ Demo gateway upserted (db id: ${gatewayId})`);

	const roomIdByName = new Map<string, string>();
	for (const room of ROOM_PLAN) {
		const [existing] = await db
			.select({ id: rooms.id })
			.from(rooms)
			.where(and(eq(rooms.name, room.name), eq(rooms.source, "demo")));

		const roomId =
			existing?.id ??
			(
				await db
					.insert(rooms)
					.values({
						id: crypto.randomUUID(),
						name: room.name,
						siteId: "default",
						source: "demo",
					})
					.returning({ id: rooms.id })
			)[0]?.id;

		if (!roomId) throw new Error(`Could not resolve room id for ${room.name}`);
		roomIdByName.set(room.name, roomId);
	}

	console.log(`✓ Seeded ${ROOM_PLAN.length} demo rooms`);

	const demoDevices = buildDevices();

	for (const dev of demoDevices) {
		const [inserted] = await db
			.insert(devices)
			.values({
				id: crypto.randomUUID(),
				gatewayId,
				siteId: "default",
				source: "demo",
				tuyaDeviceId: dev.tuyaDeviceId,
				nodeId: dev.nodeId,
				name: dev.name,
				deviceType: dev.deviceType,
				productKey: dev.productKey,
			})
			.onConflictDoUpdate({
				target: devices.tuyaDeviceId,
				set: {
					name: dev.name,
					gatewayId,
					nodeId: dev.nodeId,
					productKey: dev.productKey,
					source: "demo",
				},
			})
			.returning({ id: devices.id });

		const deviceId =
			inserted?.id ??
			(
				await db
					.select({ id: devices.id })
					.from(devices)
					.where(eq(devices.tuyaDeviceId, dev.tuyaDeviceId))
			)[0]?.id;

		const roomId = roomIdByName.get(dev.roomName);
		if (deviceId && roomId) {
			await db
				.insert(deviceRoomAssignments)
				.values({ deviceId, roomId })
				.onConflictDoUpdate({
					target: deviceRoomAssignments.deviceId,
					set: { roomId },
				});
		}
	}

	console.log(
		`✓ Upserted ${demoDevices.length} demo devices across ${ROOM_PLAN.length} rooms`,
	);
} catch (err) {
	console.error("Demo seed failed:", err);
	process.exit(1);
} finally {
	client.close();
}
process.exit(0);
