"use client";

import { api } from "~/trpc/react";
import { RoomGroup } from "./room-group";

export function DeviceOverview() {
	const { data, isLoading, error } = api.device.overview.useQuery(undefined, {
		refetchInterval: 30_000,
		refetchIntervalInBackground: false,
	});

	if (isLoading) {
		return <p className="text-gray-400 text-sm">Loading devices…</p>;
	}

	if (error) {
		return (
			<p className="text-red-400 text-sm">
				Failed to load devices: {error.message}
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-8">
			{data?.rooms.map((room) => (
				<RoomGroup
					devices={room.devices}
					key={room.roomId}
					roomName={room.roomName}
				/>
			))}
			{data && data.unassigned.length > 0 && (
				<RoomGroup
					devices={data.unassigned}
					isUnassigned
					roomName="Unassigned"
				/>
			)}
		</div>
	);
}
