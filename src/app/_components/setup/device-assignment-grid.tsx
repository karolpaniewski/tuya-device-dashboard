"use client";

import { useState } from "react";
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
							<span
								className={`rounded px-2 py-0.5 font-medium text-xs ${TYPE_BADGE[device.deviceType] ?? "bg-gray-600 text-gray-100"}`}
							>
								{device.deviceType}
							</span>
						</div>

						<select
							className="rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
							disabled={savingById[device.id]}
							onChange={(e) => assign(device.id, e.target.value || null)}
							value={device.roomId ?? ""}
						>
							<option value="">— Unassigned</option>
							{rooms.map((room) => (
								<option key={room.id} value={room.id}>
									{room.name}
								</option>
							))}
						</select>

						{savingById[device.id] && (
							<p className="text-gray-400 text-xs">Saving…</p>
						)}
						{errorById[device.id] && (
							<p className="text-red-400 text-xs">{errorById[device.id]}</p>
						)}
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
