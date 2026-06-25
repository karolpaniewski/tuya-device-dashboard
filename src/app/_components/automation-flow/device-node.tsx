"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Gauge, Plug, Thermometer } from "lucide-react";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

export type DeviceFlowNode = Node<{ device: DeviceItem }, "device">;

const TYPE_ICON = {
	plug: Plug,
	sensor: Thermometer,
	valve: Gauge,
} as const;

const TYPE_ACCENT: Record<keyof typeof TYPE_ICON, string> = {
	plug: "var(--cc-emerald)",
	sensor: "var(--cc-cyan)",
	valve: "var(--cc-amber)",
};

export function DeviceNode({ data, selected }: NodeProps<DeviceFlowNode>) {
	const { device } = data;
	const deviceType = device.deviceType as keyof typeof TYPE_ICON;
	const Icon = TYPE_ICON[deviceType];

	return (
		<div
			className={cn(
				"w-56 rounded-xl border bg-white/90 px-4 py-3.5 shadow-sm backdrop-blur-md transition-all duration-150 hover:shadow-md",
				selected
					? "border-neutral-400 ring-1 ring-neutral-300"
					: "border-neutral-200",
			)}
		>
			<Handle
				className="!h-2 !w-2 !border-neutral-300 !bg-white"
				position={Position.Left}
				type="target"
			/>
			<div className="flex items-center gap-2.5">
				<div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-neutral-100">
					<Icon
						size={17}
						strokeWidth={1.75}
						style={{ color: TYPE_ACCENT[deviceType] }}
					/>
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-[13.5px] text-neutral-900">
						{device.name}
					</p>
					<div className="flex items-center gap-1.5">
						<span
							className={cn(
								"h-[6px] w-[6px] shrink-0 rounded-full",
								device.isOnline && "animate-pulse",
							)}
							style={{
								backgroundColor: device.isOnline
									? "var(--cc-emerald)"
									: "var(--cc-rose)",
								boxShadow: device.isOnline
									? "0 0 6px var(--cc-emerald)"
									: "0 0 6px var(--cc-rose)",
							}}
						/>
						<p className="text-[11px] text-neutral-400 tracking-wide">
							{device.isOnline ? "Online" : "Offline"}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
