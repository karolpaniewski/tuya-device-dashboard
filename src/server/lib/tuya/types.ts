export interface TuyaDeviceReading {
	tuyaDeviceId: string;
	isOnline: boolean;
	temperatureC: number | null;
}

export interface TuyaGatewayClient {
	fetchGatewayDevices(gateway: {
		tuyaGatewayId: string;
		ipAddress: string | null;
		localKey: string | null;
	}): Promise<TuyaDeviceReading[]>;
}
