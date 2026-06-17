"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export function SortableWidget({
	id,
	onHide,
	children,
	className,
}: {
	id: string;
	onHide: () => void;
	children: ReactNode;
	className?: string;
}) {
	const {
		attributes,
		isDragging,
		listeners,
		setNodeRef,
		transform,
		transition,
	} = useSortable({ id });

	return (
		<div
			className={cn("relative", className)}
			ref={setNodeRef}
			style={{
				opacity: isDragging ? 0.3 : 1,
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			{...attributes}
			{...listeners}
		>
			{children}
			<button
				aria-label="Hide widget"
				className="absolute top-2 right-2 rounded-full p-1 text-[var(--s-text-dim)] hover:bg-[var(--s-bg-dnd)] hover:text-foreground"
				onClick={(e) => {
					e.stopPropagation();
					if (!isDragging) onHide();
				}}
				type="button"
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	);
}
