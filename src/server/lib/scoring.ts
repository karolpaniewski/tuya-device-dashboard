export type RoomBadge = "OK" | "Too Cold" | "Too Hot";

export interface RoomScore {
	badge: RoomBadge | null;
	anomaly: boolean;
	suggestion: string | null;
}

export function scoreRoom(
	temperatureC: number | null,
	valveSetpointC: number | null,
	thresholds: {
		minTempC: number | null;
		maxTempC: number | null;
		anomalyGapC: number | null;
	},
): RoomScore {
	if (
		temperatureC === null ||
		thresholds.minTempC === null ||
		thresholds.maxTempC === null
	) {
		return { badge: null, anomaly: false, suggestion: null };
	}

	let badge: RoomBadge;
	if (temperatureC < thresholds.minTempC) {
		badge = "Too Cold";
	} else if (temperatureC > thresholds.maxTempC) {
		badge = "Too Hot";
	} else {
		badge = "OK";
	}

	let anomaly = false;
	let suggestion: string | null = null;
	if (
		valveSetpointC !== null &&
		thresholds.anomalyGapC !== null &&
		temperatureC < valveSetpointC - thresholds.anomalyGapC
	) {
		anomaly = true;
		const gap = Math.round((valveSetpointC - temperatureC) * 10) / 10;
		suggestion = `Temperature is ${gap}°C below setpoint — consider raising valve to ${valveSetpointC}°C`;
	}

	return { badge, anomaly, suggestion };
}
