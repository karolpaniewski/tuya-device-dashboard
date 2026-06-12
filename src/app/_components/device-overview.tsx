"use client";

import {
	CheckCircle2,
	Flame,
	Layers,
	Search,
	Thermometer,
	Wifi,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useSiteContext } from "~/components/site-context";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Skeleton } from "~/components/ui/skeleton";
import { api, type RouterOutputs } from "~/trpc/react";
import { FilterBar, type FilterState } from "./filter-bar";
import { RoomGroup } from "./room-group";
import { RoomSidebar } from "./room-sidebar";

type RoomItem = RouterOutputs["device"]["overview"]["rooms"][number];

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

function groupBySite(rooms: RoomItem[]): [string, RoomItem[]][] {
	const map = new Map<string, RoomItem[]>();
	for (const room of rooms) {
		const key = room.siteName || "Unknown";
		const group = map.get(key) ?? [];
		group.push(room);
		map.set(key, group);
	}
	return Array.from(map.entries());
}

function SiteSection({
	children,
	siteName,
}: {
	children: ReactNode;
	siteName: string;
}) {
	return (
		<section className="flex flex-col gap-4">
			<h2 className="font-bold text-lg text-white">{siteName}</h2>
			{children}
		</section>
	);
}

export function DeviceOverview() {
	const { activeSiteId } = useSiteContext();
	const { data, isLoading, error } = api.device.overview.useQuery(
		{ siteId: activeSiteId },
		{ refetchInterval: 30_000, refetchIntervalInBackground: false },
	);

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
	const offlineCount = totalDevices - onlineCount;
	const roomCount = data?.rooms.length ?? 0;
	const roomsOk = data?.rooms.filter((r) => r.badge === "OK").length ?? 0;
	const roomsTooHot =
		data?.rooms.filter((r) => r.badge === "Too Hot").length ?? 0;
	const roomsTooCold =
		data?.rooms.filter((r) => r.badge === "Too Cold").length ?? 0;
	const avgTempReadings =
		data?.rooms
			.flatMap((r) => r.devices)
			.filter(
				(d) =>
					d.deviceType === "sensor" &&
					d.isOnline &&
					!d.isStale &&
					d.temperatureC !== null,
			)
			.map((d) => d.temperatureC as number) ?? [];
	const avgTempC =
		avgTempReadings.length > 0
			? avgTempReadings.reduce((a, b) => a + b, 0) / avgTempReadings.length
			: null;

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
			{/* KPI Row */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{isLoading
					? Array.from({ length: 4 }).map((_, i) => (
							<div
								className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-[2px]"
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
								key={i}
							>
								<Skeleton className="mb-2 h-3 w-16" />
								<Skeleton className="mb-1 h-7 w-12" />
								<Skeleton className="h-3 w-24" />
							</div>
						))
					: data
						? (
								[
									{
										icon: <Wifi className="h-4 w-4" />,
										label: "Devices",
										sub: `${onlineCount} online · ${offlineCount} offline`,
										value: totalDevices,
									},
									{
										icon: <Thermometer className="h-4 w-4" />,
										label: "Avg Temp",
										sub: "online sensors",
										value: avgTempC !== null ? `${avgTempC.toFixed(1)}°C` : "—",
									},
									{
										icon: <CheckCircle2 className="h-4 w-4 text-green-400" />,
										label: "Rooms OK",
										sub: `of ${roomCount} rooms`,
										value: roomsOk,
									},
									{
										icon: <Flame className="h-4 w-4 text-orange-400" />,
										label: "Alerts",
										sub: `${roomsTooHot} too hot · ${roomsTooCold} too cold`,
										value: roomsTooHot + roomsTooCold,
									},
								] as const
							).map(({ label, value, sub, icon }) => (
								<div
									className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-[2px]"
									key={label}
								>
									<div className="mb-1 flex items-center gap-2 text-white/50 text-xs">
										{icon}
										{label}
									</div>
									<div className="font-semibold text-2xl text-white">
										{value}
									</div>
									<div className="mt-0.5 text-white/40 text-xs">{sub}</div>
								</div>
							))
						: null}
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
				<div className="flex flex-col items-center justify-center py-8 text-center sm:py-16">
					<Layers className="mb-4 text-gray-600" size={48} />
					<p className="font-semibold text-white">No devices discovered yet</p>
					<p className="mt-1 max-w-xs text-gray-400 text-sm">
						The polling worker will surface devices as they respond on the LAN.
					</p>
				</div>
			)}

			{/* Filter bar + device list (data present, not zero-devices) */}
			{!isLoading && !error && data && !isZeroDevices && (
				<div className="flex gap-6">
					{/* Sidebar — desktop only */}
					<aside className="hidden sm:block">
						<RoomSidebar
							activeRoomId={roomFilter || null}
							onSelect={(id) => setRoomFilter(id ?? "")}
							rooms={data.rooms.map((r) => ({
								badge: r.badge,
								roomId: r.roomId,
								roomName: r.roomName,
							}))}
						/>
					</aside>

					{/* Main content */}
					<div className="flex min-w-0 flex-1 flex-col gap-8">
						<FilterBar
							activeFilterCount={activeFilterCount}
							filters={{
								roomId: roomFilter,
								search: nameSearch,
								status: statusFilter,
								type: typeFilter,
							}}
							hideRoomFilter
							onClear={clearFilters}
							onRoomChange={setRoomFilter}
							onSearchChange={setNameSearch}
							onStatusChange={setStatusFilter}
							onTypeChange={setTypeFilter}
							rooms={rooms}
						/>

						{isFilteredEmpty ? (
							<div className="flex flex-col items-center justify-center py-8 text-center sm:py-16">
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
								{activeSiteId === "all"
									? groupBySite(filteredRooms).map(([siteName, siteRooms]) => (
											<SiteSection key={siteName} siteName={siteName}>
												{siteRooms.map((room) => (
													<RoomGroup
														anomaly={room.anomaly}
														badge={room.badge}
														devices={room.devices}
														key={room.roomId}
														primarySensorId={
															room.devices.find(
																(d) => d.deviceType === "sensor" && d.isOnline,
															)?.tuyaDeviceId ??
															room.devices.find(
																(d) => d.deviceType === "sensor",
															)?.tuyaDeviceId ??
															null
														}
														roomName={room.roomName}
														suggestion={room.suggestion}
													/>
												))}
											</SiteSection>
										))
									: filteredRooms.map((room) => (
											<RoomGroup
												anomaly={room.anomaly}
												badge={room.badge}
												devices={room.devices}
												key={room.roomId}
												primarySensorId={
													room.devices.find(
														(d) => d.deviceType === "sensor" && d.isOnline,
													)?.id ??
													room.devices.find((d) => d.deviceType === "sensor")
														?.id ??
													null
												}
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
				</div>
			)}
		</div>
	);
}
