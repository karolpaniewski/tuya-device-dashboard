import { getLogger } from "~/server/lib/log-context";

export const WEATHER_LOCATION = {
	name: "Mościska",
	latitude: 52.28802,
	longitude: 20.87145,
	timezone: "Europe/Warsaw",
} as const;

export interface OutdoorTemperatureReading {
	recordedAt: Date;
	temperatureC: number;
}

export interface OutdoorCurrentConditions {
	temperatureC: number;
	feelsLikeC: number;
	humidityPct: number;
	windKph: number;
}

export interface OutdoorWeatherSnapshot {
	readings: OutdoorTemperatureReading[];
	current: OutdoorCurrentConditions | null;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

interface WeatherCache {
	expiresAt: number;
	data: OutdoorWeatherSnapshot;
}

// Pinned to globalThis so the cache survives across Next.js's per-chunk module
// duplication (see stub-client.ts) and isn't refetched by every concurrent request.
declare global {
	// eslint-disable-next-line no-var
	var __outdoorWeatherSnapshotCache: WeatherCache | undefined;
}

interface OpenMeteoResponse {
	current?: {
		temperature_2m: number;
		apparent_temperature: number;
		relative_humidity_2m: number;
		wind_speed_10m: number;
	};
	hourly: {
		time: string[];
		temperature_2m: (number | null)[];
	};
}

async function fetchFromOpenMeteo(): Promise<OutdoorWeatherSnapshot> {
	const url = new URL("https://api.open-meteo.com/v1/forecast");
	url.searchParams.set("latitude", String(WEATHER_LOCATION.latitude));
	url.searchParams.set("longitude", String(WEATHER_LOCATION.longitude));
	url.searchParams.set("hourly", "temperature_2m");
	url.searchParams.set(
		"current",
		"temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m",
	);
	url.searchParams.set("past_hours", "24");
	url.searchParams.set("forecast_hours", "1");
	url.searchParams.set("timezone", WEATHER_LOCATION.timezone);

	const res = await fetch(url, { cache: "no-store" });
	if (!res.ok) {
		throw new Error(`Open-Meteo request failed: ${res.status}`);
	}

	const body = (await res.json()) as OpenMeteoResponse;
	const { time, temperature_2m: temps } = body.hourly;

	const readings: OutdoorTemperatureReading[] = [];
	for (let i = 0; i < time.length; i++) {
		const t = temps[i];
		const ts = time[i];
		if (t === null || t === undefined || ts === undefined) continue;
		readings.push({ recordedAt: new Date(ts), temperatureC: t });
	}

	const current = body.current
		? {
				temperatureC: body.current.temperature_2m,
				feelsLikeC: body.current.apparent_temperature,
				humidityPct: body.current.relative_humidity_2m,
				windKph: body.current.wind_speed_10m,
			}
		: null;

	return { readings, current };
}

export async function getOutdoorWeatherSnapshot(): Promise<OutdoorWeatherSnapshot> {
	const cached = globalThis.__outdoorWeatherSnapshotCache;
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	try {
		const data = await fetchFromOpenMeteo();
		globalThis.__outdoorWeatherSnapshotCache = {
			expiresAt: Date.now() + CACHE_TTL_MS,
			data,
		};
		return data;
	} catch (err) {
		getLogger().error({ err }, "weather.fetch-failed");
		if (cached) return cached.data;
		return { readings: [], current: null };
	}
}
