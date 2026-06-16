import { automationRouter } from "~/server/api/routers/automation";
import { deviceRouter } from "~/server/api/routers/device";
import { roomRouter } from "~/server/api/routers/room";
import { siteRouter } from "~/server/api/routers/site";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
	automation: automationRouter,
	device: deviceRouter,
	room: roomRouter,
	site: siteRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
