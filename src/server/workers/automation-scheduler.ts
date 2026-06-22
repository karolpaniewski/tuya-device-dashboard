import { and, eq, inArray, isNotNull } from "drizzle-orm";
import cron from "node-cron";

import { db } from "~/server/db";
import {
	automationExecutionLogs,
	automationModes,
	automationModeTargets,
	automationRules,
	deviceRoomAssignments,
	devices,
	roomHeatState,
} from "~/server/db/schema";
import { deviceStateStore } from "~/server/lib/device-state-store";
import { getLogger, runWithWorkerContext } from "~/server/lib/log-context";
import { applyModeToRooms } from "~/server/lib/mode-control";
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

			const [assignment] = await db
				.select({ roomId: deviceRoomAssignments.roomId })
				.from(deviceRoomAssignments)
				.where(eq(deviceRoomAssignments.deviceId, rule.deviceId));

			if (assignment) {
				const [heatState] = await db
					.select({ pinnedOff: roomHeatState.pinnedOff })
					.from(roomHeatState)
					.where(eq(roomHeatState.roomId, assignment.roomId));

				if (heatState?.pinnedOff) {
					await logExecution(rule.id, "skipped", "Room manually pinned off");
					return;
				}
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

export async function runModeTick(): Promise<void> {
	getLogger().debug("automation-scheduler.mode-tick-start");

	const now = new Date();
	const currentDay = now.getDay();
	const currentHour = now.getHours();
	const currentMinute = now.getMinutes();

	const modes = await db
		.select()
		.from(automationModes)
		.where(isNotNull(automationModes.daysOfWeek))
		.orderBy(automationModes.createdAt);

	let firedCount = 0;

	// Sequential, not Promise.all — iteration order is the conflict tie-break:
	// if two modes target the same room in the same tick, the later-created
	// mode's command physically wins because it's sent after the earlier one.
	for (const mode of modes) {
		if (
			mode.daysOfWeek === null ||
			mode.fireHour === null ||
			mode.fireMinute === null
		) {
			continue;
		}

		const daysOfWeek = JSON.parse(mode.daysOfWeek) as number[];
		if (!daysOfWeek.includes(currentDay)) continue;
		if (mode.fireHour !== currentHour || mode.fireMinute !== currentMinute) {
			continue;
		}

		const targets = await db
			.select({
				roomId: automationModeTargets.roomId,
				targetOn: automationModeTargets.targetOn,
			})
			.from(automationModeTargets)
			.where(eq(automationModeTargets.modeId, mode.id));

		firedCount++;
		await applyModeToRooms(mode.id, targets, "schedule");
	}

	getLogger().info(
		{ modesEvaluated: modes.length, firedCount },
		"automation-scheduler.mode-tick-complete",
	);
}

export function startAutomationScheduler(): void {
	cron.schedule("* * * * *", () => {
		void runAutomationTick();
	});
	cron.schedule("* * * * *", () => {
		void runModeTick();
	});
}
