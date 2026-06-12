"use client";

import { Droplets, Thermometer, Wifi, WifiOff } from "lucide-react";
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
import { toast } from "sonner";
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];
type RoomItem = RouterOutputs["room"]["list"][number];

interface Props {
	device: DeviceItem;
	rooms: Pick<RoomItem, "id" | "name">[];
	utils: ReturnType<typeof api.useUtils>;
	onClose: () => void;
}

export function DeviceModal({ device, rooms, utils, onClose }: Props) {
	return (
		<Dialog onOpenChange={(isOpen) => !isOpen && onClose()} defaultOpen>
			<DeviceModalContent
				device={device}
				rooms={rooms}
				utils={utils}
			/>
		</Dialog>
	);
}

function DeviceModalContent({
	device,
	rooms,
	utils,
}: {
	device: DeviceItem;
	rooms: Pick<RoomItem, "id" | "name">[];
	utils: ReturnType<typeof api.useUtils>;
}) {
	const [name, setName] = useState(device.name);
	const [nameSaving, setNameSaving] = useState(false);
	const [setpointInput, setSetpointInput] = useState(
		device.setpointC?.toFixed(1) ?? "",
	);
	const [setpointSaving, setSetpointSaving] = useState(false);
	const [roomSaving, setRoomSaving] = useState(false);
	const [optimisticSetpoint, setOptimisticSetpoint] = useState(
		device.setpointC,
	);

	const rename = api.device.rename.useMutation({
		onSuccess: () => {
			void utils.device.overview.invalidate();
			toast.success("Device renamed");
		},
		onError: (e) => toast.error(e.message),
		onSettled: () => setNameSaving(false),
	});

	const setpoint = api.device.setpoint.useMutation({
		onSuccess: (r) => {
			setOptimisticSetpoint(r.setpointC);
			void utils.device.overview.invalidate();
			toast.success(`Setpoint set to ${r.setpointC.toFixed(1)} °C`);
		},
		onError: (e) => toast.error(e.message),
		onSettled: () => setSetpointSaving(false),
	});

	const setDeviceRoom = api.room.setDeviceRoom.useMutation({
		onSuccess: () => {
			void utils.device.overview.invalidate();
			toast.success("Room updated");
		},
		onError: (e) => toast.error(e.message),
		onSettled: () => setRoomSaving(false),
	});

	function handleRename() {
		if (name === device.name || !name.trim()) return;
		setNameSaving(true);
		rename.mutate({ id: device.id, siteId: device.siteId, name: name.trim() });
	}

	function handleSetpoint() {
		const val = Number.parseFloat(setpointInput);
		if (Number.isNaN(val) || val < 5 || val > 35) {
			toast.error("Setpoint must be between 5 and 35 °C");
			return;
		}
		setSetpointSaving(true);
		setpoint.mutate({ deviceId: device.id, setpointC: val });
	}

	function handleRoomChange(roomId: string) {
		setRoomSaving(true);
		setDeviceRoom.mutate({
			deviceId: device.id,
			roomId: roomId === "unassigned" ? null : roomId,
		});
	}

	return (
		<DialogContent>
			<DialogHeader>
				<div className="flex items-center gap-2">
					{device.isOnline ? (
						<Wifi className="shrink-0 text-green-400" size={14} />
					) : (
						<WifiOff className="shrink-0 text-white/30" size={14} />
					)}
					<DialogTitle>{device.name}</DialogTitle>
					<span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/40 text-xs">
						{device.deviceType}
					</span>
				</div>
				<DialogClose />
			</DialogHeader>

			<Tabs defaultValue="overview">
				<div className="border-white/10 border-b px-6">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="history">History</TabsTrigger>
						<TabsTrigger disabled value="automations">
							Automations
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent value="overview">
					<DialogBody className="space-y-5">
						{/* Current readings */}
						<div className="grid grid-cols-2 gap-3">
							<ReadingCard
								icon={<Thermometer size={14} />}
								label="Temperature"
								value={
									device.temperatureC !== null
										? `${device.temperatureC.toFixed(1)} °C`
										: "—"
								}
							/>
							{device.deviceType === "sensor" && (
								<ReadingCard
									icon={<Droplets size={14} />}
									label="Humidity"
									value={
										device.humidityPct !== null
											? `${device.humidityPct.toFixed(0)} %`
											: "—"
									}
								/>
							)}
							{device.deviceType === "valve" && (
								<ReadingCard
									icon={<Thermometer className="text-orange-400" size={14} />}
									label="Setpoint"
									value={
										optimisticSetpoint !== null
											? `${optimisticSetpoint.toFixed(1)} °C`
											: "—"
									}
								/>
							)}
						</div>

						{/* Setpoint control — valves only */}
						{device.deviceType === "valve" && (
							<div>
								<div className="mb-2 flex items-center justify-between">
									<p className="font-medium text-sm text-white/60">
										Set temperature
									</p>
									<span className="font-medium text-sm text-white">
										{setpointInput ? `${Number(setpointInput).toFixed(1)} °C` : "—"}
									</span>
								</div>
								<div className="flex gap-3">
									<input
										className="h-2 flex-1 cursor-pointer accent-blue-500 disabled:opacity-40"
										disabled={setpointSaving}
										max={35}
										min={5}
										onChange={(e) => setSetpointInput(e.target.value)}
										step={0.5}
										type="range"
										value={setpointInput || "20"}
									/>
									<button
										className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
										disabled={setpointSaving}
										onClick={handleSetpoint}
										type="button"
									>
										{setpointSaving ? "Sending…" : "Set"}
									</button>
								</div>
							</div>
						)}

						{/* Room assignment */}
						<div>
							<p className="mb-2 font-medium text-sm text-white/60">Room</p>
							<select
								className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-40"
								disabled={roomSaving}
								onChange={(e) => handleRoomChange(e.target.value)}
								value={device.roomId ?? "unassigned"}
							>
								<option value="unassigned">— Unassigned</option>
								{rooms.map((r) => (
									<option key={r.id} value={r.id}>
										{r.name}
									</option>
								))}
							</select>
						</div>

						{/* Rename */}
						<div>
							<p className="mb-2 font-medium text-sm text-white/60">Name</p>
							<div className="flex gap-2">
								<input
									className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
									disabled={nameSaving}
									onChange={(e) => setName(e.target.value)}
									onKeyDown={(e) => e.key === "Enter" && handleRename()}
									value={name}
								/>
								<button
									className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
									disabled={nameSaving || name === device.name}
									onClick={handleRename}
									type="button"
								>
									{nameSaving ? "Saving…" : "Save"}
								</button>
							</div>
						</div>
					</DialogBody>
				</TabsContent>

				<TabsContent value="history">
					<DialogBody>
						<TemperatureChart tuyaDeviceId={device.tuyaDeviceId} />
					</DialogBody>
				</TabsContent>

				<TabsContent value="automations">
					<DialogBody>
						<p className="text-center text-sm text-white/40">
							Automation rules are coming in a future update.
						</p>
					</DialogBody>
				</TabsContent>
			</Tabs>
		</DialogContent>
	);
}

function ReadingCard({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
			<div className="mb-1 flex items-center gap-1.5 text-white/40 text-xs">
				{icon}
				{label}
			</div>
			<p className="font-semibold text-lg text-white">{value}</p>
		</div>
	);
}

function TemperatureChart({ tuyaDeviceId }: { tuyaDeviceId: string }) {
	const [range, setRange] = useState<"1h" | "24h" | "7d">("24h");
	const { data, isLoading } = api.device.temperatureHistory.useQuery(
		{ tuyaDeviceId, range },
		{ staleTime: 60_000 },
	);

	const chartData =
		data?.map((r) => ({
			ts: new Date(r.recordedAt).getTime(),
			temperatureC: r.temperatureC,
			setpointC: r.setpointC,
		})) ?? [];

	const formatTs = (ts: number) => {
		const d = new Date(ts);
		if (range === "7d")
			return d.toLocaleDateString(undefined, { weekday: "short" });
		return d.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<div>
			<div className="mb-4 flex items-center justify-between">
				<p className="font-medium text-sm text-white/60">Temperature history</p>
				<div className="flex gap-1">
					{(["1h", "24h", "7d"] as const).map((r) => (
						<button
							className={cn(
								"rounded px-2 py-1 text-xs transition-colors",
								range === r
									? "bg-white/10 text-white"
									: "text-white/40 hover:text-white/60",
							)}
							key={r}
							onClick={() => setRange(r)}
							type="button"
						>
							{r}
						</button>
					))}
				</div>
			</div>

			{isLoading ? (
				<div className="flex h-48 items-center justify-center text-sm text-white/30">
					Loading…
				</div>
			) : chartData.length === 0 ? (
				<div className="flex h-48 items-center justify-center text-sm text-white/30">
					No data for this period
				</div>
			) : (
				<ResponsiveContainer height={200} width="100%">
					<LineChart
						data={chartData}
						margin={{ bottom: 0, left: 0, right: 8, top: 4 }}
					>
						<CartesianGrid
							stroke="rgba(255,255,255,0.05)"
							strokeDasharray="4 4"
						/>
						<XAxis
							axisLine={false}
							dataKey="ts"
							tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
							tickFormatter={formatTs}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							domain={["auto", "auto"]}
							tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
							tickFormatter={(v: number) => `${v}°`}
							tickLine={false}
							width={28}
						/>
						<Tooltip
							contentStyle={{
								background: "rgba(15,15,15,0.95)",
								border: "1px solid rgba(255,255,255,0.1)",
								borderRadius: "8px",
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
							stroke="#60a5fa"
							strokeWidth={1.5}
							type="monotone"
						/>
						{chartData.some((d) => d.setpointC !== null) && (
							<Line
								connectNulls={false}
								dataKey="setpointC"
								dot={false}
								isAnimationActive={false}
								name="Setpoint"
								stroke="rgba(251,146,60,0.6)"
								strokeDasharray="4 2"
								strokeWidth={1}
								type="monotone"
							/>
						)}
					</LineChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}
