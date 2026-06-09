import type { RouterOutputs } from "~/trpc/react";
import { DeviceCard } from "./device-card";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

interface RoomGroupProps {
	roomName: string;
	devices: DeviceItem[];
	isUnassigned?: boolean;
}

export function RoomGroup({ roomName, devices, isUnassigned }: RoomGroupProps) {
	return (
		<section className="flex flex-col gap-4">
			<h2
				className={`font-semibold text-xl ${isUnassigned ? "text-gray-400" : "text-white"}`}
			>
				{roomName}
				<span className="ml-2 font-normal text-gray-500 text-sm">
					({devices.length})
				</span>
			</h2>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{devices.map((device) => (
					<DeviceCard device={device} key={device.id} />
				))}
			</div>
		</section>
	);
}
