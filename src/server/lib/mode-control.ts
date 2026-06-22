import { and, eq } from "drizzle-orm";

import { db } from "~/server/db";
import {
	automationModeActivationLogs,
	deviceRoomAssignments,
	devices,
	roomHeatState,
} from "~/server/db/schema";
import { sendValveStateCommand } from "~/server/lib/valve-control";

export type ModeApplicationResult = {
	roomId: string;
	status: "applied" | "skipped-pinned" | "failed";
	error?: string;
};

export async function applyModeToRooms(
	modeId: string,
	targets: { roomId: string; targetOn: boolean }[],
	triggeredBy: "schedule" | "manual",
): Promise<ModeApplicationResult[]> {
	const results: ModeApplicationResult[] = [];

	for (const target of targets) {
		const [heatState] = await db
			.select({ pinnedOff: roomHeatState.pinnedOff })
			.from(roomHeatState)
			.where(eq(roomHeatState.roomId, target.roomId));

		if (heatState?.pinnedOff) {
			results.push({ roomId: target.roomId, status: "skipped-pinned" });
			await db.insert(automationModeActivationLogs).values({
				modeId,
				roomId: target.roomId,
				triggeredBy,
				targetOn: target.targetOn,
				status: "skipped-pinned",
				firedAt: new Date(),
			});
			continue;
		}

		const valveDevices = await db
			.select({ deviceId: devices.id })
			.from(deviceRoomAssignments)
			.innerJoin(devices, eq(devices.id, deviceRoomAssignments.deviceId))
			.where(
				and(
					eq(deviceRoomAssignments.roomId, target.roomId),
					eq(devices.deviceType, "valve"),
				),
			);

		const settled = await Promise.allSettled(
			valveDevices.map((d) =>
				sendValveStateCommand(d.deviceId, target.targetOn),
			),
		);

		const firstRejection = settled.find(
			(r): r is PromiseRejectedResult => r.status === "rejected",
		);

		const status = firstRejection ? "failed" : "applied";
		const error = firstRejection
			? firstRejection.reason instanceof Error
				? firstRejection.reason.message
				: "COMMAND_FAILED"
			: undefined;

		results.push({ roomId: target.roomId, status, error });
		await db.insert(automationModeActivationLogs).values({
			modeId,
			roomId: target.roomId,
			triggeredBy,
			targetOn: target.targetOn,
			status,
			error: error ?? null,
			firedAt: new Date(),
		});
	}

	return results;
}
