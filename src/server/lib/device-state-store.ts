export interface DeviceState {
	isOnline: boolean;
	temperatureC: number | null;
	lastPolledAt: Date;
}

export const deviceStateStore = new Map<string, DeviceState>();
