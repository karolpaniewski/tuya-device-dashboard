"use client";

import { Gauge, Plug, Thermometer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

const TYPE_ICON = {
	sensor: Thermometer,
	valve: Gauge,
	plug: Plug,
} as const;

const TYPE_ACCENT: Record<keyof typeof TYPE_ICON, string> = {
	sensor: "var(--cc-cyan)",
	valve: "var(--cc-amber)",
	plug: "var(--cc-emerald)",
};

const TYPE_ACCENT_BG: Record<keyof typeof TYPE_ICON, string> = {
	sensor: "rgba(34, 211, 238, 0.12)",
	valve: "rgba(251, 191, 36, 0.12)",
	plug: "rgba(52, 211, 153, 0.12)",
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
			<span className="w-14 text-center font-semibold text-foreground text-sm">
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

function DeviceSparkline({ deviceId }: { deviceId: string }) {
	const { data } = api.device.temperatureHistory.useQuery(
		{ tuyaDeviceId: deviceId, range: "24h" },
		{ staleTime: 60_000 },
	);
	const temps = (data ?? [])
		.map((r) => r.temperatureC)
		.filter((t): t is number => t !== null);
	if (temps.length < 2) return null;

	const min = Math.min(...temps);
	const max = Math.max(...temps);
	const range = max - min || 1;
	const points = temps
		.map((t, i) => {
			const x = (i / (temps.length - 1)) * 140;
			const y = 24 - ((t - min) / range) * 20;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");

	return (
		<svg
			height="26"
			preserveAspectRatio="none"
			style={{ display: "block", marginTop: 12, width: "100%" }}
			viewBox="0 0 140 26"
		>
			<title>Temperature trend, last 24 hours</title>
			<polyline
				fill="none"
				points={points}
				stroke="var(--cc-cyan)"
				strokeLinejoin="round"
				strokeWidth="1.6"
			/>
		</svg>
	);
}

function PlugToggleVisual({ isOn }: { isOn: boolean | null }) {
	const label = isOn === null ? "—" : isOn ? "ON" : "OFF";
	const labelColor =
		isOn === null
			? "var(--cc-text-faint)"
			: isOn
				? "var(--cc-cyan)"
				: "var(--cc-text-secondary)";

	return (
		<div className="mt-3.5 flex items-center justify-between">
			<span className="font-semibold text-[12px]" style={{ color: labelColor }}>
				{label}
			</span>
			<button
				aria-label="Plug control coming soon"
				className="flex h-6 w-[44px] flex-none cursor-not-allowed items-center rounded-xl p-[3px]"
				disabled
				style={{
					background:
						isOn === true
							? "linear-gradient(90deg, #0891b2, var(--cc-cyan))"
							: "rgba(255, 255, 255, 0.08)",
					border: `1px solid ${isOn === true ? "rgba(34, 211, 238, 0.5)" : "rgba(255, 255, 255, 0.12)"}`,
					boxShadow:
						isOn === true ? "0 0 16px rgba(34, 211, 238, 0.35)" : "none",
					justifyContent: isOn === true ? "flex-end" : "flex-start",
				}}
				title="Plug control coming soon"
				type="button"
			>
				<span
					className="h-[18px] w-[18px] rounded-full"
					style={{
						backgroundColor: isOn === true ? "var(--cc-bg)" : "#8b96a3",
					}}
				/>
			</button>
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

	const deviceType = device.deviceType as keyof typeof TYPE_ICON;
	const supportsSetpoint = deviceType === "valve" && device.setpointC !== null;
	const isPlug = deviceType === "plug";
	const isOn = isPlug
		? ((device as { isOn?: boolean | null }).isOn ?? null)
		: null;

	const BgIcon = TYPE_ICON[deviceType] ?? null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: card contains nested interactive controls (SetpointControl), preventing use of a <button> wrapper
		// biome-ignore lint/a11y/useKeyWithClickEvents: supplementary action; primary keyboard interaction is via drag handle
		<div
			className="fade-in slide-in-from-bottom-2 relative flex animate-in cursor-pointer flex-col overflow-hidden rounded-[18px] p-[17px] transition-colors duration-300"
			onClick={onClick}
			role="button"
			style={{
				background: device.isOnline
					? "linear-gradient(155deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))"
					: "linear-gradient(155deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))",
				border: `1px solid ${device.isOnline ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.06)"}`,
				opacity: device.isOnline ? 1 : 0.7,
			}}
			tabIndex={0}
		>
			{BgIcon && (
				<BgIcon
					aria-hidden="true"
					size={88}
					strokeWidth={1}
					style={{
						color: TYPE_ACCENT[deviceType],
						opacity: 0.08,
						pointerEvents: "none",
						position: "absolute",
						right: "0.875rem",
						top: "50%",
						transform: "translateY(-50%)",
					}}
				/>
			)}

			<div className="relative flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span
						className={cn(
							"mt-px h-[7px] w-[7px] shrink-0 rounded-full",
							device.isOnline && "animate-pulse",
						)}
						style={{
							backgroundColor: device.isOnline
								? "var(--cc-emerald)"
								: "var(--cc-rose)",
							boxShadow: device.isOnline
								? "0 0 8px var(--cc-emerald)"
								: "0 0 8px var(--cc-rose)",
						}}
					/>
					<span
						className="truncate font-semibold text-[13px]"
						style={{
							color: device.isOnline
								? "var(--cc-text-primary)"
								: "var(--cc-text-secondary)",
						}}
					>
						{device.name}
					</span>
				</div>
				<span
					className="shrink-0 rounded-[6px] px-[7px] py-[3px] font-mono text-[9px] tracking-[0.08em]"
					style={{
						backgroundColor: TYPE_ACCENT_BG[deviceType],
						color: TYPE_ACCENT[deviceType],
					}}
				>
					{device.deviceType.toUpperCase()}
				</span>
			</div>

			{deviceType === "valve" ? (
				<div className="relative mt-3.5 flex items-center justify-between gap-2">
					<div>
						<div
							className="font-mono text-[10px]"
							style={{ color: "var(--cc-text-faint)" }}
						>
							CURRENT
						</div>
						<div
							className="font-semibold text-[17px]"
							style={{ color: "var(--cc-text-primary)" }}
						>
							{device.temperatureC !== null ? `${device.temperatureC}°C` : "—"}
						</div>
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
			) : (
				<div
					className="relative mt-3.5 font-bold text-[28px] leading-none"
					style={{
						color: device.isOnline
							? "var(--cc-text-primary)"
							: "var(--cc-text-faint)",
					}}
				>
					{device.temperatureC !== null ? (
						<>
							{device.temperatureC}
							<span
								className="font-semibold text-[15px]"
								style={{ color: "var(--cc-text-muted)" }}
							>
								°C
							</span>
						</>
					) : (
						"—"
					)}
				</div>
			)}

			{deviceType === "sensor" && device.isOnline && (
				<DeviceSparkline deviceId={device.tuyaDeviceId} />
			)}

			{isPlug && <PlugToggleVisual isOn={isOn} />}

			<div className="relative mt-3.5 flex items-center justify-between gap-1">
				<span
					className="font-medium text-[11px]"
					style={{
						color: device.isOnline ? "var(--cc-emerald)" : "var(--cc-rose)",
					}}
				>
					{device.isOnline ? "Online" : "Offline"}
				</span>
				<div className="flex items-center gap-1.5">
					{device.isStale && (
						<span
							className="rounded px-1.5 py-px font-medium text-[10px]"
							style={{
								backgroundColor: "rgba(251, 191, 36, 0.12)",
								color: "var(--cc-amber)",
							}}
						>
							Outdated
						</span>
					)}
					<span
						className="font-mono text-[10px]"
						style={{ color: "var(--cc-text-faint)" }}
					>
						{secsAgo !== null ? `${secsAgo}s ago` : "—"}
					</span>
				</div>
			</div>
		</div>
	);
}
