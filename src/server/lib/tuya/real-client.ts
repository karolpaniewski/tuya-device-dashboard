import TuyAPI from "tuyapi";

import type { TuyaDeviceReading, TuyaGatewayClient } from "./types";

// When implementing fetchGatewayDevices for production, for each device under this gateway:
// const device = new TuyAPI({ id: dev.tuyaDeviceId, key: gateway.localKey, version: '3.3' });
// await device.connect();
// const schema = await device.get({ schema: true });
// await device.disconnect();

export const realTuyaClient: TuyaGatewayClient = {
	async fetchGatewayDevices(gateway) {
		console.warn(
			`[tuya-poller] Real Tuya client not fully implemented. Set TUYA_STUB=true for development. (gateway: ${gateway.tuyaGatewayId})`,
		);
		return [] as TuyaDeviceReading[];
	},

	async sendSetpoint(gateway, command) {
		const device = new TuyAPI({
			id: gateway.tuyaGatewayId,
			key: gateway.localKey ?? "",
			ip: gateway.ipAddress ?? undefined,
			version: "3.3",
		});
		await device.connect();
		try {
			await device.set({
				dps: command.dps,
				set: command.set,
				shouldWaitForResponse: true,
			});
		} finally {
			await device.disconnect();
		}
	},
};
