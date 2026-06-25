"use client";

import { useDroppable } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { Flame, Mail } from "lucide-react";
import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { ROOM_STATUS_BADGE_CLASSES } from "~/lib/room-status-colors";
import { downsampleAverage } from "~/lib/sparkline-data";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { SortableDeviceCard } from "./sortable-device-card";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

const SPARKLINE_POINTS = 24;

function RoomSparkline({ deviceId }: { deviceId: string }) {
	const { data } = api.device.temperatureHistory.useQuery(
		{ tuyaDeviceId: deviceId, range: "24h" },
		{ staleTime: 60_000 },
	);
	const temps = (data ?? [])
		.map((r) => r.temperatureC)
		.filter((t): t is number => t !== null);
	if (temps.length < 2) return null;
	const smoothed = downsampleAverage(temps, SPARKLINE_POINTS);
	const chartData = smoothed.map((temperatureC, i) => ({ i, temperatureC }));
	return (
		<div className="mb-3 rounded-lg border border-[var(--s-border-spark)] bg-[var(--s-bg-spark)] px-2">
			<ResponsiveContainer height={56} width="100%">
				<LineChart
					data={chartData}
					margin={{ bottom: 4, left: 0, right: 0, top: 4 }}
				>
					<YAxis domain={["auto", "auto"]} hide />
					<Line
						connectNulls={false}
						dataKey="temperatureC"
						dot={false}
						isAnimationActive={false}
						stroke="var(--color-chart-1)"
						strokeWidth={1.5}
						type="monotone"
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

interface HeatToggleProps {
	isPending?: boolean;
	onToggleHeat: (pinnedOff: boolean) => void;
	pinnedOff: boolean;
}

function HeatToggle({ isPending, onToggleHeat, pinnedOff }: HeatToggleProps) {
	const [confirmOpen, setConfirmOpen] = useState(false);

	if (pinnedOff) {
		return (
			<Button
				aria-label="Turn heat back on"
				disabled={isPending}
				onClick={() => onToggleHeat(false)}
				size="sm"
				variant="outline"
			>
				<Flame size={14} />
				Turn heat on
			</Button>
		);
	}

	return (
		<Popover onOpenChange={setConfirmOpen} open={confirmOpen}>
			<PopoverTrigger
				render={
					<Button
						aria-label="Turn heat off"
						disabled={isPending}
						size="sm"
						variant="outline"
					>
						<Flame size={14} />
						Turn heat off
					</Button>
				}
			/>
			<PopoverContent>
				<p className="mb-3 text-foreground text-sm">
					Turn off heat in this room?
				</p>
				<div className="flex justify-end gap-2">
					<Button
						onClick={() => setConfirmOpen(false)}
						size="sm"
						variant="ghost"
					>
						Cancel
					</Button>
					<Button
						onClick={() => {
							setConfirmOpen(false);
							onToggleHeat(true);
						}}
						size="sm"
						variant="destructive"
					>
						Confirm
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

interface RoomGroupProps {
	alertSent?: boolean;
	anomaly?: boolean;
	badge?: "OK" | "Too Cold" | "Too Hot" | null;
	devices: DeviceItem[];
	dndEnabled?: boolean;
	expandedDeviceId?: string | null;
	isToggleHeatPending?: boolean;
	isUnassigned?: boolean;
	onDeviceClick?: (device: DeviceItem) => void;
	onHeaderClick?: () => void;
	onToggleHeat?: (pinnedOff: boolean) => void;
	pinnedOff?: boolean;
	primarySensorId?: string | null;
	roomId: string;
	roomName: string;
	suggestion?: string | null;
}

export function RoomGroup({
	alertSent,
	anomaly,
	badge,
	devices,
	dndEnabled,
	expandedDeviceId,
	isToggleHeatPending,
	isUnassigned,
	onDeviceClick,
	onHeaderClick,
	onToggleHeat,
	pinnedOff,
	primarySensorId,
	roomId,
	roomName,
	suggestion,
}: RoomGroupProps) {
	const { setNodeRef, isOver } = useDroppable({ id: roomId });

	const grid = (
		<div
			className={cn(
				"cc-device-grid grid min-h-[64px] grid-cols-1 gap-3 rounded-xl p-1 transition-colors sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
				isOver && dndEnabled
					? "bg-[var(--s-bg-dnd)] ring-1 ring-[var(--s-border-dnd)]"
					: "",
			)}
			ref={setNodeRef}
		>
			{dndEnabled ? (
				<SortableContext
					items={devices.map((d) => d.id)}
					strategy={rectSortingStrategy}
				>
					{devices.map((device) => (
						<SortableDeviceCard
							device={device}
							isExpanded={device.id === expandedDeviceId}
							key={device.id}
							onClick={() => onDeviceClick?.(device)}
						/>
					))}
				</SortableContext>
			) : (
				devices.map((device) => (
					<SortableDeviceCard
						device={device}
						isExpanded={device.id === expandedDeviceId}
						key={device.id}
						onClick={() => onDeviceClick?.(device)}
					/>
				))
			)}
		</div>
	);

	return (
		<section
			className="cc-room-section flex flex-col gap-4"
			id={`room-${roomId}`}
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h2
						className={cn(
							"font-semibold text-xl",
							isUnassigned ? "text-[var(--s-text-dim)]" : "text-foreground",
							onHeaderClick &&
								"cursor-pointer transition-colors hover:text-[var(--cc-cyan)]",
						)}
						onClick={onHeaderClick}
						onKeyDown={(e) => {
							if (!onHeaderClick) return;
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onHeaderClick();
							}
						}}
						role={onHeaderClick ? "button" : undefined}
						tabIndex={onHeaderClick ? 0 : undefined}
					>
						{roomName}
						<span className="ml-2 font-normal text-[var(--s-text-dim)] text-sm">
							({devices.length})
						</span>
					</h2>
					{pinnedOff && (
						<Badge className="h-auto rounded-lg bg-amber-700 px-3 py-1 font-semibold text-amber-100 text-sm">
							Manually off
						</Badge>
					)}
				</div>
				<div className="flex items-center gap-2">
					{badge && (
						<Badge
							className={cn(
								"h-auto rounded-lg px-3 py-1 font-semibold text-sm",
								ROOM_STATUS_BADGE_CLASSES[badge] ?? "",
							)}
						>
							{badge}
						</Badge>
					)}
					{alertSent && (
						<Mail
							aria-label="Alert email sent"
							className="text-[var(--s-text-dim)]"
							size={14}
						/>
					)}
					{onToggleHeat && (
						<HeatToggle
							isPending={isToggleHeatPending}
							onToggleHeat={onToggleHeat}
							pinnedOff={!!pinnedOff}
						/>
					)}
				</div>
			</div>
			{anomaly && suggestion && (
				<p className="text-amber-400 text-sm italic">{suggestion}</p>
			)}
			{primarySensorId && <RoomSparkline deviceId={primarySensorId} />}
			{grid}
		</section>
	);
}
