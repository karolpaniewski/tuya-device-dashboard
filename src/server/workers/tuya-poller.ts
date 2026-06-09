import { db } from "~/server/db";
import { gateways } from "~/server/db/schema";
import { decryptLocalKey } from "~/server/lib/crypto";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getTuyaClient } from "~/server/lib/tuya";

async function pollOnce(): Promise<void> {
	let allGateways: (typeof gateways.$inferSelect)[];
	try {
		allGateways = await db.select().from(gateways);
	} catch (err) {
		console.error("[tuya-poller] DB error fetching gateways:", err);
		return;
	}

	const client = getTuyaClient();
	for (const gateway of allGateways) {
		try {
			const decryptedKey =
				gateway.localKey !== null ? decryptLocalKey(gateway.localKey) : null;
			const readings = await client.fetchGatewayDevices({
				tuyaGatewayId: gateway.tuyaGatewayId,
				ipAddress: gateway.ipAddress,
				localKey: decryptedKey,
			});
			for (const reading of readings) {
				deviceStateStore.set(reading.tuyaDeviceId, {
					isOnline: reading.isOnline,
					temperatureC: reading.temperatureC,
					lastPolledAt: new Date(),
				});
			}
		} catch (err) {
			console.error(
				`[tuya-poller] Error polling gateway ${gateway.tuyaGatewayId}:`,
				err,
			);
		}
	}

	console.log(`[tuya-poller] polled ${allGateways.length} gateway(s)`);
}

export function startPollingLoop(): void {
	void pollOnce();
	setInterval(() => void pollOnce(), 30_000);
}
