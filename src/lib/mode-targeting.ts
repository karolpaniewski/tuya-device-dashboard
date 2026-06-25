import type { RouterOutputs } from "~/trpc/react";

type Mode = RouterOutputs["mode"]["list"][number];

export interface ModeTargetingRoom {
	id: string;
	name: string;
	targetOn: boolean;
	daysOfWeek: number[] | null;
	fireHour: number | null;
	fireMinute: number | null;
}

/**
 * Returns the modes that target `roomId`, each annotated with that room's
 * specific `targetOn` value — a mode's `targets` array can target multiple
 * rooms with different on/off states, so the mode-level `targets` shape
 * isn't directly usable by a room-scoped view.
 */
export function getModesForRoom(
	roomId: string,
	modes: Mode[],
): ModeTargetingRoom[] {
	const result: ModeTargetingRoom[] = [];
	for (const mode of modes) {
		const target = mode.targets.find((t) => t.roomId === roomId);
		if (!target) continue;
		result.push({
			id: mode.id,
			name: mode.name,
			targetOn: target.targetOn,
			daysOfWeek: mode.daysOfWeek,
			fireHour: mode.fireHour,
			fireMinute: mode.fireMinute,
		});
	}
	return result;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Matches mode-manager.tsx's scheduleSummary formatting for a room-targeting mode. */
export function formatModeSchedule(mode: ModeTargetingRoom): string {
	if (
		mode.daysOfWeek === null ||
		mode.fireHour === null ||
		mode.fireMinute === null
	) {
		return "Manual trigger only";
	}
	const days = [...mode.daysOfWeek]
		.sort((a, b) => a - b)
		.map((d) => DAY_LABELS[d])
		.join(" ");
	const time = `${String(mode.fireHour).padStart(2, "0")}:${String(mode.fireMinute).padStart(2, "0")}`;
	return `${days} · ${time}`;
}
