"use client";

import { ErrorMessage } from "~/components/ui/error-message";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { DeviceAssignmentGrid } from "./device-assignment-grid";
import { RoomManager } from "./room-manager";

export function SetupShell() {
	const utils = api.useUtils();
	const roomsQuery = api.room.list.useQuery();
	const devicesQuery = api.device.overview.useQuery();

	if (roomsQuery.isLoading || devicesQuery.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				{Array.from({ length: 4 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
					<Skeleton className="h-12 rounded-lg" key={i} />
				))}
				<Skeleton className="h-32 rounded-lg" />
			</div>
		);
	}

	if (roomsQuery.error ?? devicesQuery.error) {
		return <ErrorMessage message="Failed to load data." variant="inline" />;
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
