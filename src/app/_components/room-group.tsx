"use client";

import { useDroppable } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { SortableDeviceCard } from "./sortable-device-card";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

const BADGE_STYLE: Record<string, string> = {
	OK: "bg-green-700 text-green-100",
	"Too Cold": "bg-blue-700 text-blue-100",
	"Too Hot": "bg-red-700 text-red-100",
};

function RoomSparkline({ deviceId }: { deviceId: string }) {
	const { data } = api.device.temperatureHistory.useQuery(
		{ tuyaDeviceId: deviceId, range: "24h" },
		{ staleTime: 60_000 },
	);
	if (!data?.length) return null;
	const chartData = data.map((r) => ({
		temperatureC: r.temperatureC,
		ts: new Date(r.recordedAt).getTime(),
	}));
	return (
		<div className="mb-3 rounded-lg border border-[var(--s-border-spark)] bg-[var(--s-bg-spark)] px-2">
			<ResponsiveContainer height={56} width="100%">
				<LineChart
					data={chartData}
					margin={{ bottom: 4, left: 0, right: 0, top: 4 }}
				>
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

interface RoomGroupProps {
	anomaly?: boolean;
	badge?: "OK" | "Too Cold" | "Too Hot" | null;
	devices: DeviceItem[];
	dndEnabled?: boolean;
	isUnassigned?: boolean;
	onDeviceClick?: (device: DeviceItem) => void;
	primarySensorId?: string | null;
	roomId: string;
	roomName: string;
	suggestion?: string | null;
}

export function RoomGroup({
	anomaly,
	badge,
	devices,
	dndEnabled,
	isUnassigned,
	onDeviceClick,
	primarySensorId,
	roomId,
	roomName,
	suggestion,
}: RoomGroupProps) {
	const { setNodeRef, isOver } = useDroppable({ id: roomId });

	const grid = (
		<div
			className={cn(
				"grid min-h-[80px] grid-cols-1 gap-4 rounded-xl p-1 transition-colors sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
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
							key={device.id}
							onClick={() => onDeviceClick?.(device)}
						/>
					))}
				</SortableContext>
			) : (
				devices.map((device) => (
					<SortableDeviceCard
						device={device}
						key={device.id}
						onClick={() => onDeviceClick?.(device)}
					/>
				))
			)}
		</div>
	);

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2
					className={`font-semibold text-xl ${isUnassigned ? "text-[var(--s-text-dim)]" : "text-foreground"}`}
				>
					{roomName}
					<span className="ml-2 font-normal text-[var(--s-text-dim)] text-sm">
						({devices.length})
					</span>
				</h2>
				{badge && (
					<Badge
						className={cn(
							"h-auto rounded-lg px-3 py-1 font-semibold text-sm",
							BADGE_STYLE[badge] ?? "",
						)}
					>
						{badge}
					</Badge>
				)}
			</div>
			{anomaly && suggestion && (
				<p className="text-amber-400 text-sm italic">{suggestion}</p>
			)}
			{primarySensorId && <RoomSparkline deviceId={primarySensorId} />}
			{grid}
		</section>
	);
}
