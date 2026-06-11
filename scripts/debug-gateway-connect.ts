/**
 * Diagnostic script — tries to connect to the Tuya gateway with each protocol
 * version and reports what events arrive.
 *
 * Run:  npx tsx --env-file=.env scripts/debug-gateway-connect.ts
 */

// Enable TuyAPI internal debug logging
process.env.DEBUG = "TuyAPI";

import TuyAPI from "tuyapi";

const GATEWAY_ID = "bf8ee8139d2392aab69x6h";
const GATEWAY_IP = process.env.TUYA_GATEWAY_IP;
const GATEWAY_KEY = process.env.TUYA_GATEWAY_KEY;

if (!GATEWAY_IP || !GATEWAY_KEY) {
	console.error("Missing TUYA_GATEWAY_IP or TUYA_GATEWAY_KEY in env");
	process.exit(1);
}

console.log(`Gateway: ${GATEWAY_ID} @ ${GATEWAY_IP}`);
console.log(
	`Key (first 4 chars): ${GATEWAY_KEY.slice(0, 4)}... (length=${GATEWAY_KEY.length})`,
);
console.log();

for (const version of ["3.3", "3.4", "3.5"] as const) {
	console.log(`${"=".repeat(50)}`);
	console.log(`Trying version ${version} ...`);

	const device = new TuyAPI({
		id: GATEWAY_ID,
		key: GATEWAY_KEY,
		ip: GATEWAY_IP,
		version,
	});

	let eventCount = 0;

	device.on("data", (data: unknown) => {
		eventCount++;
		console.log(`  [data]:`, JSON.stringify(data));
	});
	device.on("dp-refresh", (data: unknown) => {
		eventCount++;
		console.log(`  [dp-refresh]:`, JSON.stringify(data));
	});
	device.on("heartbeat", () => {
		eventCount++;
		console.log(`  [heartbeat]`);
	});
	device.on("error", (err: unknown) => {
		eventCount++;
		console.log(`  [error]:`, err instanceof Error ? err.message : err);
	});
	device.on("disconnected", () => {
		console.log(`  [disconnected]`);
	});

	try {
		const connectPromise = device.connect();
		const timeout = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("connect timeout 8s")), 8_000),
		);
		await Promise.race([connectPromise, timeout]);
		console.log(
			`  Connected! Sending get({schema:true}) to trigger response...`,
		);

		// Fire get() to ask gateway for its current state — don't await, just trigger
		device
			.get({ schema: true })
			.then((res: unknown) =>
				console.log(`  get() response:`, JSON.stringify(res)),
			)
			.catch((err: unknown) =>
				console.log(`  get() error:`, err instanceof Error ? err.message : err),
			);

		console.log(`  Listening 15s for events...`);
		await new Promise((r) => setTimeout(r, 15_000));
		console.log(`  Events received: ${eventCount}`);
		try {
			device.disconnect();
		} catch {}
	} catch (err) {
		console.log(`  FAILED:`, err instanceof Error ? err.message : err);
	}

	// Brief pause between attempts
	await new Promise((r) => setTimeout(r, 2_000));
}

console.log();
console.log("Done.");
process.exit(0);
