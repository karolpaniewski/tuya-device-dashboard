"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useSiteContext } from "~/components/site-context";
import { ErrorMessage } from "~/components/ui/error-message";
import { Skeleton } from "~/components/ui/skeleton";
import { dropPositionToPercent } from "~/lib/map-coordinates";
import { ROOM_STATUS_BADGE_CLASSES } from "~/lib/room-status-colors";
import { cn } from "~/lib/utils";
import type { RoomBadge } from "~/server/api/routers/device";
import { api, type RouterOutputs } from "~/trpc/react";
import { DeviceModal } from "../device-modal";

type RoomItem = RouterOutputs["device"]["overview"]["rooms"][number];
type DeviceItem = RoomItem["devices"][number];

const UNPLACED_BADGE_CLASS = "bg-slate-600 text-slate-100";

function nodeColorClass(badge: RoomBadge | null | undefined): string {
	return badge ? ROOM_STATUS_BADGE_CLASSES[badge] : UNPLACED_BADGE_CLASS;
}

export function MapView() {
	const { activeSiteId } = useSiteContext();
	const utils = api.useUtils();
	const sitesQuery = api.site.list.useQuery();
	const devicesQuery = api.device.overview.useQuery({ siteId: activeSiteId });
	const roomsQuery = api.room.list.useQuery({ siteId: activeSiteId });

	const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null);
	const [imageFailed, setImageFailed] = useState(false);
	const imageContainerRef = useRef<HTMLDivElement>(null);

	const setMapPosition = api.device.setMapPosition.useMutation({
		onSuccess: () => void utils.device.overview.invalidate(),
		onError: (e) => toast.error(e.message),
	});
	const clearMapPosition = api.device.clearMapPosition.useMutation({
		onSuccess: () => void utils.device.overview.invalidate(),
		onError: (e) => toast.error(e.message),
	});

	if (sitesQuery.isLoading || devicesQuery.isLoading || roomsQuery.isLoading) {
		return <Skeleton className="h-[60vh] rounded-[20px]" />;
	}

	if (sitesQuery.error ?? devicesQuery.error ?? roomsQuery.error) {
		return <ErrorMessage message="Failed to load data." variant="inline" />;
	}

	if (activeSiteId === "all") {
		return (
			<p className="text-sm" style={{ color: "var(--cc-text-muted)" }}>
				Select a specific site to view its floor plan.
			</p>
		);
	}

	const activeSite = (sitesQuery.data ?? []).find((s) => s.id === activeSiteId);
	const data = devicesQuery.data ?? { rooms: [], unassigned: [] };
	const rooms = roomsQuery.data ?? [];

	const badgeByDeviceId = new Map<string, RoomBadge | null>();
	for (const room of data.rooms) {
		for (const device of room.devices) {
			badgeByDeviceId.set(device.id, room.badge);
		}
	}

	const allDevices: DeviceItem[] = [
		...data.rooms.flatMap((r) => r.devices),
		...data.unassigned,
	];
	const placedDevices = allDevices.filter(
		(d) => d.mapXPct !== null && d.mapYPct !== null,
	);
	const rosterDevices = allDevices.filter(
		(d) => d.mapXPct === null || d.mapYPct === null,
	);

	function handleDragStart(e: React.DragEvent<HTMLElement>, deviceId: string) {
		e.dataTransfer.setData("text/plain", deviceId);
	}

	function handleDrop(e: React.DragEvent<HTMLDivElement>) {
		e.preventDefault();
		const deviceId = e.dataTransfer.getData("text/plain");
		if (!deviceId || !imageContainerRef.current) return;
		const rect = imageContainerRef.current.getBoundingClientRect();
		const { xPct, yPct } = dropPositionToPercent(e.clientX, e.clientY, rect);
		setMapPosition.mutate({ deviceId, xPct, yPct });
	}

	return (
		<div className="flex gap-4">
			<div className="min-w-0 flex-1">
				{!activeSite?.floorPlanImagePath ? (
					<div
						className="flex h-[60vh] flex-col items-center justify-center gap-2 rounded-[20px] border text-center"
						style={{
							background: "var(--cc-glass-bg)",
							borderColor: "var(--cc-glass-border)",
						}}
					>
						<p className="font-semibold text-foreground">
							No floor plan uploaded
						</p>
						<p className="text-sm" style={{ color: "var(--cc-text-muted)" }}>
							Upload one for this site in{" "}
							<Link className="underline" href="/setup">
								Settings
							</Link>
							.
						</p>
					</div>
				) : imageFailed ? (
					<div
						className="flex h-[60vh] flex-col items-center justify-center gap-2 rounded-[20px] border text-center"
						style={{
							background: "var(--cc-glass-bg)",
							borderColor: "var(--cc-glass-border)",
						}}
					>
						<p className="font-semibold text-foreground">
							Floor plan failed to load
						</p>
						<p className="text-sm" style={{ color: "var(--cc-text-muted)" }}>
							Use the{" "}
							<Link className="underline" href="/">
								Dashboard list view
							</Link>{" "}
							to control your devices.
						</p>
					</div>
				) : (
					// biome-ignore lint/a11y/noStaticElementInteractions: HTML5 drag-and-drop drop zone; no keyboard equivalent for free-form positioning (desktop-only feature, see plan's Non-Goals)
					<div
						className="relative overflow-hidden rounded-[20px] border"
						onDragOver={(e) => e.preventDefault()}
						onDrop={handleDrop}
						ref={imageContainerRef}
						style={{
							background: "var(--cc-glass-bg)",
							borderColor: "var(--cc-glass-border)",
						}}
					>
						{/** biome-ignore lint/performance/noImgElement: needs onError + getBoundingClientRect, which next/image doesn't support */}
						<img
							alt={`${activeSite.name} floor plan`}
							className="block w-full"
							onError={() => setImageFailed(true)}
							src={activeSite.floorPlanImagePath}
						/>
						{placedDevices.map((device) => (
							// biome-ignore lint/a11y/noStaticElementInteractions: drag handle only; the clickable surface below is a real <button>
							<div
								className="absolute -translate-x-1/2 -translate-y-1/2"
								draggable
								key={device.id}
								onDragStart={(e) => handleDragStart(e, device.id)}
								style={{
									left: `${device.mapXPct}%`,
									top: `${device.mapYPct}%`,
								}}
							>
								<button
									className={cn(
										"flex items-center gap-1 rounded-full px-2 py-1 text-xs shadow-lg",
										nodeColorClass(badgeByDeviceId.get(device.id)),
									)}
									onClick={() => setSelectedDevice(device)}
									type="button"
								>
									<span className="max-w-[120px] truncate">{device.name}</span>
								</button>
								<button
									aria-label={`Remove ${device.name} from map`}
									className="absolute -top-1.5 -right-1.5 rounded-full bg-black/40 p-0.5 hover:bg-black/60"
									onClick={() =>
										clearMapPosition.mutate({ deviceId: device.id })
									}
									type="button"
								>
									<X size={12} />
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			<aside
				className="w-64 flex-none rounded-[20px] border p-4"
				style={{
					background: "var(--cc-glass-bg)",
					borderColor: "var(--cc-glass-border)",
				}}
			>
				<h2 className="mb-3 font-semibold text-foreground text-sm">
					Unplaced devices
				</h2>
				<ul className="flex flex-col gap-2">
					{rosterDevices.map((device) => (
						<li
							className="cursor-grab rounded-lg border px-3 py-2 text-sm active:cursor-grabbing"
							draggable
							key={device.id}
							onDragStart={(e) => handleDragStart(e, device.id)}
							style={{
								background: "rgba(255, 255, 255, 0.04)",
								borderColor: "var(--cc-glass-border)",
								color: "var(--cc-text-secondary)",
							}}
						>
							{device.name}
						</li>
					))}
					{rosterDevices.length === 0 && (
						<li className="text-sm" style={{ color: "var(--cc-text-muted)" }}>
							All devices are placed.
						</li>
					)}
				</ul>
			</aside>

			{selectedDevice && (
				<DeviceModal
					device={selectedDevice}
					onClose={() => setSelectedDevice(null)}
					rooms={rooms}
					utils={utils}
				/>
			)}
		</div>
	);
}
