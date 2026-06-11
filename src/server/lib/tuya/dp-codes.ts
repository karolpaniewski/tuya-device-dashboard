// Maps productKey → tuyapi DPS number for setpoint write.
// Initially empty — production values pending S-04 DP code documentation.
// Tests inject synthetic entries via vi.mock.
export const DP_CODE_MAP: Record<string, number> = {
	// wkf thermostat valve (product ogx8u5z6) — DP 4 = temp_set, scale 1 (tenths of °C)
	// DP 3 = valve_state ("opened"/"closed"), DP 2 = temp_current (confirmed from live device events)
	ogx8u5z6: 4,
};

if (Object.keys(DP_CODE_MAP).length === 0 && process.env.TUYA_STUB !== "true") {
	console.warn(
		"[tuya] DP_CODE_MAP is empty — no productKeys registered. All setpoint commands will be rejected.",
	);
}
