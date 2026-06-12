import type { TuyaDeviceReading, TuyaGatewayClient } from "./types";

const FIXTURE_READINGS: TuyaDeviceReading[] = [
	{
		tuyaDeviceId: "stub-dev-001",
		isOnline: true,
		temperatureC: 21.5,
		setpointC: null,
		humidityPct: 55,
	},
	{
		tuyaDeviceId: "stub-dev-002",
		isOnline: true,
		temperatureC: 19.2,
		setpointC: null,
		humidityPct: 48,
	},
	{
		tuyaDeviceId: "stub-dev-003",
		isOnline: true,
		temperatureC: 20.1,
		setpointC: 21.0,
		humidityPct: null,
	},
	{
		tuyaDeviceId: "stub-dev-004",
		isOnline: false,
		temperatureC: null,
		setpointC: 20.0,
		humidityPct: null,
	},
	{
		tuyaDeviceId: "stub-dev-005",
		isOnline: true,
		temperatureC: null,
		setpointC: null,
		humidityPct: null,
	},
];

export const stubTuyaClient: TuyaGatewayClient = {
	async fetchGatewayDevices(_gateway, _devices) {
		// Simulate 150ms LAN latency
		await new Promise((r) => setTimeout(r, 150));
		return FIXTURE_READINGS;
	},

	async sendSetpoint(_gateway, _command) {
		// no-op in stub
	},
};
