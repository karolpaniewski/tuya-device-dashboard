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
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	CheckCircle2,
	Flame,
	Layers,
	Search,
	Thermometer,
	Timer,
	Wifi,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSiteContext } from "~/components/site-context";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Skeleton } from "~/components/ui/skeleton";
import {
	DEFAULT_WIDGET_ORDER,
	mergeMissingDefaultIds,
} from "~/lib/dashboard-widgets";
import { applySavedOrder, spliceSectionOrder } from "~/lib/layout-order";
import { DEFAULT_THRESHOLDS } from "~/server/lib/scoring";
import { api, type RouterOutputs } from "~/trpc/react";
import { CcAlertToast } from "./cc-alert-toast";
import { CcClimateOverview } from "./cc-climate-overview";
import { CcDevicesByRoom } from "./cc-devices-by-room";
import { CcKpiCard } from "./cc-kpi-card";
import { CcModesWidget } from "./cc-modes-widget";
import { DeviceCard } from "./device-card";
import { DeviceModal } from "./device-modal";
import { FilterBar, type FilterState } from "./filter-bar";
import { RoomGroup } from "./room-group";
import { RoomSidebar } from "./room-sidebar";
import { SortableRoomGroup } from "./sortable-room-group";
import { SortableWidget } from "./sortable-widget";

type RoomItem = RouterOutputs["device"]["overview"]["rooms"][number];

const CC_KPI_BIG_NUM =
	"cc-kpi-value font-bold text-[#f4f7fa] text-[38px] leading-none tracking-[-0.03em]";
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
	const layoutQuery = api.dashboardLayout.get.useQuery();
	const modeListQuery = api.mode.list.useQuery({ siteId: activeSiteId });
	const defaultThresholdsQuery = api.settings.getDefaultThresholds.useQuery();
	// Keep the static constant as the value until the query resolves, to
	// avoid a layout flash on the gauge below.
	const effectiveThresholds = defaultThresholdsQuery.data ?? DEFAULT_THRESHOLDS;

	const [roomFilter, setRoomFilter] = useState("");
	const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
	const [typeFilter, setTypeFilter] = useState<FilterState["type"]>("");
	const [statusFilter, setStatusFilter] = useState<FilterState["status"]>("");
	const [nameSearch, setNameSearch] = useState("");

	// DnD local state — mirrors server data, updated optimistically on drag
	const [activeId, setActiveId] = useState<string | null>(null);
	const [localRooms, setLocalRooms] = useState<RoomItem[]>([]);
	const [localUnassigned, setLocalUnassigned] = useState<DeviceItem[]>([]);

	// Widget layout local state — mirrors the saved dashboard_layout row
	const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
	const [widgetOrder, setWidgetOrder] = useState<string[]>([
		...DEFAULT_WIDGET_ORDER,
	]);
	const [hiddenWidgets, setHiddenWidgets] = useState<string[]>([]);
	const [roomOrder, setRoomOrder] = useState<string[]>([]);

	// Sync local DnD state from server (skip during active drag)
	useEffect(() => {
		if (activeId !== null) return;
		if (!data) return;
		setLocalRooms(data.rooms);
		setLocalUnassigned(data.unassigned);
	}, [data, activeId]);

	// Sync local widget-layout state from server (skip during an active widget
	// drag, or an active room drag — `activeId` covers both device and room
	// drags since they share one DndContext; pausing here for either avoids a
	// layout refetch clobbering an in-progress room reorder).
	useEffect(() => {
		if (activeWidgetId !== null || activeId !== null) return;
		if (!layoutQuery.data) return;
		setWidgetOrder(mergeMissingDefaultIds(layoutQuery.data.widgetOrder));
		setHiddenWidgets(layoutQuery.data.hiddenWidgets);
		setRoomOrder(layoutQuery.data.roomOrder);
	}, [layoutQuery.data, activeWidgetId, activeId]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);
	const widgetSensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);

	const reorderMutation = api.device.reorder.useMutation({
		onError: () => void utils.device.overview.invalidate(),
	});
	const moveMutation = api.device.move.useMutation({
		onError: () => void utils.device.overview.invalidate(),
		onSuccess: () => void utils.device.overview.invalidate(),
	});
	const toggleHeatMutation = api.room.toggleHeat.useMutation({
		onSuccess: (data) => {
			void utils.device.overview.invalidate();
			if (data.deviceErrors.length > 0) {
				toast.error(
					`${data.deviceErrors.length} device(s) failed to respond — pin still applied`,
				);
			}
		},
	});
	// Pending layout save — at most one `dashboardLayout.save` request is ever
	// in flight; a newer call supersedes an older one still in flight instead
	// of racing it, so two requests can never resolve in an order that lets a
	// stale payload overwrite a newer one.
	const pendingLayoutSaveRef = useRef<{
		hiddenWidgets: string[];
		roomOrder: string[];
		widgetOrder: string[];
	} | null>(null);
	const layoutSaveInFlightRef = useRef(false);
	const saveLayoutMutation = api.dashboardLayout.save.useMutation({
		onError: () => void utils.dashboardLayout.get.invalidate(),
		onMutate: () => void utils.dashboardLayout.get.cancel(),
		onSettled: () => {
			const next = pendingLayoutSaveRef.current;
			if (!next) {
				layoutSaveInFlightRef.current = false;
				return;
			}
			pendingLayoutSaveRef.current = null;
			saveLayoutMutation.mutate(next);
		},
		onSuccess: () => void utils.dashboardLayout.get.invalidate(),
	});
	function persistLayout(next: {
		hiddenWidgets: string[];
		roomOrder: string[];
		widgetOrder: string[];
	}) {
		utils.dashboardLayout.get.setData(undefined, next);
		if (layoutSaveInFlightRef.current) {
			pendingLayoutSaveRef.current = next;
			return;
		}
		layoutSaveInFlightRef.current = true;
		saveLayoutMutation.mutate(next);
	}

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

	function handleRoomReorder(activeRoomId: string, overRoomId: string) {
		const sections =
			activeSiteId === "all"
				? groupBySite(orderedRooms).map(([, siteRooms]) =>
						siteRooms.map((r) => r.roomId),
					)
				: [orderedRooms.map((r) => r.roomId)];

		const section = sections.find((ids) => ids.includes(activeRoomId));
		if (!section) return;

		const oldIdx = section.indexOf(activeRoomId);
		const newIdx = section.indexOf(overRoomId);
		if (oldIdx === -1 || newIdx === -1) return;

		const newSectionOrder = arrayMove(section, oldIdx, newIdx);

		const knownIds = localRooms.map((r) => r.roomId);
		const newIds = knownIds.filter((id) => !roomOrder.includes(id));
		const fullOrder = [...roomOrder, ...newIds];
		const newRoomOrder = spliceSectionOrder(
			fullOrder,
			section,
			newSectionOrder,
		);

		setRoomOrder(newRoomOrder);
		persistLayout({ hiddenWidgets, roomOrder: newRoomOrder, widgetOrder });
	}

	function handleDragEnd({ active, over }: DragEndEvent) {
		setActiveId(null);
		if (!over) return;

		const activeDeviceId = String(active.id);
		const overId = String(over.id);
		if (activeDeviceId === overId) return;

		if (orderedRooms.some((r) => r.roomId === activeDeviceId)) {
			// `over` may resolve to a device card nested inside a room (closestCorners
			// considers every sortable in the shared context) — resolve back to the
			// room that device belongs to.
			const overRoomId = orderedRooms.some((r) => r.roomId === overId)
				? overId
				: findContainer(overId);
			if (overRoomId) handleRoomReorder(activeDeviceId, overRoomId);
			return;
		}

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

	function handleWidgetDragStart({ active }: DragStartEvent) {
		setActiveWidgetId(String(active.id));
	}

	function handleWidgetDragEnd({ active, over }: DragEndEvent) {
		setActiveWidgetId(null);
		if (!over) return;

		const activeWidgetIdStr = String(active.id);
		const overWidgetId = String(over.id);
		if (activeWidgetIdStr === overWidgetId) return;

		const oldIdx = visibleWidgets.findIndex((w) => w.id === activeWidgetIdStr);
		const newIdx = visibleWidgets.findIndex((w) => w.id === overWidgetId);
		if (oldIdx === -1 || newIdx === -1) return;

		const newOrder = arrayMove(visibleWidgets, oldIdx, newIdx).map((w) => w.id);
		setWidgetOrder(newOrder);
		persistLayout({ hiddenWidgets, roomOrder, widgetOrder: newOrder });
	}

	function handleHideWidget(id: string) {
		const newOrder = widgetOrder.filter((wid) => wid !== id);
		const newHidden = [...hiddenWidgets, id];
		setWidgetOrder(newOrder);
		setHiddenWidgets(newHidden);
		persistLayout({
			hiddenWidgets: newHidden,
			roomOrder,
			widgetOrder: newOrder,
		});
	}

	function handleRestoreWidget(id: string) {
		const newOrder = [...widgetOrder, id];
		const newHidden = hiddenWidgets.filter((wid) => wid !== id);
		setWidgetOrder(newOrder);
		setHiddenWidgets(newHidden);
		persistLayout({
			hiddenWidgets: newHidden,
			roomOrder,
			widgetOrder: newOrder,
		});
	}

	function handleResetLayout() {
		const defaults = [...DEFAULT_WIDGET_ORDER];
		setWidgetOrder(defaults);
		setHiddenWidgets([]);
		persistLayout({ hiddenWidgets: [], roomOrder, widgetOrder: defaults });
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
	const roomsWithReadingsCount =
		data?.rooms.filter((r) =>
			r.devices.some(
				(d) =>
					d.deviceType === "sensor" &&
					d.isOnline &&
					!d.isStale &&
					d.temperatureC !== null,
			),
		).length ?? 0;
	const alertingRooms =
		data?.rooms.filter(
			(r) => r.badge === "Too Hot" || r.badge === "Too Cold",
		) ?? [];
	const hasActiveAlerts = alertingRooms.length > 0;
	const allRoomsHealthy = roomCount > 0 && roomsOk === roomCount;
	const scheduledModesCount =
		modeListQuery.data?.filter((m) => m.daysOfWeek !== null).length ?? 0;
	const totalModesCount = modeListQuery.data?.length ?? 0;

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

	type WidgetDef = {
		className?: string;
		id: string;
		label: string;
		render: ReactNode;
	};

	const widgetDefinitions: WidgetDef[] = data
		? [
				{
					id: "kpi-devices",
					label: "Devices Online",
					render: (
						<CcKpiCard
							icon={
								<Wifi className="h-3.5 w-3.5" style={{ color: "#5d6876" }} />
							}
							label="Devices Online"
							sub={`${offlineCount} offline`}
							value={
								<>
									<span className={CC_KPI_BIG_NUM}>{onlineCount}</span>
									<span className="font-mono text-[#5d6876] text-[14px]">
										/ {totalDevices}
									</span>
								</>
							}
						/>
					),
				},
				{
					id: "kpi-avg-temp",
					label: "Avg Temperature",
					render: (
						<CcKpiCard
							icon={
								<Thermometer
									className="h-3.5 w-3.5"
									style={{ color: "#5d6876" }}
								/>
							}
							label="Avg Temperature"
							sub={
								avgTempC !== null
									? `across ${roomsWithReadingsCount} active room${roomsWithReadingsCount === 1 ? "" : "s"}`
									: "no live sensor data"
							}
							value={
								avgTempC !== null ? (
									<>
										<span className={CC_KPI_BIG_NUM}>
											{avgTempC.toFixed(1)}
										</span>
										<span className="font-semibold text-[#8b96a3] text-[20px]">
											°C
										</span>
									</>
								) : (
									<span className={CC_KPI_BIG_NUM}>—</span>
								)
							}
						>
							{avgTempC !== null && (
								<div className="mt-3.5 flex items-center gap-2">
									<span className="font-mono text-[#5d6876] text-[10px]">
										{effectiveThresholds.minTempC}°
									</span>
									<div className="relative h-[5px] flex-1 rounded-[3px] bg-white/[0.07]">
										<div
											className="absolute h-full rounded-[3px]"
											style={{
												background:
													"linear-gradient(90deg, var(--cc-emerald), var(--cc-cyan))",
												left: 0,
												width: `${Math.min(100, Math.max(0, ((avgTempC - effectiveThresholds.minTempC) / (effectiveThresholds.maxTempC - effectiveThresholds.minTempC)) * 100))}%`,
											}}
										/>
										<div
											className="absolute top-1/2 h-[11px] w-[11px] rounded-full"
											style={{
												backgroundColor: "var(--cc-cyan)",
												boxShadow: "0 0 10px var(--cc-cyan)",
												left: `${Math.min(100, Math.max(0, ((avgTempC - effectiveThresholds.minTempC) / (effectiveThresholds.maxTempC - effectiveThresholds.minTempC)) * 100))}%`,
												transform: "translate(-50%, -50%)",
											}}
										/>
									</div>
									<span className="font-mono text-[#5d6876] text-[10px]">
										{effectiveThresholds.maxTempC}°
									</span>
								</div>
							)}
						</CcKpiCard>
					),
				},
				{
					id: "kpi-alerts",
					label: "Active Alerts",
					render: (
						<CcKpiCard
							icon={
								<Flame
									className="h-3.5 w-3.5"
									style={{
										color: hasActiveAlerts ? "var(--cc-rose)" : "#5d6876",
									}}
								/>
							}
							label="Active Alerts"
							sub={
								hasActiveAlerts
									? alertingRooms.map((r) => r.roomName).join(", ")
									: "All rooms within range"
							}
							tone={hasActiveAlerts ? "alert" : "default"}
							value={
								<span
									className={
										hasActiveAlerts
											? `${CC_KPI_BIG_NUM} text-[var(--cc-rose)]`
											: CC_KPI_BIG_NUM
									}
								>
									{roomsTooHot + roomsTooCold}
								</span>
							}
						>
							{hasActiveAlerts && (
								<button
									className="mt-3.5 inline-flex rounded-[8px] px-[11px] py-[6px] font-semibold text-[11px]"
									onClick={() =>
										document
											.getElementById("cc-devices-section")
											?.scrollIntoView({ behavior: "smooth", block: "start" })
									}
									style={{
										backgroundColor: "rgba(251, 113, 133, 0.12)",
										border: "1px solid rgba(251, 113, 133, 0.3)",
										color: "var(--cc-rose)",
									}}
									type="button"
								>
									Review →
								</button>
							)}
						</CcKpiCard>
					),
				},
				{
					id: "kpi-rooms-ok",
					label: "Rooms Healthy",
					render: (
						<CcKpiCard
							icon={
								<CheckCircle2
									className="h-3.5 w-3.5"
									style={{
										color: allRoomsHealthy ? "var(--cc-emerald)" : "#5d6876",
									}}
								/>
							}
							label="Rooms Healthy"
							sub={
								roomCount === 0
									? "no rooms yet"
									: allRoomsHealthy
										? "all within target range"
										: hasActiveAlerts
											? `${alertingRooms.length} room${alertingRooms.length === 1 ? "" : "s"} need attention`
											: "awaiting sensor data"
							}
							tone={allRoomsHealthy ? "healthy" : "default"}
							value={
								<>
									<span className={CC_KPI_BIG_NUM}>{roomsOk}</span>
									<span className="font-mono text-[#5d6876] text-[14px]">
										/ {roomCount}
									</span>
								</>
							}
						>
							{roomCount > 0 && (
								<div className="mt-3.5 flex gap-[5px]">
									{data.rooms.map((r) => {
										const segmentColor =
											r.badge === "Too Hot"
												? "var(--cc-amber)"
												: r.badge === "Too Cold"
													? "var(--cc-cyan)"
													: r.badge === "OK"
														? "var(--cc-emerald)"
														: "#3a4350";
										return (
											<div
												className="h-1.5 flex-1 rounded-[3px]"
												key={r.roomId}
												style={{
													backgroundColor: segmentColor,
													boxShadow: `0 0 8px ${segmentColor}`,
												}}
											/>
										);
									})}
								</div>
							)}
						</CcKpiCard>
					),
				},
				{
					id: "kpi-modes",
					label: "Active Modes",
					render: (
						<CcKpiCard
							icon={
								<Timer className="h-3.5 w-3.5" style={{ color: "#5d6876" }} />
							}
							label="Active Modes"
							sub={`of ${totalModesCount} mode${totalModesCount === 1 ? "" : "s"}`}
							value={
								<span className={CC_KPI_BIG_NUM}>{scheduledModesCount}</span>
							}
						/>
					),
				},
			]
		: [];

	const nonHiddenWidgetDefs = widgetDefinitions.filter(
		(w) => !hiddenWidgets.includes(w.id),
	);
	const visibleWidgets = applySavedOrder(
		nonHiddenWidgetDefs,
		widgetOrder,
		(w) => w.id,
	);
	const hiddenWidgetDefs = widgetDefinitions.filter((w) =>
		hiddenWidgets.includes(w.id),
	);
	const activeWidgetDef = activeWidgetId
		? (widgetDefinitions.find((w) => w.id === activeWidgetId) ?? null)
		: null;

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

	const orderedRooms = applySavedOrder(
		filteredRooms,
		roomOrder,
		(r) => r.roomId,
	);

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
	const activeRoomBeingDragged = activeId
		? orderedRooms.find((r) => r.roomId === activeId)
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
		<div className="flex flex-col gap-6">
			{data && <CcAlertToast rooms={data.rooms} />}
			{/* Summary widgets */}
			{isLoading ? (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							className="rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] p-4 shadow-[var(--s-shadow)]"
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
							key={i}
						>
							<Skeleton className="mb-2 h-3 w-16" />
							<Skeleton className="mb-1 h-7 w-12" />
							<Skeleton className="h-3 w-24" />
						</div>
					))}
				</div>
			) : data ? (
				<div className="flex flex-col gap-3">
					<DndContext
						collisionDetection={closestCorners}
						onDragEnd={handleWidgetDragEnd}
						onDragStart={handleWidgetDragStart}
						sensors={widgetSensors}
					>
						<div className="cc-kpi-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
							<SortableContext
								items={visibleWidgets.map((w) => w.id)}
								strategy={rectSortingStrategy}
							>
								{visibleWidgets.map((widget) => (
									<SortableWidget
										className={widget.className}
										id={widget.id}
										key={widget.id}
										onHide={() => handleHideWidget(widget.id)}
									>
										{widget.render}
									</SortableWidget>
								))}
							</SortableContext>
						</div>
						<DragOverlay>
							{activeWidgetDef ? (
								<div className="rotate-1 opacity-90 shadow-2xl">
									{activeWidgetDef.render}
								</div>
							) : null}
						</DragOverlay>
					</DndContext>

					<div className="flex flex-wrap items-center gap-2 text-xs">
						{hiddenWidgetDefs.length > 0 && (
							<>
								<span className="text-[var(--s-text-dim)]">
									{hiddenWidgetDefs.length} hidden:
								</span>
								{hiddenWidgetDefs.map((widget) => (
									<button
										className="rounded-full border border-[var(--s-border)] px-2 py-1 text-[var(--s-text-muted)] hover:bg-[var(--s-bg-dnd)] hover:text-foreground"
										key={widget.id}
										onClick={() => handleRestoreWidget(widget.id)}
										type="button"
									>
										{widget.label}
									</button>
								))}
							</>
						)}
						<Button
							className="ml-auto"
							onClick={handleResetLayout}
							size="sm"
							type="button"
							variant="ghost"
						>
							Reset layout
						</Button>
					</div>

					<div className="grid grid-cols-1 gap-[14px] md:grid-cols-[1.95fr_1fr]">
						<CcClimateOverview />
						<div className="flex flex-col gap-[14px]">
							<CcDevicesByRoom roomDeviceCounts={roomDeviceCounts} />
							<CcModesWidget siteId={activeSiteId} />
						</div>
					</div>
				</div>
			) : null}

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
					<Layers className="mb-4 text-[var(--s-text-dim)]" size={48} />
					<p className="font-semibold text-foreground">
						No devices discovered yet
					</p>
					<p className="mt-1 max-w-xs text-[var(--s-text-muted)] text-sm">
						The polling worker will surface devices as they respond on the LAN.
					</p>
				</div>
			)}

			{/* Filter bar + device list (data present, not zero-devices) */}
			{!isLoading && !error && data && !isZeroDevices && (
				<div className="flex gap-6" id="cc-devices-section">
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
					<div className="cc-rooms-list flex min-w-0 flex-1 flex-col gap-6">
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
								<Search className="mb-4 text-[var(--s-text-dim)]" size={48} />
								<p className="font-semibold text-foreground">
									No devices match your filters
								</p>
								<p className="mt-1 max-w-xs text-[var(--s-text-muted)] text-sm">
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
								{activeSiteId === "all" ? (
									groupBySite(orderedRooms).map(([siteName, siteRooms]) => (
										<SiteSection key={siteName} siteName={siteName}>
											<SortableContext
												items={siteRooms.map((r) => r.roomId)}
												strategy={verticalListSortingStrategy}
											>
												{siteRooms.map((room) => (
													<SortableRoomGroup
														key={room.roomId}
														roomId={room.roomId}
													>
														<RoomGroup
															alertSent={room.alertSent}
															anomaly={room.anomaly}
															badge={room.badge}
															devices={room.devices}
															dndEnabled={dndEnabled}
															isToggleHeatPending={toggleHeatMutation.isPending}
															onDeviceClick={setSelectedDevice}
															onToggleHeat={(pinnedOff) =>
																toggleHeatMutation.mutate({
																	roomId: room.roomId,
																	pinnedOff,
																})
															}
															pinnedOff={room.pinnedOff}
															primarySensorId={
																room.devices.find(
																	(d) =>
																		d.deviceType === "sensor" && d.isOnline,
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
													</SortableRoomGroup>
												))}
											</SortableContext>
										</SiteSection>
									))
								) : (
									<SortableContext
										items={orderedRooms.map((r) => r.roomId)}
										strategy={verticalListSortingStrategy}
									>
										{orderedRooms.map((room) => (
											<SortableRoomGroup key={room.roomId} roomId={room.roomId}>
												<RoomGroup
													alertSent={room.alertSent}
													anomaly={room.anomaly}
													badge={room.badge}
													devices={room.devices}
													dndEnabled={dndEnabled}
													isToggleHeatPending={toggleHeatMutation.isPending}
													onDeviceClick={setSelectedDevice}
													onToggleHeat={(pinnedOff) =>
														toggleHeatMutation.mutate({
															roomId: room.roomId,
															pinnedOff,
														})
													}
													pinnedOff={room.pinnedOff}
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
											</SortableRoomGroup>
										))}
									</SortableContext>
								)}
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
									) : activeRoomBeingDragged ? (
										<div className="rotate-1 rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] px-4 py-2 font-semibold text-foreground opacity-90 shadow-2xl">
											{activeRoomBeingDragged.roomName}
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
