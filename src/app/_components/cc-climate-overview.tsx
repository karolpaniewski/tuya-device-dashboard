"use client";

import { Droplets, Thermometer, Wind } from "lucide-react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { api } from "~/trpc/react";

const OUTDOOR_COLOR = "var(--color-chart-1)";

function ConditionStat({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Thermometer;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center gap-2.5">
			<div
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
				style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
			>
				<Icon
					className="h-[15px] w-[15px]"
					style={{ color: "var(--cc-text-faint)" }}
				/>
			</div>
			<div>
				<div
					className="font-mono text-[10px] tracking-[0.04em]"
					style={{ color: "var(--cc-text-faint)" }}
				>
					{label}
				</div>
				<div
					className="font-semibold text-[14px]"
					style={{ color: "var(--cc-text-primary)" }}
				>
					{value}
				</div>
			</div>
		</div>
	);
}

const formatTs = (ts: number) =>
	new Date(ts).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});

export function CcClimateOverview() {
	const { data, isLoading } = api.weather.outdoorHistory.useQuery(undefined, {
		staleTime: 60_000,
	});

	const readings = data?.readings ?? [];
	const chartData = readings.map((r) => ({
		ts: new Date(r.recordedAt).getTime(),
		temperatureC: r.temperatureC,
	}));
	const current = data?.current ?? null;
	const liveTemp = current?.temperatureC ?? chartData.at(-1)?.temperatureC;

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
						OUTDOOR · {data?.location ?? "—"} · LAST 24 HOURS
					</div>
				</div>
				<div className="flex items-center gap-[7px]">
					<span
						className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
						style={{ backgroundColor: OUTDOOR_COLOR }}
					/>
					<span
						className="whitespace-nowrap text-[12px]"
						style={{ color: "var(--cc-text-secondary)" }}
					>
						Outdoor
					</span>
					<span
						className="whitespace-nowrap font-mono font-semibold text-[12px]"
						style={{ color: OUTDOOR_COLOR }}
					>
						{liveTemp !== undefined ? `${liveTemp.toFixed(1)}°` : "—"}
					</span>
				</div>
			</div>

			{chartData.length === 0 ? (
				<div
					className="mt-4 flex items-center justify-center text-sm"
					style={{ color: "var(--cc-text-faint)", height: 240 }}
				>
					{isLoading ? "Loading…" : "No weather data yet"}
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
							formatter={(val: unknown) => [
								typeof val === "number" ? `${val.toFixed(1)} °C` : "—",
								"Outdoor",
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
							name="temperatureC"
							stroke={OUTDOOR_COLOR}
							strokeWidth={2}
							type="monotone"
						/>
					</LineChart>
				</ResponsiveContainer>
			)}

			{current && (
				<div
					className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-t pt-4"
					style={{ borderColor: "var(--cc-glass-border)" }}
				>
					<ConditionStat
						icon={Thermometer}
						label="FEELS LIKE"
						value={`${current.feelsLikeC.toFixed(1)}°`}
					/>
					<ConditionStat
						icon={Droplets}
						label="HUMIDITY"
						value={`${Math.round(current.humidityPct)}%`}
					/>
					<ConditionStat
						icon={Wind}
						label="WIND"
						value={`${current.windKph.toFixed(1)} km/h`}
					/>
					{data?.minC !== null &&
						data?.minC !== undefined &&
						data?.maxC !== null &&
						data?.maxC !== undefined && (
							<ConditionStat
								icon={Thermometer}
								label="24H RANGE"
								value={`${data.minC.toFixed(1)}° – ${data.maxC.toFixed(1)}°`}
							/>
						)}
				</div>
			)}
		</div>
	);
}
