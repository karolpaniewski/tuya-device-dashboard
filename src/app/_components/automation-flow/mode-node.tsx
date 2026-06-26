"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Badge } from "~/components/ui/badge";
import { formatModeSchedule, type ModeCanvasData } from "~/lib/mode-targeting";
import { cn } from "~/lib/utils";

export type ModeFlowNode = Node<{ mode: ModeCanvasData }, "mode">;

export function ModeNode({ data, selected }: NodeProps<ModeFlowNode>) {
	const { mode } = data;
	const connected = mode.isConnected;

	return (
		<div
			className={cn(
				"w-56 rounded-xl border bg-white/90 px-4 py-3.5 shadow-sm backdrop-blur-md transition-all duration-150 hover:shadow-md",
				selected
					? "border-neutral-400 ring-1 ring-neutral-300"
					: connected
						? "border-neutral-200"
						: "border-neutral-200 border-dashed",
			)}
			title={connected ? undefined : "Drag to connect"}
		>
			<div className="flex items-center justify-between gap-2">
				<p
					className={cn(
						"truncate font-medium text-[13.5px]",
						connected ? "text-neutral-900" : "text-neutral-400",
					)}
				>
					{mode.name}
				</p>
				{connected && (
					<Badge variant={mode.targetOn === true ? "default" : "outline"}>
						{mode.targetOn === true ? "ON" : "OFF"}
					</Badge>
				)}
			</div>
			<p className="mt-2.5 text-[11.5px] text-neutral-500 leading-snug">
				{formatModeSchedule(mode)}
			</p>
			<Handle
				className="!h-2 !w-2 !border-neutral-300 !bg-white"
				position={Position.Right}
				type="source"
			/>
		</div>
	);
}
