"use client";

import { Thermometer, Timer, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Badge } from "~/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import {
	formatModeSchedule,
	type ModeTargetingRoom,
} from "~/lib/mode-targeting";
import { ROOM_STATUS_BADGE_CLASSES } from "~/lib/room-status-colors";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { HeatToggle } from "./heat-toggle";

type RoomItem = RouterOutputs["device"]["overview"]["rooms"][number];

interface Props {
	room: RoomItem;
	modesForRoom: ModeTargetingRoom[];
	onClose: () => void;
	onToggleHeat: (pinnedOff: boolean) => void;
	isToggleHeatPending: boolean;
}

function RoomPanelChart({ sensorId }: { sensorId: string }) {
	const { data } = api.device.temperatureHistory.useQuery(
		{ tuyaDeviceId: sensorId, range: "24h" },
		{ enabled: true, staleTime: 60_000 },
	);

	const formatTs = (ts: number) =>
		new Date(ts).toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		});

	if (!data) {
		return (
			<div className="flex h-[200px] items-center justify-center text-[var(--s-text-dim)] text-sm">
				Loading…
			</div>
		);
	}

	const chartData = data.map((r) => ({
		ts: new Date(r.recordedAt).getTime(),
		temperatureC: r.temperatureC,
	}));

	return (
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
	);
}

export function RoomQuickOverviewPanel({
	room,
	modesForRoom,
	onClose,
	onToggleHeat,
	isToggleHeatPending,
}: Props) {
	const currentTempC =
		room.devices.find(
			(d) => d.deviceType === "sensor" && d.isOnline && !d.isStale,
		)?.temperatureC ?? null;

	const primarySensorId =
		room.devices.find((d) => d.deviceType === "sensor" && d.isOnline)
			?.tuyaDeviceId ??
		room.devices.find((d) => d.deviceType === "sensor")?.tuyaDeviceId ??
		null;

	return (
		<Sheet defaultOpen onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-[420px] overflow-y-auto p-0" side="right">
				<SheetHeader className="border-[var(--s-border)] border-b px-5 py-4">
					<SheetTitle>{room.roomName}</SheetTitle>
					<div className="mt-1 flex items-center gap-2">
						<div className="flex items-center gap-1 text-foreground text-sm">
							<Thermometer size={14} />
							{currentTempC !== null ? `${currentTempC.toFixed(1)} °C` : "—"}
						</div>
						{room.badge && (
							<Badge
								className={cn(
									"h-auto rounded-lg px-3 py-1 font-semibold text-sm",
									ROOM_STATUS_BADGE_CLASSES[room.badge] ?? "",
								)}
							>
								{room.badge}
							</Badge>
						)}
					</div>
				</SheetHeader>

				<div className="flex flex-col gap-5 px-5 py-4">
					<div>
						<HeatToggle
							isPending={isToggleHeatPending}
							onToggleHeat={onToggleHeat}
							pinnedOff={room.pinnedOff ?? false}
						/>
					</div>

					{primarySensorId !== null && (
						<div>
							<p className="mb-3 font-semibold text-[var(--s-text-secondary)] text-sm uppercase tracking-[0.04em]">
								24h Temperature
							</p>
							<RoomPanelChart sensorId={primarySensorId} />
						</div>
					)}

					<div>
						<p className="mb-2 font-semibold text-[var(--s-text-secondary)] text-sm uppercase tracking-[0.04em]">
							Devices in this room
						</p>
						<ul className="flex flex-col gap-2">
							{room.devices.map((device) => (
								<li
									className="flex items-center justify-between gap-2 rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] px-4 py-3"
									key={device.id}
								>
									<div className="flex items-center gap-2">
										{device.isOnline ? (
											<Wifi className="shrink-0 text-green-400" size={14} />
										) : (
											<WifiOff
												className="shrink-0 text-[var(--s-text-ghost)]"
												size={14}
											/>
										)}
										<span className="font-medium text-foreground text-sm">
											{device.name}
										</span>
										<span className="rounded bg-[var(--s-bg-dim)] px-1.5 py-0.5 font-mono text-[var(--s-text-dim)] text-xs">
											{device.deviceType}
										</span>
									</div>
									<div className="flex items-center gap-1 text-[var(--s-text-muted)] text-sm">
										{device.deviceType === "sensor" ? (
											<>
												<Thermometer size={14} />
												{device.temperatureC !== null
													? `${device.temperatureC.toFixed(1)} °C`
													: "—"}
											</>
										) : device.deviceType === "valve" ? (
											<span>{device.isOn ? "Open" : "Closed"}</span>
										) : null}
									</div>
								</li>
							))}
						</ul>
					</div>

					<div>
						<p className="mb-2 font-semibold text-[var(--s-text-secondary)] text-sm uppercase tracking-[0.04em]">
							Targeted by
						</p>
						{modesForRoom.length > 0 ? (
							<ul className="flex flex-col gap-2">
								{modesForRoom.map((mode) => (
									<li
										className="flex flex-col gap-1 rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] px-4 py-3"
										key={mode.id}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="font-medium text-foreground text-sm">
												{mode.name}
											</span>
											<Badge variant={mode.targetOn ? "default" : "outline"}>
												{mode.targetOn ? "ON" : "OFF"}
											</Badge>
										</div>
										<p className="text-[var(--s-text-muted)] text-xs">
											{formatModeSchedule(mode)}
										</p>
									</li>
								))}
							</ul>
						) : (
							<div className="flex flex-col items-center justify-center py-6 text-center">
								<Timer
									className="mb-2"
									size={28}
									style={{ color: "var(--s-text-dim)" }}
								/>
								<p className="text-[var(--s-text-dim)] text-sm">
									No modes target this room yet.
								</p>
							</div>
						)}
						<Link
							className="mt-2 inline-block text-[var(--s-text-secondary)] text-sm underline hover:text-[var(--s-text-secondary-hov)]"
							href="/setup"
						>
							Manage modes in Settings →
						</Link>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
