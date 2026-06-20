import type { TuyaDeviceReading, TuyaGatewayClient } from "./types";

// Keyed by nodeId (the only identifier sendSwitch/sendSetpoint commands carry)
// so toggling a demo plug or moving a demo valve's setpoint sticks across polls
// instead of reverting to the generated baseline every 30s.
// Pinned to globalThis (matches device-state-store.ts) — Next.js bundles this
// module separately per route/instrumentation entrypoint, so a plain module-scope
// Map would be a different instance in the mutation handler vs. the poller.
declare global {
	// eslint-disable-next-line no-var
	var __stubPlugState: Map<string, boolean> | undefined;
	// eslint-disable-next-line no-var
	var __stubSetpointState: Map<string, number> | undefined;
}

if (!globalThis.__stubPlugState) {
	globalThis.__stubPlugState = new Map<string, boolean>();
}
if (!globalThis.__stubSetpointState) {
	globalThis.__stubSetpointState = new Map<string, number>();
}

const plugState = globalThis.__stubPlugState;
const setpointState = globalThis.__stubSetpointState;

// Cheap deterministic hash so each device gets a stable-looking baseline
// reading instead of every device showing identical fixture values.
function pseudoRandom(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) {
		h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	}
	return h / 0xffffffff;
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

export const stubTuyaClient: TuyaGatewayClient = {
	async fetchGatewayDevices(_gateway, devices) {
		// Simulate LAN latency
		await new Promise((r) => setTimeout(r, 150));

		return devices.map((d): TuyaDeviceReading => {
			const r = pseudoRandom(d.tuyaDeviceId);
			// Small per-poll jitter so demo readings feel alive without drifting far
			const jitter = (Math.random() - 0.5) * 0.4;

			if (d.deviceType === "plug") {
				const isOn = d.nodeId ? (plugState.get(d.nodeId) ?? r > 0.5) : r > 0.5;
				return {
					tuyaDeviceId: d.tuyaDeviceId,
					isOnline: true,
					temperatureC: null,
					setpointC: null,
					humidityPct: null,
					isOn,
				};
			}

			if (d.deviceType === "valve") {
				const setpointC = d.nodeId
					? (setpointState.get(d.nodeId) ?? round1(19 + r * 4))
					: round1(19 + r * 4);
				return {
					tuyaDeviceId: d.tuyaDeviceId,
					isOnline: true,
					temperatureC: round1(18 + r * 6 + jitter),
					setpointC,
					humidityPct: null,
					isOn: null,
				};
			}

			// sensor
			return {
				tuyaDeviceId: d.tuyaDeviceId,
				isOnline: true,
				temperatureC: round1(18 + r * 8 + jitter),
				setpointC: null,
				humidityPct: Math.round(35 + r * 40),
				isOn: null,
			};
		});
	},

	async sendSetpoint(_gateway, command) {
		if (command.cid) setpointState.set(command.cid, command.set / 10);
	},

	async sendSwitch(_gateway, command) {
		if (command.cid) plugState.set(command.cid, command.set);
	},
};
