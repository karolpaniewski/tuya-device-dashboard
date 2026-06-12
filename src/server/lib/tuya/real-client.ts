import TuyAPI from "tuyapi";

import type { TuyaDeviceReading, TuyaGatewayClient } from "./types";

const CONNECT_TIMEOUT_MS = 8_000;
// How long to wait for reconnect after a disconnect
const RECONNECT_DELAY_MS = 10_000;

interface GatewayState {
	tuyaGateway: InstanceType<typeof TuyAPI>;
	// cid (nodeId) → most recent DPS snapshot
	latestDps: Map<string, Record<string, unknown>>;
	nodeToTuya: Map<string, string>;
	nodeToType: Map<string, string>;
	isConnected: boolean;
	reconnectTimer?: ReturnType<typeof setTimeout>;
}

// Module-level map — one persistent connection per gateway
const gatewayConnections = new Map<string, GatewayState>();

function buildConnection(
	gateway: {
		tuyaGatewayId: string;
		ipAddress: string;
		localKey: string;
	},
	nodeToTuya: Map<string, string>,
	nodeToType: Map<string, string>,
): GatewayState {
	const tuyaGateway = new TuyAPI({
		id: gateway.tuyaGatewayId,
		key: gateway.localKey,
		ip: gateway.ipAddress,
		version: "3.5",
	});

	const state: GatewayState = {
		tuyaGateway,
		latestDps: new Map(),
		nodeToTuya,
		nodeToType,
		isConnected: false,
	};

	const onData = (data: unknown, cmdByte?: number) => {
		const d = data as {
			cid?: string;
			devId?: string;
			dps?: Record<string, unknown>;
		} | null;
		if (!d || typeof d !== "object") return;
		const key = d.cid ?? d.devId;
		if (key && d.dps) {
			state.latestDps.set(key, { ...state.latestDps.get(key), ...d.dps });
			console.log(
				`[tuya-poller] state update cid=${key} cmd=${cmdByte}:`,
				d.dps,
			);
		}
	};

	tuyaGateway.on("data", onData);
	tuyaGateway.on("dp-refresh", onData);
	tuyaGateway.on("heartbeat", () =>
		console.log(`[tuya-debug] heartbeat from ${gateway.tuyaGatewayId}`),
	);
	tuyaGateway.on("error", (err: unknown) =>
		console.log(`[tuya-debug] gateway ${gateway.tuyaGatewayId} error:`, err),
	);
	tuyaGateway.on("disconnected", () => {
		console.log(
			`[tuya-poller] gateway ${gateway.tuyaGatewayId} disconnected — reconnecting in ${RECONNECT_DELAY_MS}ms`,
		);
		state.isConnected = false;
		state.reconnectTimer = setTimeout(() => {
			void connectState(gateway.tuyaGatewayId, state);
		}, RECONNECT_DELAY_MS);
	});

	return state;
}

async function connectState(
	tuyaGatewayId: string,
	state: GatewayState,
): Promise<void> {
	try {
		await Promise.race([
			state.tuyaGateway.connect(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`connect timeout (${CONNECT_TIMEOUT_MS}ms)`)),
					CONNECT_TIMEOUT_MS,
				),
			),
		]);
		state.isConnected = true;
		console.log(
			`[tuya-poller] gateway ${tuyaGatewayId} connected (persistent)`,
		);
		// Trigger DP_REFRESH for each sub-device to populate initial state.
		// Gateway responds with dp-refresh events that onData stores in latestDps.
		void refreshSubDevices(tuyaGatewayId, state);
	} catch (err) {
		console.error(
			`[tuya-poller] gateway ${tuyaGatewayId} connect failed:`,
			err,
		);
		// Retry after delay
		state.reconnectTimer = setTimeout(() => {
			void connectState(tuyaGatewayId, state);
		}, RECONNECT_DELAY_MS);
	}
}

async function refreshSubDevices(
	tuyaGatewayId: string,
	state: GatewayState,
): Promise<void> {
	const nodeIds = [...state.nodeToTuya.keys()];
	console.log(
		`[tuya-poller] refreshing ${nodeIds.length} sub-devices on gateway ${tuyaGatewayId}`,
	);
	for (const nodeId of nodeIds) {
		try {
			await state.tuyaGateway.refresh({ cid: nodeId });
		} catch (err) {
			console.warn(
				`[tuya-poller] refresh failed cid=${nodeId}:`,
				(err as Error).message,
			);
		}
	}
}

async function ensureConnected(
	gateway: {
		tuyaGatewayId: string;
		ipAddress: string;
		localKey: string;
	},
	devices: { tuyaDeviceId: string; nodeId: string; deviceType?: string }[],
): Promise<GatewayState> {
	let state = gatewayConnections.get(gateway.tuyaGatewayId);

	if (!state) {
		const nodeToTuya = new Map(devices.map((d) => [d.nodeId, d.tuyaDeviceId]));
		const nodeToType = new Map(
			devices.map((d) => [d.nodeId, d.deviceType ?? ""]),
		);
		state = buildConnection(gateway, nodeToTuya, nodeToType);
		gatewayConnections.set(gateway.tuyaGatewayId, state);
		await connectState(gateway.tuyaGatewayId, state);
	}

	return state;
}

export const realTuyaClient: TuyaGatewayClient = {
	async fetchGatewayDevices(gateway, devices) {
		if (!gateway.ipAddress || !gateway.localKey) {
			console.warn(
				`[tuya-poller] Gateway ${gateway.tuyaGatewayId}: missing ipAddress or localKey — skipping`,
			);
			return [];
		}

		const pollable = devices.filter(
			(d): d is { tuyaDeviceId: string; nodeId: string; deviceType?: string } =>
				d.nodeId !== null,
		);
		if (pollable.length === 0) return [];

		const state = await ensureConnected(
			{
				tuyaGatewayId: gateway.tuyaGatewayId,
				ipAddress: gateway.ipAddress,
				localKey: gateway.localKey,
			},
			pollable,
		);

		// Build readings from whatever has been accumulated so far.
		// DPS key mapping differs by device type:
		//   sensor (plwbuwzx): "1" = temperature, "2" = humidity
		//   valve  (ogx8u5z6): "2" = temperature, "4" = setpoint
		const readings: TuyaDeviceReading[] = [];
		for (const [cid, dps] of state.latestDps) {
			const tuyaDeviceId = state.nodeToTuya.get(cid);
			if (!tuyaDeviceId) continue;
			const deviceType = state.nodeToType.get(cid) ?? "";
			const tempRaw = deviceType === "sensor" ? dps["1"] : dps["2"];
			const setpointRaw = deviceType === "sensor" ? undefined : dps["4"];
			readings.push({
				tuyaDeviceId,
				isOnline: true,
				temperatureC: typeof tempRaw === "number" ? tempRaw / 10 : null,
				setpointC: typeof setpointRaw === "number" ? setpointRaw / 10 : null,
			});
		}

		console.log(
			`[tuya-poller] gateway ${gateway.tuyaGatewayId}: ${readings.length}/${pollable.length} devices with known state`,
		);
		return readings;
	},

	async sendSetpoint(gateway, command) {
		if (!gateway.localKey)
			throw new Error("localKey is required for sendSetpoint");
		const device = new TuyAPI({
			id: gateway.tuyaGatewayId,
			key: gateway.localKey,
			ip: gateway.ipAddress ?? undefined,
			version: "3.5",
		});
		await device.connect();
		try {
			await device.set({
				dps: command.dps,
				set: command.set,
				shouldWaitForResponse: true,
				...(command.cid ? { cid: command.cid } : {}),
			});
		} finally {
			await device.disconnect();
		}
	},
};
