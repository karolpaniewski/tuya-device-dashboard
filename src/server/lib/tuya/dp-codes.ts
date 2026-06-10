// Maps productKey → tuyapi DPS number for setpoint write.
// Initially empty — production values pending S-04 DP code documentation.
// Tests inject synthetic entries via vi.mock.
export const DP_CODE_MAP: Record<string, number> = {};
