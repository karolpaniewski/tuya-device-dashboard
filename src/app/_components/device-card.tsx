"use client";

import { History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { TemperatureHistoryModal } from "./temperature-history-modal";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

const TYPE_BADGE: Record<string, string> = {
	sensor: "bg-blue-600 text-blue-100",
	valve: "bg-orange-600 text-orange-100",
	plug: "bg-gray-600 text-gray-100",
};

function SetpointControl({
	deviceId,
	initialSetpoint,
}: {
	deviceId: string;
	initialSetpoint: number | null;
}) {
	const [localSetpoint, setLocalSetpoint] = useState<number | null>(
		initialSetpoint,
	);
	const displayed = localSetpoint ?? initialSetpoint;

	const mutation = api.device.setpoint.useMutation({
		onSuccess: (data) => {
			setLocalSetpoint(data.setpointC);
			toast.success(`Setpoint → ${data.setpointC}°C`);
		},
		onError: () => {
			setLocalSetpoint(initialSetpoint);
			toast.error("Failed to update setpoint");
		},
	});

	function adjust(delta: number) {
		const base = displayed ?? 20;
		const next = Math.min(35, Math.max(5, Math.round((base + delta) * 2) / 2));
		setLocalSetpoint(next);
		mutation.mutate({ deviceId, setpointC: next });
	}

	return (
		<div className="flex items-center gap-1">
			<Button
				className="h-6 w-6 rounded p-0 text-xs"
				disabled={mutation.isPending || (displayed ?? 0) <= 5}
				onClick={() => adjust(-0.5)}
				size="sm"
				type="button"
				variant="outline"
			>
				−
			</Button>
			<span className="w-14 text-center font-semibold text-sm text-white">
				{displayed !== null ? `${displayed}°C` : "—"}
			</span>
			<Button
				className="h-6 w-6 rounded p-0 text-xs"
				disabled={mutation.isPending || (displayed ?? 0) >= 35}
				onClick={() => adjust(0.5)}
				size="sm"
				type="button"
				variant="outline"
			>
				+
			</Button>
		</div>
	);
}

export function DeviceCard({ device }: { device: DeviceItem }) {
	const secsAgo =
		device.lastPolledAt !== null
			? Math.round(
					(Date.now() - new Date(device.lastPolledAt).getTime()) / 1000,
				)
			: null;

	const supportsSetpoint =
		device.deviceType === "valve" && device.setpointC !== null;
	const hasHistory = device.deviceType !== "plug";

	const [historyOpen, setHistoryOpen] = useState(false);

	return (
		<>
			<div className="fade-in slide-in-from-bottom-2 flex animate-in flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-[2px] transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08]">
				<div className="flex items-center justify-between gap-2">
					<span className="font-semibold text-white">{device.name}</span>
					<div className="flex items-center gap-1">
						{hasHistory && (
							<button
								aria-label="Historia temperatury"
								className="rounded p-1 text-gray-400 transition-colors hover:text-white"
								onClick={() => setHistoryOpen(true)}
								type="button"
							>
								<History className="h-4 w-4" />
							</button>
						)}
						<Badge
							className={cn(
								"font-medium",
								TYPE_BADGE[device.deviceType] ?? "bg-gray-600 text-gray-100",
							)}
						>
							{device.deviceType}
						</Badge>
					</div>
				</div>

				<div className="flex items-center justify-between">
					<div className="font-bold text-2xl text-white">
						{device.temperatureC !== null ? `${device.temperatureC}°C` : "—"}
					</div>
					{supportsSetpoint && (
						<SetpointControl
							deviceId={device.id}
							initialSetpoint={device.setpointC}
						/>
					)}
				</div>

				<div className="flex items-center justify-between text-sm">
					<span className="flex items-center gap-1">
						<span
							className={`inline-block h-2 w-2 rounded-full ${device.isOnline ? "bg-green-400" : "bg-red-500"}`}
						/>
						<span
							className={device.isOnline ? "text-green-400" : "text-red-400"}
						>
							{device.isOnline ? "Online" : "Offline"}
						</span>
					</span>
					<div className="flex items-center gap-1">
						{device.isStale && (
							<span className="rounded border border-yellow-700/40 bg-yellow-900/40 px-1 text-xs text-yellow-300">
								Data may be outdated
							</span>
						)}
						<span className="text-gray-400">
							{secsAgo !== null ? `Updated ${secsAgo}s ago` : "—"}
						</span>
					</div>
				</div>
			</div>
			{hasHistory && (
				<TemperatureHistoryModal
					deviceName={device.name}
					onClose={() => setHistoryOpen(false)}
					open={historyOpen}
					tuyaDeviceId={device.tuyaDeviceId}
				/>
			)}
		</>
	);
}
