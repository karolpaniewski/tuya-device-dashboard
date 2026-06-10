export interface TuyaDeviceReading {
	tuyaDeviceId: string;
	isOnline: boolean;
	temperatureC: number | null;
	setpointC: number | null;
}

export interface TuyaGatewayClient {
	fetchGatewayDevices(gateway: {
		tuyaGatewayId: string;
		ipAddress: string | null;
		localKey: string | null;
	}): Promise<TuyaDeviceReading[]>;

	sendSetpoint(
		gateway: {
			tuyaGatewayId: string;
			ipAddress: string | null;
			localKey: string | null;
		},
		command: { dps: number; set: number },
	): Promise<void>;
}
