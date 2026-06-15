"use client";

import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
	CheckCircle2,
	Flame,
	Layers,
	Search,
	Thermometer,
	Wifi,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useSiteContext } from "~/components/site-context";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Skeleton } from "~/components/ui/skeleton";
import { api, type RouterOutputs } from "~/trpc/react";
import { DeviceCard } from "./device-card";
import { DeviceModal } from "./device-modal";
import { FilterBar, type FilterState } from "./filter-bar";
import { RoomGroup } from "./room-group";
import { RoomSidebar } from "./room-sidebar";
import { RoomTemperaturePanel } from "./room-temperature-panel";

type RoomItem = RouterOutputs["device"]["overview"]["rooms"][number];

const CHART_COLORS = [
	"var(--color-chart-1)",
	"var(--color-chart-2)",
	"var(--color-chart-3)",
	"var(--color-chart-4)",
	"var(--color-chart-5)",
];
type DeviceItem = RoomItem["devices"][number];

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
			<h2 className="font-bold text-foreground text-lg">{siteName}</h2>
			{children}
		</section>
	);
}

export function DeviceOverview() {
	const { activeSiteId } = useSiteContext();
	const utils = api.useUtils();
	const { data, isLoading, error } = api.device.overview.useQuery(
		{ siteId: activeSiteId },
		{ refetchInterval: 30_000, refetchIntervalInBackground: false },
	);
	const roomsListQuery = api.room.list.useQuery({ siteId: activeSiteId });

	const [roomFilter, setRoomFilter] = useState("");
	const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
	const [typeFilter, setTypeFilter] = useState<FilterState["type"]>("");
	const [statusFilter, setStatusFilter] = useState<FilterState["status"]>("");
	const [nameSearch, setNameSearch] = useState("");

	// DnD local state — mirrors server data, updated optimistically on drag
	const [activeId, setActiveId] = useState<string | null>(null);
	const [localRooms, setLocalRooms] = useState<RoomItem[]>([]);
	const [localUnassigned, setLocalUnassigned] = useState<DeviceItem[]>([]);

	// Sync local DnD state from server (skip during active drag)
	useEffect(() => {
		if (activeId !== null) return;
		if (!data) return;
		setLocalRooms(data.rooms);
		setLocalUnassigned(data.unassigned);
	}, [data, activeId]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);

	const reorderMutation = api.device.reorder.useMutation({
		onError: () => void utils.device.overview.invalidate(),
	});
	const moveMutation = api.device.move.useMutation({
		onError: () => void utils.device.overview.invalidate(),
		onSuccess: () => void utils.device.overview.invalidate(),
	});

	function findContainer(deviceId: string): string | null {
		for (const room of localRooms) {
			if (room.devices.some((d) => d.id === deviceId)) return room.roomId;
		}
		if (localUnassigned.some((d) => d.id === deviceId)) return "unassigned";
		return null;
	}

	function handleDragStart({ active }: DragStartEvent) {
		setActiveId(String(active.id));
	}

	function handleDragEnd({ active, over }: DragEndEvent) {
		setActiveId(null);
		if (!over) return;

		const activeDeviceId = String(active.id);
		const overId = String(over.id);
		if (activeDeviceId === overId) return;

		const sourceContainer = findContainer(activeDeviceId);
		if (!sourceContainer) return;

		// Determine destination container: overId may be a room/container ID or a device ID
		let destContainer =
			overId === "unassigned" || localRooms.some((r) => r.roomId === overId)
				? overId
				: findContainer(overId);
		if (!destContainer) destContainer = sourceContainer;

		if (sourceContainer === destContainer) {
			// Same-container reorder
			const isUnassigned = sourceContainer === "unassigned";
			const items = isUnassigned
				? localUnassigned
				: (localRooms.find((r) => r.roomId === sourceContainer)?.devices ?? []);
			const oldIdx = items.findIndex((d) => d.id === activeDeviceId);
			const newIdx = items.findIndex((d) => d.id === overId);
			if (oldIdx === -1 || newIdx === -1) return;

			const reordered = arrayMove(items, oldIdx, newIdx).map((d, i) => ({
				...d,
				sortOrder: i,
			}));
			if (isUnassigned) {
				setLocalUnassigned(reordered);
			} else {
				setLocalRooms((prev) =>
					prev.map((r) =>
						r.roomId === sourceContainer ? { ...r, devices: reordered } : r,
					),
				);
			}
			reorderMutation.mutate({
				siteId: activeSiteId,
				items: reordered.map((d) => ({ id: d.id, sortOrder: d.sortOrder })),
			});
		} else {
			// Cross-container move
			const srcItems =
				sourceContainer === "unassigned"
					? localUnassigned
					: (localRooms.find((r) => r.roomId === sourceContainer)?.devices ??
						[]);
			const activeDevice = srcItems.find((d) => d.id === activeDeviceId);
			if (!activeDevice) return;

			const destIsUnassigned = destContainer === "unassigned";
			const destItems = destIsUnassigned
				? localUnassigned
				: (localRooms.find((r) => r.roomId === destContainer)?.devices ?? []);
			const insertIdx = Math.max(
				0,
				destItems.findIndex((d) => d.id === overId),
			);

			const newSrcItems = srcItems
				.filter((d) => d.id !== activeDeviceId)
				.map((d, i) => ({ ...d, sortOrder: i }));
			const newDestItems = [
				...destItems.slice(0, insertIdx),
				{ ...activeDevice, roomId: destIsUnassigned ? null : destContainer },
				...destItems.slice(insertIdx),
			].map((d, i) => ({ ...d, sortOrder: i }));

			if (sourceContainer === "unassigned") {
				setLocalUnassigned(newSrcItems);
			} else {
				setLocalRooms((prev) =>
					prev.map((r) =>
						r.roomId === sourceContainer ? { ...r, devices: newSrcItems } : r,
					),
				);
			}
			if (destIsUnassigned) {
				setLocalUnassigned(newDestItems);
			} else {
				setLocalRooms((prev) =>
					prev.map((r) =>
						r.roomId === destContainer ? { ...r, devices: newDestItems } : r,
					),
				);
			}

			moveMutation.mutate({
				deviceId: activeDeviceId,
				roomId: destIsUnassigned ? null : destContainer,
				siteId: activeSiteId,
				items: [...newSrcItems, ...newDestItems].map((d) => ({
					id: d.id,
					sortOrder: d.sortOrder,
				})),
			});
		}
	}

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

	const roomDeviceCounts =
		data?.rooms
			.map((r) => ({ name: r.roomName, count: r.devices.length }))
			.filter((r) => r.count > 0) ?? [];

	// Use localRooms/localUnassigned (DnD-aware) as base for filtering
	const filteredRooms = localRooms
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
		: localUnassigned.filter((d) =>
				matchDevice(d, typeFilter, statusFilter, nameSearch),
			);

	// DnD: find the active device for DragOverlay
	const allLocalDevices = [
		...localRooms.flatMap((r) => r.devices),
		...localUnassigned,
	];
	const activeDevice = activeId
		? allLocalDevices.find((d) => d.id === activeId)
		: null;
	const dndEnabled = activeFilterCount === 0;

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
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				{isLoading ? (
					Array.from({ length: 5 }).map((_, i) => (
						<div
							className="rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] p-4 shadow-[var(--s-shadow)]"
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
							key={i}
						>
							<Skeleton className="mb-2 h-3 w-16" />
							<Skeleton className="mb-1 h-7 w-12" />
							<Skeleton className="h-3 w-24" />
						</div>
					))
				) : data ? (
					<>
						{(
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
								className="rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] p-4 shadow-[var(--s-shadow)]"
								key={label}
							>
								<div className="mb-1 flex items-center gap-2 text-[var(--s-text-muted)] text-xs">
									{icon}
									{label}
								</div>
								<div className="font-semibold text-2xl text-foreground">
									{value}
								</div>
								<div className="mt-0.5 text-[var(--s-text-dim)] text-xs">
									{sub}
								</div>
							</div>
						))}
						{/* 5th KPI card — donut chart by room */}
						<div className="rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] p-4 shadow-[var(--s-shadow)]">
							<div className="mb-1 text-[var(--s-text-muted)] text-xs">
								By Room
							</div>
							{roomDeviceCounts.length > 0 ? (
								<ResponsiveContainer height={80} width="100%">
									<PieChart>
										<Pie
											cx="50%"
											cy="50%"
											data={roomDeviceCounts}
											dataKey="count"
											innerRadius={24}
											nameKey="name"
											outerRadius={36}
										>
											{roomDeviceCounts.map((_, i) => (
												<Cell
													// biome-ignore lint/suspicious/noArrayIndexKey: chart segment index
													key={i}
													style={{
														fill: CHART_COLORS[i % CHART_COLORS.length],
													}}
												/>
											))}
										</Pie>
										<Tooltip
											contentStyle={{
												background: "var(--popover)",
												border: "1px solid var(--border)",
												borderRadius: "8px",
												color: "var(--popover-foreground)",
												fontSize: 12,
											}}
											formatter={(val: unknown, name: unknown) => [
												`${val} devices`,
												String(name),
											]}
										/>
									</PieChart>
								</ResponsiveContainer>
							) : (
								<div className="flex h-20 items-center justify-center text-[var(--s-text-dim)] text-xs">
									No rooms
								</div>
							)}
						</div>
					</>
				) : null}
			</div>

			{/* Temperature Overview Panel */}
			{!isLoading && data && data.rooms.length > 0 && (
				<RoomTemperaturePanel rooms={data.rooms} />
			)}

			{/* Loading skeleton grid */}
			{isLoading && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							className="flex h-32 flex-col gap-3 rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] p-4 shadow-[var(--s-shadow)]"
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
					<p className="font-semibold text-foreground">
						No devices discovered yet
					</p>
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
								<p className="font-semibold text-foreground">
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
							<DndContext
								collisionDetection={closestCorners}
								onDragEnd={handleDragEnd}
								onDragStart={handleDragStart}
								sensors={sensors}
							>
								{activeSiteId === "all"
									? groupBySite(filteredRooms).map(([siteName, siteRooms]) => (
											<SiteSection key={siteName} siteName={siteName}>
												{siteRooms.map((room) => (
													<RoomGroup
														anomaly={room.anomaly}
														badge={room.badge}
														devices={room.devices}
														dndEnabled={dndEnabled}
														key={room.roomId}
														onDeviceClick={setSelectedDevice}
														primarySensorId={
															room.devices.find(
																(d) => d.deviceType === "sensor" && d.isOnline,
															)?.tuyaDeviceId ??
															room.devices.find(
																(d) => d.deviceType === "sensor",
															)?.tuyaDeviceId ??
															null
														}
														roomId={room.roomId}
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
												dndEnabled={dndEnabled}
												key={room.roomId}
												onDeviceClick={setSelectedDevice}
												primarySensorId={
													room.devices.find(
														(d) => d.deviceType === "sensor" && d.isOnline,
													)?.tuyaDeviceId ??
													room.devices.find((d) => d.deviceType === "sensor")
														?.tuyaDeviceId ??
													null
												}
												roomId={room.roomId}
												roomName={room.roomName}
												suggestion={room.suggestion}
											/>
										))}
								{filteredUnassigned.length > 0 && (
									<RoomGroup
										devices={filteredUnassigned}
										dndEnabled={dndEnabled}
										isUnassigned
										onDeviceClick={setSelectedDevice}
										roomId="unassigned"
										roomName="Unassigned"
									/>
								)}
								<DragOverlay>
									{activeDevice ? (
										<div className="rotate-1 opacity-90 shadow-2xl">
											<DeviceCard device={activeDevice} />
										</div>
									) : null}
								</DragOverlay>
							</DndContext>
						)}
					</div>
				</div>
			)}
			{selectedDevice && (
				<DeviceModal
					device={selectedDevice}
					onClose={() => setSelectedDevice(null)}
					rooms={roomsListQuery.data ?? []}
					utils={utils}
				/>
			)}
		</div>
	);
}
