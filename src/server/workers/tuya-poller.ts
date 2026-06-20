import { eq, lt } from "drizzle-orm";
import { db } from "~/server/db";
import {
	devices,
	deviceTemperatureReadings,
	gateways,
} from "~/server/db/schema";
import { decryptLocalKey } from "~/server/lib/crypto";
import { ACTIVE_DEVICE_SOURCE } from "~/server/lib/device-source";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getLogger, runWithWorkerContext } from "~/server/lib/log-context";
import { getTuyaClient } from "~/server/lib/tuya";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PURGE_EVERY_N_POLLS = 60; // ~30 min at 30 s cadence

let pollCounter = 0;

export async function pollOnce(): Promise<void> {
	let allGateways: (typeof gateways.$inferSelect)[];
	try {
		allGateways = await db
			.select()
			.from(gateways)
			.where(eq(gateways.source, ACTIVE_DEVICE_SOURCE));
	} catch (err) {
		getLogger().error({ err }, "DB error fetching gateways");
		return;
	}

	const readingBatch: (typeof deviceTemperatureReadings.$inferInsert)[] = [];

	for (const gateway of allGateways) {
		await runWithWorkerContext(
			{ gatewayId: gateway.tuyaGatewayId },
			async () => {
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
						gateway.localKey !== null
							? decryptLocalKey(gateway.localKey)
							: null;
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
							humidityPct: reading.humidityPct,
							isOn: reading.isOn,
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
					getLogger().error(
						{ err },
						`Error polling gateway ${gateway.tuyaGatewayId}`,
					);
				}
			},
		);
	}

	if (readingBatch.length > 0) {
		try {
			await db.insert(deviceTemperatureReadings).values(readingBatch);
		} catch (err) {
			getLogger().error({ err }, "Error writing temperature history");
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
			getLogger().error({ err }, "Error purging old readings");
		}
	}

	getLogger().info(
		{ gatewayCount: allGateways.length },
		"tuya-poller.poll-complete",
	);
}

export function startPollingLoop(): void {
	void pollOnce();
	setInterval(() => void pollOnce(), 30_000);
}
