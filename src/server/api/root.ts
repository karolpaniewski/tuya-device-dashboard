import { deviceRouter } from "~/server/api/routers/device";
import { roomRouter } from "~/server/api/routers/room";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
	device: deviceRouter,
	room: roomRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
