import TuyAPI from "tuyapi";

import { getLogger } from "~/server/lib/log-context";
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

	const gatewayLogger = getLogger().child({
		gatewayId: gateway.tuyaGatewayId,
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
			gatewayLogger.debug(
				{ cid: key, cmdByte, dps: d.dps },
				"tuya.state-update",
			);
		}
	};

	tuyaGateway.on("data", onData);
	tuyaGateway.on("dp-refresh", onData);
	tuyaGateway.on("heartbeat", () => gatewayLogger.debug("tuya.heartbeat"));
	tuyaGateway.on("error", (err: unknown) =>
		gatewayLogger.warn({ err }, "tuya.gateway-error-event"),
	);
	tuyaGateway.on("disconnected", () => {
		gatewayLogger.warn("tuya.disconnected-reconnecting");
		state.isConnected = false;
		if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
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
	const gatewayLogger = getLogger().child({ gatewayId: tuyaGatewayId });
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
		gatewayLogger.info("tuya.connected");
		// Trigger DP_REFRESH for each sub-device to populate initial state.
		// Gateway responds with dp-refresh events that onData stores in latestDps.
		void refreshSubDevices(tuyaGatewayId, state);
	} catch (err) {
		gatewayLogger.error({ err }, "tuya.connect-failed");
		// Abort any in-flight connect so stale event listeners don't fire.
		try {
			state.tuyaGateway.disconnect();
		} catch {
			/* ignore */
		}
		// Retry after delay
		if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
		state.reconnectTimer = setTimeout(() => {
			void connectState(tuyaGatewayId, state);
		}, RECONNECT_DELAY_MS);
	}
}

async function refreshSubDevices(
	tuyaGatewayId: string,
	state: GatewayState,
): Promise<void> {
	const gatewayLogger = getLogger().child({ gatewayId: tuyaGatewayId });
	const nodeIds = [...state.nodeToTuya.keys()];
	gatewayLogger.debug({ nodeCount: nodeIds.length }, "tuya.refresh-start");
	for (const nodeId of nodeIds) {
		try {
			await state.tuyaGateway.refresh({ cid: nodeId });
		} catch (err) {
			gatewayLogger.warn({ err, nodeId }, "tuya.refresh-failed");
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
		const gatewayLogger = getLogger().child({
			gatewayId: gateway.tuyaGatewayId,
		});

		if (!gateway.ipAddress || !gateway.localKey) {
			gatewayLogger.warn("tuya.missing-connection-info");
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
			const isSensor = deviceType === "sensor";
			const tempRaw = isSensor ? dps["1"] : dps["2"];
			const setpointRaw = isSensor ? undefined : dps["4"];
			const humidityRaw = isSensor ? dps["2"] : undefined;
			readings.push({
				tuyaDeviceId,
				isOnline: true,
				temperatureC: typeof tempRaw === "number" ? tempRaw / 10 : null,
				setpointC: typeof setpointRaw === "number" ? setpointRaw / 10 : null,
				humidityPct: typeof humidityRaw === "number" ? humidityRaw / 10 : null,
			});
		}

		gatewayLogger.debug(
			{ knownCount: readings.length, pollableCount: pollable.length },
			"tuya.poll-summary",
		);
		return readings;
	},

	async sendSetpoint(gateway, command) {
		const state = gatewayConnections.get(gateway.tuyaGatewayId);
		if (!state?.isConnected)
			throw new Error(
				`Gateway ${gateway.tuyaGatewayId} is not connected — poller must run before sendSetpoint`,
			);
		await state.tuyaGateway.set({
			dps: command.dps,
			set: command.set,
			shouldWaitForResponse: true,
			...(command.cid ? { cid: command.cid } : {}),
		});
	},
};
