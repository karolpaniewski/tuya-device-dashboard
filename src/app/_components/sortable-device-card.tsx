"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RouterOutputs } from "~/trpc/react";
import { DeviceCard } from "./device-card";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

export function SortableDeviceCard({
	device,
	onClick,
}: {
	device: DeviceItem;
	onClick?: () => void;
}) {
	const {
		attributes,
		isDragging,
		listeners,
		setNodeRef,
		transform,
		transition,
	} = useSortable({ id: device.id });

	return (
		<div
			ref={setNodeRef}
			style={{
				opacity: isDragging ? 0.3 : 1,
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			{...attributes}
			{...listeners}
		>
			<DeviceCard device={device} onClick={isDragging ? undefined : onClick} />
		</div>
	);
}
