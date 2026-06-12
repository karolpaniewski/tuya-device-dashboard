export interface TuyaDeviceReading {
	tuyaDeviceId: string;
	isOnline: boolean;
	temperatureC: number | null;
	setpointC: number | null;
	humidityPct: number | null;
}

export interface TuyaGatewayClient {
	fetchGatewayDevices(
		gateway: {
			tuyaGatewayId: string;
			ipAddress: string | null;
			localKey: string | null;
		},
		devices: {
			tuyaDeviceId: string;
			nodeId: string | null;
			deviceType?: string;
		}[],
	): Promise<TuyaDeviceReading[]>;

	sendSetpoint(
		gateway: {
			tuyaGatewayId: string;
			ipAddress: string | null;
			localKey: string | null;
		},
		command: { dps: number; set: number; cid?: string },
	): Promise<void>;
}
