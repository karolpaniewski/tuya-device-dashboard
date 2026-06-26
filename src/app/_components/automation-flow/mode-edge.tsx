"use client";

import {
	BaseEdge,
	type Edge,
	EdgeLabelRenderer,
	type EdgeProps,
	getSmoothStepPath,
} from "@xyflow/react";
import { X } from "lucide-react";

export type ModeEdgeType = Edge<{ onDelete: () => void }, "modeEdge">;

export function ModeEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	style,
	markerEnd,
	label,
	selected,
	data,
}: EdgeProps<ModeEdgeType>) {
	const [edgePath, labelX, labelY] = getSmoothStepPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	return (
		<>
			<BaseEdge
				id={id}
				interactionWidth={20}
				markerEnd={markerEnd}
				path={edgePath}
				style={style}
			/>
			{label && (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan"
						style={{
							position: "absolute",
							transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
							pointerEvents: "all",
						}}
					>
						<div
							className="relative rounded-md px-1.5 py-0.5 font-medium text-[11px] text-neutral-600"
							style={{ background: "rgba(255,255,255,0.92)" }}
						>
							{String(label)}
							{selected && data?.onDelete && (
								<button
									className="absolute top-1/2 -right-5 flex h-4 w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-neutral-300 bg-white p-0 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
									onClick={(e) => {
										e.stopPropagation();
										data.onDelete();
									}}
									type="button"
								>
									<X size={8} />
								</button>
							)}
						</div>
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
