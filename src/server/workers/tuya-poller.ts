import { eq, lt } from "drizzle-orm";
import { db } from "~/server/db";
import {
	devices,
	deviceTemperatureReadings,
	gateways,
} from "~/server/db/schema";
import { decryptLocalKey } from "~/server/lib/crypto";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getTuyaClient } from "~/server/lib/tuya";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PURGE_EVERY_N_POLLS = 60; // ~30 min at 30 s cadence

let pollCounter = 0;

export async function pollOnce(): Promise<void> {
	let allGateways: (typeof gateways.$inferSelect)[];
	try {
		allGateways = await db.select().from(gateways);
	} catch (err) {
		console.error("[tuya-poller] DB error fetching gateways:", err);
		return;
	}

	const readingBatch: (typeof deviceTemperatureReadings.$inferInsert)[] = [];

	for (const gateway of allGateways) {
		try {
			const gatewayDevices = await db
				.select({
					tuyaDeviceId: devices.tuyaDeviceId,
					nodeId: devices.nodeId,
					deviceType: devices.deviceType,
				})
				.from(devices)
				.where(eq(devices.gatewayId, gateway.id));

			const client = getTuyaClient();
			const decryptedKey =
				gateway.localKey !== null ? decryptLocalKey(gateway.localKey) : null;
			const readings = await client.fetchGatewayDevices(
				{
					tuyaGatewayId: gateway.tuyaGatewayId,
					ipAddress: gateway.ipAddress,
					localKey: decryptedKey,
				},
				gatewayDevices,
			);
			for (const reading of readings) {
				deviceStateStore.set(reading.tuyaDeviceId, {
					isOnline: reading.isOnline,
					temperatureC: reading.temperatureC,
					setpointC: reading.setpointC,
					lastPolledAt: new Date(),
				});
				if (reading.temperatureC !== null || reading.setpointC !== null) {
					readingBatch.push({
						tuyaDeviceId: reading.tuyaDeviceId,
						temperatureC: reading.temperatureC,
						setpointC: reading.setpointC,
					});
				}
			}
		} catch (err) {
			console.error(
				`[tuya-poller] Error polling gateway ${gateway.tuyaGatewayId}:`,
				err,
			);
		}
	}

	if (readingBatch.length > 0) {
		try {
			await db.insert(deviceTemperatureReadings).values(readingBatch);
		} catch (err) {
			console.error("[tuya-poller] Error writing temperature history:", err);
		}
	}

	pollCounter++;
	if (pollCounter % PURGE_EVERY_N_POLLS === 0) {
		const cutoff = new Date(Date.now() - RETENTION_MS);
		try {
			await db
				.delete(deviceTemperatureReadings)
				.where(lt(deviceTemperatureReadings.recordedAt, cutoff));
		} catch (err) {
			console.error("[tuya-poller] Error purging old readings:", err);
		}
	}

	console.log(`[tuya-poller] polled ${allGateways.length} gateway(s)`);
}

export function startPollingLoop(): void {
	void pollOnce();
	setInterval(() => void pollOnce(), 30_000);
}
