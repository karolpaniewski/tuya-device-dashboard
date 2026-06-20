import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	getOutdoorWeatherSnapshot,
	WEATHER_LOCATION,
} from "~/server/lib/weather";

export const weatherRouter = createTRPCRouter({
	outdoorHistory: protectedProcedure.query(async () => {
		const { readings, current } = await getOutdoorWeatherSnapshot();
		const temps = readings.map((r) => r.temperatureC);

		return {
			location: WEATHER_LOCATION.name,
			readings,
			current,
			minC: temps.length > 0 ? Math.min(...temps) : null,
			maxC: temps.length > 0 ? Math.max(...temps) : null,
		};
	}),
});
