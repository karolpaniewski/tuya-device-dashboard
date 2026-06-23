import { eq, isNotNull } from "drizzle-orm";
import cron from "node-cron";

import { db } from "~/server/db";
import { automationModes, automationModeTargets } from "~/server/db/schema";
import { getLogger } from "~/server/lib/log-context";
import { applyModeToRooms } from "~/server/lib/mode-control";

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
		void runModeTick();
	});
}
