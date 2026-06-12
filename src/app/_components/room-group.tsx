"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { DeviceCard } from "./device-card";

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
		<div className="mb-3 rounded-lg border border-white/5 bg-white/[0.02] px-2">
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
						stroke="#60a5fa"
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
	isUnassigned?: boolean;
	primarySensorId?: string | null;
	roomName: string;
	suggestion?: string | null;
}

export function RoomGroup({
	anomaly,
	badge,
	devices,
	isUnassigned,
	primarySensorId,
	roomName,
	suggestion,
}: RoomGroupProps) {
	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2
					className={`font-semibold text-xl ${isUnassigned ? "text-gray-400" : "text-white"}`}
				>
					{roomName}
					<span className="ml-2 font-normal text-gray-500 text-sm">
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
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{devices.map((device) => (
					<DeviceCard device={device} key={device.id} />
				))}
			</div>
		</section>
	);
}
