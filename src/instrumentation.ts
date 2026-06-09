export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { startPollingLoop } = await import("~/server/workers/tuya-poller");
		startPollingLoop();
	}
}
