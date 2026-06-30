import { dashboardLayoutRouter } from "~/server/api/routers/dashboard-layout";
import { deviceRouter } from "~/server/api/routers/device";
import { eventRouter } from "~/server/api/routers/event";
import { modeRouter } from "~/server/api/routers/mode";
import { notificationRouter } from "~/server/api/routers/notification";
import { roomRouter } from "~/server/api/routers/room";
import { settingsRouter } from "~/server/api/routers/settings";
import { siteRouter } from "~/server/api/routers/site";
import { weatherRouter } from "~/server/api/routers/weather";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
	dashboardLayout: dashboardLayoutRouter,
	device: deviceRouter,
	event: eventRouter,
	mode: modeRouter,
	notification: notificationRouter,
	room: roomRouter,
	settings: settingsRouter,
	site: siteRouter,
	weather: weatherRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
