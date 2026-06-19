import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { devices, gateways } from "~/server/db/schema";
import { decryptLocalKey } from "~/server/lib/crypto";
import { getLogger } from "~/server/lib/log-context";
import { getTuyaClient } from "~/server/lib/tuya";
import { DP_CODE_MAP } from "~/server/lib/tuya/dp-codes";

export async function sendPlugCommand(
	deviceId: string,
	isOn: boolean,
): Promise<void> {
	const [device] = await db
		.select()
		.from(devices)
		.where(eq(devices.id, deviceId));

	if (!device) {
		throw new Error("DEVICE_NOT_FOUND");
	}

	if (device.productKey === null || !(device.productKey in DP_CODE_MAP)) {
		throw new Error("UNSUPPORTED_DEVICE");
	}
	// biome-ignore lint/style/noNonNullAssertion: productKey presence in DP_CODE_MAP validated by guard above
	const dps = DP_CODE_MAP[device.productKey]!;

	if (device.gatewayId === null) {
		throw new Error("DEVICE_NOT_PAIRED");
	}

	const [gateway] = await db
		.select()
		.from(gateways)
		.where(eq(gateways.id, device.gatewayId));

	if (!gateway) {
		throw new Error("GATEWAY_NOT_FOUND");
	}

	if (!gateway.localKey) {
		throw new Error("GATEWAY_KEY_NOT_SET");
	}

	let plainKey: string;
	try {
		plainKey = decryptLocalKey(gateway.localKey);
	} catch {
		throw new Error("KEY_DECRYPT_FAILED");
	}

	const client = getTuyaClient();
	try {
		await client.sendSwitch(
			{
				tuyaGatewayId: gateway.tuyaGatewayId,
				ipAddress: gateway.ipAddress ?? null,
				localKey: plainKey,
			},
			{
				dps,
				set: isOn,
				cid: device.nodeId ?? undefined,
			},
		);
	} catch (err) {
		getLogger().error(
			{ err, deviceId, dps, isOn },
			"plug-control.send-switch-failed",
		);
		throw new Error("COMMAND_FAILED");
	}
}
