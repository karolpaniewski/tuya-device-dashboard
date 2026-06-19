import { getLogger } from "~/server/lib/log-context";

// Maps productKey → tuyapi DPS number for setpoint write.
// Initially empty — production values pending S-04 DP code documentation.
// Tests inject synthetic entries via vi.mock.
export const DP_CODE_MAP: Record<string, number> = {
	// wkf thermostat valve (product ogx8u5z6) — DP 4 = temp_set, scale 1 (tenths of °C)
	// DP 3 = valve_state ("opened"/"closed"), DP 2 = temp_current (confirmed from live device events)
	ogx8u5z6: 4,
	// smart plug (product fgwhjm9j) — DP 1 = switch_1 (on/off), the conventional Tuya
	// generic-socket DP. NOT yet confirmed against a live device events log (unlike the
	// valve entry above) — verify empirically before relying on this for production control.
	fgwhjm9j: 1,
};

if (Object.keys(DP_CODE_MAP).length === 0 && process.env.TUYA_STUB !== "true") {
	getLogger().warn(
		"DP_CODE_MAP is empty — no productKeys registered. All setpoint commands will be rejected.",
	);
}
