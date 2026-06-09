import { realTuyaClient } from "./real-client";
import { stubTuyaClient } from "./stub-client";

export type { TuyaDeviceReading, TuyaGatewayClient } from "./types";

export function getTuyaClient() {
	return process.env.TUYA_STUB === "true" ? stubTuyaClient : realTuyaClient;
}
