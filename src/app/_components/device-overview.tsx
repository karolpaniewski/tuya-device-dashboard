"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { FilterBar, type FilterState } from "./filter-bar";
import { RoomGroup } from "./room-group";

function matchDevice(
	device: { deviceType: string; isOnline: boolean; name: string },
	typeFilter: FilterState["type"],
	statusFilter: FilterState["status"],
	nameSearch: string,
): boolean {
	if (typeFilter && device.deviceType !== typeFilter) return false;
	if (statusFilter === "online" && !device.isOnline) return false;
	if (statusFilter === "offline" && device.isOnline) return false;
	if (
		nameSearch &&
		!device.name.toLowerCase().includes(nameSearch.toLowerCase())
	)
		return false;
	return true;
}

export function DeviceOverview() {
	const { data, isLoading, error } = api.device.overview.useQuery(undefined, {
		refetchInterval: 30_000,
		refetchIntervalInBackground: false,
	});

	const [roomFilter, setRoomFilter] = useState("");
	const [typeFilter, setTypeFilter] = useState<FilterState["type"]>("");
	const [statusFilter, setStatusFilter] = useState<FilterState["status"]>("");
	const [nameSearch, setNameSearch] = useState("");

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

	const activeFilterCount =
		(roomFilter ? 1 : 0) +
		(typeFilter ? 1 : 0) +
		(statusFilter ? 1 : 0) +
		(nameSearch ? 1 : 0);

	function clearFilters() {
		setRoomFilter("");
		setTypeFilter("");
		setStatusFilter("");
		setNameSearch("");
	}

	const rooms =
		data?.rooms.map((r) => ({ roomId: r.roomId, roomName: r.roomName })) ?? [];

	const filteredRooms = (data?.rooms ?? [])
		.filter((room) => !roomFilter || room.roomId === roomFilter)
		.map((room) => ({
			...room,
			devices: room.devices.filter((d) =>
				matchDevice(d, typeFilter, statusFilter, nameSearch),
			),
		}))
		.filter((room) => room.devices.length > 0);

	const filteredUnassigned = roomFilter
		? []
		: (data?.unassigned ?? []).filter((d) =>
				matchDevice(d, typeFilter, statusFilter, nameSearch),
			);

	const isEmpty =
		activeFilterCount > 0 &&
		filteredRooms.length === 0 &&
		filteredUnassigned.length === 0;

	return (
		<div className="flex flex-col gap-8">
			<FilterBar
				activeFilterCount={activeFilterCount}
				filters={{
					roomId: roomFilter,
					search: nameSearch,
					status: statusFilter,
					type: typeFilter,
				}}
				onClear={clearFilters}
				onRoomChange={setRoomFilter}
				onSearchChange={setNameSearch}
				onStatusChange={setStatusFilter}
				onTypeChange={setTypeFilter}
				rooms={rooms}
			/>
			{isEmpty ? (
				<p className="text-gray-400 text-sm">
					No devices match your filters.{" "}
					<button
						className="text-blue-400 hover:text-blue-300"
						onClick={clearFilters}
						type="button"
					>
						Clear filters
					</button>
				</p>
			) : (
				<>
					{filteredRooms.map((room) => (
						<RoomGroup
							anomaly={room.anomaly}
							badge={room.badge}
							devices={room.devices}
							key={room.roomId}
							roomName={room.roomName}
							suggestion={room.suggestion}
						/>
					))}
					{filteredUnassigned.length > 0 && (
						<RoomGroup
							devices={filteredUnassigned}
							isUnassigned
							roomName="Unassigned"
						/>
					)}
				</>
			)}
		</div>
	);
}
