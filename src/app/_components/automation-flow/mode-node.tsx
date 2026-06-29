"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Badge } from "~/components/ui/badge";
import { formatModeSchedule, type ModeCanvasData } from "~/lib/mode-targeting";
import { cn } from "~/lib/utils";

export type ModeFlowNode = Node<{ mode: ModeCanvasData }, "mode">;

export function ModeNode({ data, selected }: NodeProps<ModeFlowNode>) {
	const { mode } = data;
	const { isActive } = mode;

	return (
		<div
			className={cn(
				"w-56 rounded-xl border bg-white/90 px-4 py-3.5 shadow-sm backdrop-blur-md transition-all duration-150 hover:shadow-md",
				isActive
					? "border-blue-400 ring-2 ring-blue-400"
					: selected
						? "border-neutral-400 ring-1 ring-neutral-300"
						: "border-neutral-200",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<p className="truncate font-medium text-[13.5px] text-neutral-900">
					{mode.name}
				</p>
				{mode.targetOn !== null && (
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
				isConnectable={true}
				position={Position.Right}
				type="source"
			/>
		</div>
	);
}
