"use client";

import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { api, type RouterOutputs } from "~/trpc/react";

type RoomItem = RouterOutputs["device"]["overview"]["rooms"][number];

const SERIES_COLORS = [
	"var(--color-chart-1)",
	"var(--color-chart-2)",
	"var(--color-chart-3)",
	"var(--color-chart-4)",
	"var(--color-chart-5)",
];

function primarySensorId(room: RoomItem): string | null {
	return (
		room.devices.find((d) => d.deviceType === "sensor" && d.isOnline)
			?.tuyaDeviceId ??
		room.devices.find((d) => d.deviceType === "sensor")?.tuyaDeviceId ??
		null
	);
}

const formatTs = (ts: number) =>
	new Date(ts).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});

export function CcClimateOverview({ rooms }: { rooms: RoomItem[] }) {
	const roomsWithSensors = rooms
		.map((room) => ({ room, sensorId: primarySensorId(room) }))
		.filter(
			(r): r is { room: RoomItem; sensorId: string } => r.sensorId !== null,
		);

	const historyQueries = api.useQueries((t) =>
		roomsWithSensors.map(({ sensorId }) =>
			t.device.temperatureHistory(
				{ tuyaDeviceId: sensorId, range: "24h" },
				{ staleTime: 60_000 },
			),
		),
	);

	const mergedByTs = new Map<number, Record<string, number | null>>();
	for (let i = 0; i < roomsWithSensors.length; i++) {
		const room = roomsWithSensors[i]?.room;
		if (!room) continue;
		const rows = historyQueries[i]?.data ?? [];
		for (const r of rows) {
			const ts = new Date(r.recordedAt).getTime();
			const row = mergedByTs.get(ts) ?? {};
			row[room.roomId] = r.temperatureC;
			mergedByTs.set(ts, row);
		}
	}
	const chartData = Array.from(mergedByTs.entries())
		.sort(([a], [b]) => a - b)
		.map(([ts, vals]) => ({ ts, ...vals }));

	const latestByRoom = roomsWithSensors.map(({ room }, i) => {
		const rows = historyQueries[i]?.data ?? [];
		const last = rows.length > 0 ? rows[rows.length - 1] : null;
		return { room, value: last?.temperatureC ?? null };
	});

	const isFetching = historyQueries.some((q) => q.isLoading);
	const roomNameByDataKey = new Map(
		roomsWithSensors.map(({ room }) => [room.roomId, room.roomName]),
	);

	return (
		<div
			className="relative overflow-hidden rounded-[20px] border px-[22px] py-5"
			style={{
				background:
					"linear-gradient(155deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))",
				borderColor: "var(--cc-glass-border)",
			}}
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2">
						<h2
							className="font-semibold text-[17px]"
							style={{ color: "var(--cc-text-primary)" }}
						>
							Climate Overview
						</h2>
						<span
							className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] font-semibold text-[10px] tracking-[0.06em]"
							style={{
								backgroundColor: "rgba(52, 211, 153, 0.12)",
								color: "var(--cc-emerald)",
							}}
						>
							<span
								className="h-[5px] w-[5px] rounded-full"
								style={{ backgroundColor: "var(--cc-emerald)" }}
							/>
							LIVE
						</span>
					</div>
					<div
						className="mt-1 font-mono text-[11px]"
						style={{ color: "var(--cc-text-faint)" }}
					>
						LAST 24 HOURS
					</div>
				</div>
				{latestByRoom.length > 0 && (
					<div className="flex flex-wrap gap-[18px]">
						{latestByRoom.map(({ room, value }, i) => (
							<div className="flex items-center gap-[7px]" key={room.roomId}>
								<span
									className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
									style={{
										backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
									}}
								/>
								<span
									className="whitespace-nowrap text-[12px]"
									style={{ color: "var(--cc-text-secondary)" }}
								>
									{room.roomName}
								</span>
								<span
									className="whitespace-nowrap font-mono font-semibold text-[12px]"
									style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}
								>
									{value !== null ? `${value.toFixed(1)}°` : "—"}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			{roomsWithSensors.length === 0 ? (
				<div
					className="mt-4 flex items-center justify-center text-sm"
					style={{ color: "var(--cc-text-faint)", height: 240 }}
				>
					No rooms with sensor data
				</div>
			) : chartData.length === 0 ? (
				<div
					className="mt-4 flex items-center justify-center text-sm"
					style={{ color: "var(--cc-text-faint)", height: 240 }}
				>
					{isFetching ? "Loading…" : "No readings yet"}
				</div>
			) : (
				<ResponsiveContainer height={280} width="100%">
					<LineChart
						data={chartData}
						margin={{ bottom: 0, left: 0, right: 8, top: 14 }}
					>
						<CartesianGrid
							stroke="rgba(255,255,255,0.05)"
							strokeDasharray="4 4"
						/>
						<XAxis
							axisLine={false}
							dataKey="ts"
							tick={{ fill: "var(--cc-text-faint)", fontSize: 10 }}
							tickFormatter={formatTs}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							domain={["auto", "auto"]}
							tick={{ fill: "var(--cc-text-faint)", fontSize: 10 }}
							tickFormatter={(v: number) => `${v}°`}
							tickLine={false}
							width={32}
						/>
						<Tooltip
							contentStyle={{
								background: "var(--popover)",
								border: "1px solid var(--border)",
								borderRadius: "8px",
								color: "var(--popover-foreground)",
								fontSize: 12,
							}}
							formatter={(val: unknown, name: unknown) => [
								typeof val === "number" ? `${val.toFixed(1)} °C` : "—",
								roomNameByDataKey.get(String(name)) ?? String(name),
							]}
							labelFormatter={(ts: unknown) =>
								typeof ts === "number" ? new Date(ts).toLocaleString() : ""
							}
						/>
						{roomsWithSensors.map(({ room }, i) => (
							<Line
								connectNulls={false}
								dataKey={room.roomId}
								dot={false}
								isAnimationActive={false}
								key={room.roomId}
								name={room.roomId}
								stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
								strokeWidth={2}
								type="monotone"
							/>
						))}
					</LineChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}
