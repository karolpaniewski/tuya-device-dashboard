"use client";

import { ChevronDown, ChevronUp, Thermometer } from "lucide-react";
import { useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "~/components/ui/button";
import { api, type RouterOutputs } from "~/trpc/react";

type RoomItem = RouterOutputs["device"]["overview"]["rooms"][number];

function RoomChart({ room }: { room: RoomItem }) {
	const primarySensorId =
		room.devices.find((d) => d.deviceType === "sensor" && d.isOnline)
			?.tuyaDeviceId ??
		room.devices.find((d) => d.deviceType === "sensor")?.tuyaDeviceId ??
		null;

	const hasSensors = primarySensorId !== null;

	const { data } = api.device.temperatureHistory.useQuery(
		{ tuyaDeviceId: primarySensorId ?? "", range: "24h" },
		{ enabled: hasSensors, staleTime: 60_000 },
	);

	const chartData =
		data?.map((r) => ({
			ts: new Date(r.recordedAt).getTime(),
			temperatureC: r.temperatureC,
		})) ?? [];

	const formatTs = (ts: number) =>
		new Date(ts).toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		});

	return (
		<div className="rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] p-4 shadow-[var(--s-shadow)]">
			<p className="mb-3 font-medium text-foreground text-sm">
				{room.roomName}
			</p>
			{!hasSensors ? (
				<div
					className="flex items-center justify-center rounded-lg text-[var(--s-text-dim)] text-sm"
					style={{ border: "1px dashed var(--s-border)", height: 200 }}
				>
					No sensors
				</div>
			) : chartData.length === 0 ? (
				<div
					className="flex items-center justify-center text-[var(--s-text-dim)] text-sm"
					style={{ height: 200 }}
				>
					Loading…
				</div>
			) : (
				<ResponsiveContainer height={200} width="100%">
					<LineChart
						data={chartData}
						margin={{ bottom: 0, left: 0, right: 8, top: 4 }}
					>
						<CartesianGrid
							className="text-[var(--s-grid-line)]"
							stroke="currentColor"
							strokeDasharray="4 4"
						/>
						<XAxis
							axisLine={false}
							dataKey="ts"
							tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
							tickFormatter={formatTs}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							domain={["auto", "auto"]}
							tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
							tickFormatter={(v: number) => `${v}°`}
							tickLine={false}
							width={28}
						/>
						<Tooltip
							contentStyle={{
								background: "var(--popover)",
								border: "1px solid var(--border)",
								borderRadius: "8px",
								color: "var(--popover-foreground)",
								fontSize: 12,
							}}
							formatter={(val: unknown) => [
								typeof val === "number" ? `${val.toFixed(1)} °C` : "—",
							]}
							labelFormatter={(ts: unknown) =>
								typeof ts === "number" ? new Date(ts).toLocaleString() : ""
							}
						/>
						<Line
							connectNulls={false}
							dataKey="temperatureC"
							dot={false}
							isAnimationActive={false}
							name="Temperature"
							stroke="var(--color-chart-1)"
							strokeWidth={1.5}
							type="monotone"
						/>
					</LineChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}

export function RoomTemperaturePanel({ rooms }: { rooms: RoomItem[] }) {
	const [open, setOpen] = useState(true);

	return (
		<div>
			<div className="mb-3 flex items-center justify-between pr-8">
				<div className="flex items-center gap-2">
					<Thermometer className="text-[var(--s-text-muted)]" size={15} />
					<span className="font-semibold text-foreground text-sm">
						Temperature Overview
					</span>
				</div>
				<Button
					onClick={() => setOpen((o) => !o)}
					size="sm"
					type="button"
					variant="ghost"
				>
					{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
					{open ? "Hide" : "Show"}
				</Button>
			</div>
			{open && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{rooms.map((room) => (
						<RoomChart key={room.roomId} room={room} />
					))}
				</div>
			)}
		</div>
	);
}
