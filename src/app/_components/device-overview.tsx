"use client";

import { Layers, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Skeleton } from "~/components/ui/skeleton";
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

	function clearFilters() {
		setRoomFilter("");
		setTypeFilter("");
		setStatusFilter("");
		setNameSearch("");
	}

	const allDevices = data
		? [...data.rooms.flatMap((r) => r.devices), ...data.unassigned]
		: [];
	const totalDevices = allDevices.length;
	const onlineCount = allDevices.filter((d) => d.isOnline).length;
	const roomCount = data?.rooms.length ?? 0;

	const activeFilterCount =
		(roomFilter ? 1 : 0) +
		(typeFilter ? 1 : 0) +
		(statusFilter ? 1 : 0) +
		(nameSearch ? 1 : 0);

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

	const isZeroDevices =
		!isLoading &&
		!error &&
		data &&
		data.rooms.length === 0 &&
		data.unassigned.length === 0 &&
		activeFilterCount === 0;

	const isFilteredEmpty =
		!isLoading &&
		!error &&
		data &&
		activeFilterCount > 0 &&
		filteredRooms.length === 0 &&
		filteredUnassigned.length === 0;

	return (
		<div className="flex flex-col gap-8">
			{/* Hero */}
			<div>
				<p className="text-gray-400 text-sm">
					LAN-only device monitoring — no cloud required
				</p>
				<div className="mt-2 flex gap-2">
					{isLoading ? (
						<>
							<Skeleton className="h-6 w-24 rounded-full" />
							<Skeleton className="h-6 w-20 rounded-full" />
							<Skeleton className="h-6 w-20 rounded-full" />
						</>
					) : data ? (
						<>
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-gray-300 text-xs">
								{totalDevices} devices
							</span>
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-gray-300 text-xs">
								{onlineCount} online
							</span>
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-gray-300 text-xs">
								{roomCount} rooms
							</span>
						</>
					) : null}
				</div>
			</div>

			{/* Loading skeleton grid */}
			{isLoading && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							className="flex h-32 flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-[2px]"
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
							key={i}
						>
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-6 w-1/2" />
							<Skeleton className="h-3 w-1/3" />
						</div>
					))}
				</div>
			)}

			{/* Error */}
			{!isLoading && error && (
				<ErrorMessage
					message="Failed to load devices. Please try again."
					variant="inline"
				/>
			)}

			{/* Zero devices (no filter active) */}
			{isZeroDevices && (
				<div className="flex flex-col items-center justify-center py-16 text-center">
					<Layers className="mb-4 text-gray-600" size={48} />
					<p className="font-semibold text-white">No devices discovered yet</p>
					<p className="mt-1 max-w-xs text-gray-400 text-sm">
						The polling worker will surface devices as they respond on the LAN.
					</p>
				</div>
			)}

			{/* Filter bar + device list (data present, not zero-devices) */}
			{!isLoading && !error && data && !isZeroDevices && (
				<>
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

					{isFilteredEmpty ? (
						<div className="flex flex-col items-center justify-center py-16 text-center">
							<Search className="mb-4 text-gray-600" size={48} />
							<p className="font-semibold text-white">
								No devices match your filters
							</p>
							<p className="mt-1 max-w-xs text-gray-400 text-sm">
								Try adjusting or clearing your filters.
							</p>
							<Button
								className="mt-4"
								onClick={clearFilters}
								size="sm"
								type="button"
								variant="ghost"
							>
								Clear filters
							</Button>
						</div>
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
				</>
			)}
		</div>
	);
}
