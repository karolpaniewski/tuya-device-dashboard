"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

export function SortableRoomGroup({
	roomId,
	children,
}: {
	roomId: string;
	children: ReactNode;
}) {
	const {
		attributes,
		isDragging,
		listeners,
		setNodeRef,
		transform,
		transition,
	} = useSortable({ id: roomId });

	return (
		<div
			className="flex items-start gap-2"
			ref={setNodeRef}
			style={{
				opacity: isDragging ? 0.4 : 1,
				transform: CSS.Transform.toString(transform),
				transition,
			}}
		>
			<button
				aria-label="Drag to reorder room"
				className="mt-1 shrink-0 cursor-grab touch-none rounded-full p-1 text-[var(--s-text-dim)] hover:bg-[var(--s-bg-dnd)] hover:text-foreground active:cursor-grabbing"
				type="button"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="h-4 w-4" />
			</button>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
