"use client";

import { Dialog } from "@base-ui/react/dialog";
import { format } from "date-fns";
import { useState } from "react";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { api } from "~/trpc/react";

type Range = "1h" | "24h" | "7d";

const RANGES: { label: string; value: Range }[] = [
	{ label: "1h", value: "1h" },
	{ label: "24h", value: "24h" },
	{ label: "7d", value: "7d" },
];

function formatTick(ts: number, range: Range): string {
	const d = new Date(ts);
	return range === "7d" ? format(d, "dd MMM") : format(d, "HH:mm");
}

export function TemperatureHistoryModal({
	tuyaDeviceId,
	deviceName,
	open,
	onClose,
}: {
	tuyaDeviceId: string;
	deviceName: string;
	open: boolean;
	onClose: () => void;
}) {
	const [range, setRange] = useState<Range>("24h");

	const { data, isLoading } = api.device.temperatureHistory.useQuery(
		{ tuyaDeviceId, range },
		{ enabled: open },
	);

	const chartData = data?.map((r) => ({
		ts: new Date(r.recordedAt).getTime(),
		temperatureC: r.temperatureC,
		setpointC: r.setpointC,
	}));

	return (
		<Dialog.Root
			onOpenChange={(v) => {
				if (!v) onClose();
			}}
			open={open}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
				<Dialog.Popup className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl">
						<div className="flex items-center justify-between">
							<Dialog.Title className="font-semibold text-lg text-white">
								Historia temperatury &mdash; {deviceName}
							</Dialog.Title>
							<Dialog.Close className="rounded p-1 text-gray-400 hover:text-white">
								&#x2715;
							</Dialog.Close>
						</div>

						<div className="flex gap-2">
							{RANGES.map((r) => (
								<button
									className={`rounded-lg px-3 py-1 font-medium text-sm transition-colors ${
										range === r.value
											? "bg-white/20 text-white"
											: "text-gray-400 hover:text-white"
									}`}
									key={r.value}
									onClick={() => setRange(r.value)}
									type="button"
								>
									{r.label}
								</button>
							))}
						</div>

						<div className="h-[300px]">
							{isLoading ? (
								<div className="h-full animate-pulse rounded-lg bg-white/5" />
							) : !chartData || chartData.length === 0 ? (
								<div className="flex h-full items-center justify-center text-gray-500 text-sm">
									Brak danych historycznych dla tego zakresu.
								</div>
							) : (
								<ResponsiveContainer height="100%" width="100%">
									<LineChart
										data={chartData}
										margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
									>
										<CartesianGrid stroke="#ffffff1a" strokeDasharray="3 3" />
										<XAxis
											dataKey="ts"
											domain={["dataMin", "dataMax"]}
											scale="time"
											stroke="#ffffff1a"
											tick={{ fill: "#9ca3af", fontSize: 11 }}
											tickFormatter={(v: number) => formatTick(v, range)}
											type="number"
										/>
										<YAxis
											stroke="#ffffff1a"
											tick={{ fill: "#9ca3af", fontSize: 11 }}
											unit="C"
											width={48}
										/>
										<Tooltip
											contentStyle={{
												background: "#1f2937",
												border: "1px solid #374151",
												borderRadius: 8,
												color: "#f9fafb",
											}}
											formatter={(value, name) => {
												const v = value as number | null | undefined;
												return [
													v != null ? `${Number(v).toFixed(1)}C` : "-",
													name === "temperatureC" ? "Temperatura" : "Nastawa",
												];
											}}
											labelFormatter={(label) => {
												const ms = Number(label);
												return Number.isNaN(ms)
													? String(label)
													: format(new Date(ms), "dd MMM HH:mm");
											}}
										/>
										<Legend
											formatter={(v) =>
												v === "temperatureC" ? "Temperatura" : "Nastawa"
											}
											wrapperStyle={{ color: "#9ca3af", fontSize: 12 }}
										/>
										<Line
											connectNulls={false}
											dataKey="temperatureC"
											dot={false}
											stroke="#60a5fa"
											strokeWidth={2}
											type="monotone"
										/>
										<Line
											connectNulls={false}
											dataKey="setpointC"
											dot={false}
											stroke="#fb923c"
											strokeWidth={2}
											type="monotone"
										/>
									</LineChart>
								</ResponsiveContainer>
							)}
						</div>
					</div>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
