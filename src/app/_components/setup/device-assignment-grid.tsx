"use client";

import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { ErrorMessage } from "~/components/ui/error-message";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];
type RoomItem = RouterOutputs["room"]["list"][number];

const TYPE_BADGE: Record<string, string> = {
	sensor: "bg-blue-600 text-blue-100",
	valve: "bg-orange-600 text-orange-100",
	plug: "bg-gray-600 text-gray-100",
};

interface Props {
	devices: DeviceItem[];
	rooms: Pick<RoomItem, "id" | "name">[];
	utils: ReturnType<typeof api.useUtils>;
}

export function DeviceAssignmentGrid({ devices, rooms, utils }: Props) {
	const [errorById, setErrorById] = useState<Record<string, string>>({});
	const [savingById, setSavingById] = useState<Record<string, boolean>>({});

	const setDeviceRoom = api.room.setDeviceRoom.useMutation({
		onSuccess: () => {
			void utils.room.list.invalidate();
			void utils.device.overview.invalidate();
		},
	});

	function assign(deviceId: string, roomId: string | null) {
		setSavingById((p) => ({ ...p, [deviceId]: true }));
		setErrorById((p) => ({ ...p, [deviceId]: "" }));
		setDeviceRoom.mutate(
			{ deviceId, roomId },
			{
				onSettled: () => setSavingById((p) => ({ ...p, [deviceId]: false })),
				onError: (e) => setErrorById((p) => ({ ...p, [deviceId]: e.message })),
			},
		);
	}

	return (
		<section>
			<h2 className="mb-4 font-semibold text-lg text-white">
				Device Assignments
			</h2>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{devices.map((device) => (
					<div
						className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-800 p-4"
						key={device.id}
					>
						<div className="flex items-center justify-between gap-2">
							<span className="font-semibold text-white">{device.name}</span>
							<Badge
								className={cn(
									"font-medium",
									TYPE_BADGE[device.deviceType] ?? "bg-gray-600 text-gray-100",
								)}
							>
								{device.deviceType}
							</Badge>
						</div>

						<Select
							onValueChange={(value) =>
								assign(device.id, value === "unassigned" ? null : value)
							}
							value={device.roomId ?? "unassigned"}
						>
							<SelectTrigger
								className="w-full"
								disabled={savingById[device.id]}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="unassigned">— Unassigned</SelectItem>
								{rooms.map((room) => (
									<SelectItem key={room.id} value={room.id}>
										{room.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{savingById[device.id] && (
							<p className="text-gray-400 text-xs">Saving…</p>
						)}
						<ErrorMessage message={errorById[device.id]} variant="inline" />
					</div>
				))}
				{devices.length === 0 && (
					<p className="col-span-full text-gray-500 text-sm">
						No devices discovered yet.
					</p>
				)}
			</div>
		</section>
	);
}
