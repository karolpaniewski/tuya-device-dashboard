export interface DeviceState {
	isOnline: boolean;
	temperatureC: number | null;
	setpointC: number | null;
	humidityPct: number | null;
	isOn: boolean | null;
	lastPolledAt: Date;
}

// globalThis keeps the same Map across Next.js hot-module reloads in dev mode.
declare global {
	// eslint-disable-next-line no-var
	var __deviceStateStore: Map<string, DeviceState> | undefined;
}

if (!globalThis.__deviceStateStore) {
	globalThis.__deviceStateStore = new Map<string, DeviceState>();
}

export const deviceStateStore = globalThis.__deviceStateStore;
