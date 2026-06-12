"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

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

export function DeviceCard({
	device,
	onClick,
}: {
	device: DeviceItem;
	onClick?: () => void;
}) {
	const secsAgo =
		device.lastPolledAt !== null
			? Math.round(
					(Date.now() - new Date(device.lastPolledAt).getTime()) / 1000,
				)
			: null;

	const supportsSetpoint =
		device.deviceType === "valve" && device.setpointC !== null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: card contains nested interactive controls (SetpointControl), preventing use of a <button> wrapper
		// biome-ignore lint/a11y/useKeyWithClickEvents: supplementary action; primary keyboard interaction is via drag handle
		<div
			className={cn(
				"fade-in slide-in-from-bottom-2 flex animate-in cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-all duration-300",
				device.isOnline
					? "border-white/20 bg-white/[0.13] hover:border-white/30 hover:bg-white/[0.18]"
					: "border-white/10 bg-white/[0.04] opacity-50",
			)}
			onClick={onClick}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span
						className={cn(
							"mt-px h-2 w-2 shrink-0 rounded-full",
							device.isOnline
								? "animate-pulse bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)]"
								: "bg-gray-600",
						)}
					/>
					<span
						className={cn(
							"truncate font-semibold",
							device.isOnline ? "text-white" : "text-gray-400",
						)}
					>
						{device.name}
					</span>
				</div>
				<Badge
					className={cn(
						"shrink-0 font-medium",
						device.isOnline
							? (TYPE_BADGE[device.deviceType] ?? "bg-gray-600 text-gray-100")
							: "bg-gray-700 text-gray-400",
					)}
				>
					{device.deviceType}
				</Badge>
			</div>

			<div className="flex items-center justify-between">
				<div
					className={cn(
						"font-bold text-2xl",
						device.isOnline ? "text-white" : "text-gray-500",
					)}
				>
					{device.temperatureC !== null ? `${device.temperatureC}°C` : "—"}
				</div>
				{supportsSetpoint && (
					// biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only
					// biome-ignore lint/a11y/useKeyWithClickEvents: no keyboard action needed; parent card handles keyboard
					<div onClick={(e) => e.stopPropagation()}>
						<SetpointControl
							deviceId={device.id}
							initialSetpoint={device.setpointC}
						/>
					</div>
				)}
			</div>

			<div className="flex items-center justify-between gap-1 text-sm">
				<span
					className={cn(
						"text-xs font-medium",
						device.isOnline ? "text-emerald-400" : "text-gray-600",
					)}
				>
					{device.isOnline ? "Online" : "Offline"}
				</span>
				<div className="flex items-center gap-1">
					{device.isStale && (
						<span className="rounded border border-yellow-700/40 bg-yellow-900/40 px-1 text-xs text-yellow-300">
							Outdated
						</span>
					)}
					<span className="text-gray-500 text-xs">
						{secsAgo !== null ? `${secsAgo}s ago` : "—"}
					</span>
				</div>
			</div>
		</div>
	);
}
