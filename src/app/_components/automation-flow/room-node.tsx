"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Home } from "lucide-react";
import { cn } from "~/lib/utils";

export type RoomFlowNode = Node<
	{ roomName: string; deviceCount: number },
	"room"
>;

export function RoomNode({ data, selected }: NodeProps<RoomFlowNode>) {
	return (
		<div
			className={cn(
				"w-56 rounded-xl border bg-neutral-900/95 px-4 py-3.5 text-white shadow-md backdrop-blur-md transition-all duration-150 hover:shadow-lg",
				selected
					? "border-neutral-500 ring-1 ring-neutral-400"
					: "border-neutral-700",
			)}
		>
			<Handle
				className="!h-2 !w-2 !border-neutral-300 !bg-white"
				position={Position.Left}
				type="target"
			/>
			<div className="flex items-center gap-2.5">
				<div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-white/10">
					<Home size={17} strokeWidth={1.75} />
				</div>
				<div className="min-w-0">
					<p className="truncate font-medium text-[13.5px]">{data.roomName}</p>
					<p className="text-[11px] text-neutral-400 tracking-wide">
						{data.deviceCount} device{data.deviceCount === 1 ? "" : "s"}
					</p>
				</div>
			</div>
			<Handle
				className="!h-2 !w-2 !border-neutral-300 !bg-white"
				isConnectable={false}
				position={Position.Right}
				type="source"
			/>
		</div>
	);
}
