import { and, eq, inArray } from "drizzle-orm";
import cron from "node-cron";

import { db } from "~/server/db";
import {
	automationExecutionLogs,
	automationRules,
	deviceRoomAssignments,
	devices,
} from "~/server/db/schema";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getLogger, runWithWorkerContext } from "~/server/lib/log-context";
import { sendSetpointCommand } from "~/server/lib/valve-control";

const FRESH_READING_MS = 5 * 60 * 1000;

export async function getRoomAvgTemperature(
	deviceId: string,
): Promise<number | null> {
	const [assignment] = await db
		.select({ roomId: deviceRoomAssignments.roomId })
		.from(deviceRoomAssignments)
		.where(eq(deviceRoomAssignments.deviceId, deviceId));

	if (!assignment) return null;

	const roomDeviceRows = await db
		.select({ deviceId: deviceRoomAssignments.deviceId })
		.from(deviceRoomAssignments)
		.where(eq(deviceRoomAssignments.roomId, assignment.roomId));
	const roomDeviceIds = roomDeviceRows.map((r) => r.deviceId);
	if (roomDeviceIds.length === 0) return null;

	const sensorRows = await db
		.select({ tuyaDeviceId: devices.tuyaDeviceId })
		.from(devices)
		.where(
			and(inArray(devices.id, roomDeviceIds), eq(devices.deviceType, "sensor")),
		);

	const now = Date.now();
	const freshReadings: number[] = [];
	for (const sensor of sensorRows) {
		const state = deviceStateStore.get(sensor.tuyaDeviceId);
		if (!state || state.temperatureC === null) continue;
		if (now - state.lastPolledAt.getTime() > FRESH_READING_MS) continue;
		freshReadings.push(state.temperatureC);
	}

	if (freshReadings.length === 0) return null;
	return freshReadings.reduce((sum, t) => sum + t, 0) / freshReadings.length;
}

async function logExecution(
	ruleId: string,
	status: "success" | "failed" | "skipped",
	error?: string,
): Promise<void> {
	await db.insert(automationExecutionLogs).values({
		ruleId,
		firedAt: new Date(),
		status,
		error: error ?? null,
	});
}

export async function runAutomationTick(): Promise<void> {
	getLogger().debug("automation-scheduler.tick-start");

	const now = new Date();
	const currentDay = now.getDay();
	const currentHour = now.getHours();
	const currentMinute = now.getMinutes();

	const rules = await db
		.select()
		.from(automationRules)
		.where(eq(automationRules.isEnabled, true));

	let firedCount = 0;

	for (const rule of rules) {
		await runWithWorkerContext({ ruleId: rule.id }, async () => {
			const daysOfWeek = JSON.parse(rule.daysOfWeek) as number[];
			if (!daysOfWeek.includes(currentDay)) return;
			if (rule.fireHour !== currentHour || rule.fireMinute !== currentMinute) {
				return;
			}

			if (rule.tempThresholdC !== null) {
				const roomAvg = await getRoomAvgTemperature(rule.deviceId);
				if (roomAvg !== null && roomAvg >= rule.tempThresholdC) {
					await logExecution(
						rule.id,
						"skipped",
						"Temperature condition not met",
					);
					return;
				}
			}

			firedCount++;

			try {
				await sendSetpointCommand(rule.deviceId, rule.targetSetpointC);
				await logExecution(rule.id, "success");
			} catch (err) {
				const message = err instanceof Error ? err.message : "COMMAND_FAILED";
				await logExecution(rule.id, "failed", message);
			}
		});
	}

	getLogger().info(
		{ rulesEvaluated: rules.length, firedCount },
		"automation-scheduler.tick-complete",
	);
}

export function startAutomationScheduler(): void {
	cron.schedule("* * * * *", () => {
		void runAutomationTick();
	});
}
