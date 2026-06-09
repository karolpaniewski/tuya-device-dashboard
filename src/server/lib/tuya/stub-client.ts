import type { TuyaDeviceReading, TuyaGatewayClient } from "./types";

const FIXTURE_READINGS: TuyaDeviceReading[] = [
	{ tuyaDeviceId: "stub-dev-001", isOnline: true, temperatureC: 21.5 },
	{ tuyaDeviceId: "stub-dev-002", isOnline: true, temperatureC: 19.2 },
	{ tuyaDeviceId: "stub-dev-003", isOnline: true, temperatureC: 20.1 },
	{ tuyaDeviceId: "stub-dev-004", isOnline: false, temperatureC: null },
	{ tuyaDeviceId: "stub-dev-005", isOnline: true, temperatureC: null },
];

export const stubTuyaClient: TuyaGatewayClient = {
	async fetchGatewayDevices(_gateway) {
		// Simulate 150ms LAN latency
		await new Promise((r) => setTimeout(r, 150));
		return FIXTURE_READINGS;
	},
};
