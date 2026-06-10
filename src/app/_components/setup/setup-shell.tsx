"use client";

import { api } from "~/trpc/react";
import { DeviceAssignmentGrid } from "./device-assignment-grid";
import { RoomManager } from "./room-manager";

export function SetupShell() {
	const utils = api.useUtils();
	const roomsQuery = api.room.list.useQuery();
	const devicesQuery = api.device.overview.useQuery();

	if (roomsQuery.isLoading || devicesQuery.isLoading) {
		return <p className="text-gray-400 text-sm">Loading…</p>;
	}

	if (roomsQuery.error || devicesQuery.error) {
		return <p className="text-red-400 text-sm">Failed to load data.</p>;
	}

	const rooms = roomsQuery.data ?? [];
	const allDevices = [
		...(devicesQuery.data?.rooms.flatMap((r) => r.devices) ?? []),
		...(devicesQuery.data?.unassigned ?? []),
	];

	return (
		<div className="flex flex-col gap-10">
			<RoomManager rooms={rooms} utils={utils} />
			<DeviceAssignmentGrid devices={allDevices} rooms={rooms} utils={utils} />
		</div>
	);
}
