// Maps productKey → tuyapi DPS number for setpoint write.
// Initially empty — production values pending S-04 DP code documentation.
// Tests inject synthetic entries via vi.mock.
export const DP_CODE_MAP: Record<string, number> = {};

if (Object.keys(DP_CODE_MAP).length === 0 && process.env.TUYA_STUB !== "true") {
	console.warn(
		"[tuya] DP_CODE_MAP is empty — no productKeys registered. All setpoint commands will be rejected.",
	);
}
