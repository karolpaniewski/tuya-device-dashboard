import { AsyncLocalStorage } from "node:async_hooks";
import type pino from "pino";
import { logger } from "~/server/lib/logger";

type LogContextStore = Record<string, string | undefined>;

const als = new AsyncLocalStorage<LogContextStore>();

export function runWithRequestContext<T>(fn: () => Promise<T>): Promise<T> {
	const store: LogContextStore = { requestId: crypto.randomUUID() };
	return als.run(store, fn);
}

export function setRequestUserId(userId: string | undefined): void {
	const store = als.getStore();
	if (store) store.userId = userId;
}

export function runWithWorkerContext<T>(
	context: Record<string, string>,
	fn: () => Promise<T>,
): Promise<T> {
	const store: LogContextStore = { ...als.getStore(), ...context };
	return als.run(store, fn);
}

export function getLogger(): pino.Logger {
	const store = als.getStore();
	return store ? logger.child(store) : logger;
}
