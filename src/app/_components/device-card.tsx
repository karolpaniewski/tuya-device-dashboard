import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

const TYPE_BADGE: Record<string, string> = {
	sensor: "bg-blue-600 text-blue-100",
	valve: "bg-orange-600 text-orange-100",
	plug: "bg-gray-600 text-gray-100",
};

export function DeviceCard({ device }: { device: DeviceItem }) {
	const secsAgo =
		device.lastPolledAt !== null
			? Math.round(
					(Date.now() - new Date(device.lastPolledAt).getTime()) / 1000,
				)
			: null;

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-gray-700 bg-gray-800 p-4">
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

			<div className="font-bold text-2xl text-white">
				{device.temperatureC !== null ? `${device.temperatureC}°C` : "—"}
			</div>

			<div className="flex items-center justify-between text-sm">
				<span className="flex items-center gap-1">
					<span
						className={`inline-block h-2 w-2 rounded-full ${device.isOnline ? "bg-green-400" : "bg-red-500"}`}
					/>
					<span className={device.isOnline ? "text-green-400" : "text-red-400"}>
						{device.isOnline ? "Online" : "Offline"}
					</span>
				</span>
				<div className="flex items-center gap-1">
					{device.isStale && (
						<span className="rounded bg-yellow-100 px-1 text-xs text-yellow-800">
							Data may be outdated
						</span>
					)}
					<span className="text-gray-400">
						{secsAgo !== null ? `Updated ${secsAgo}s ago` : "—"}
					</span>
				</div>
			</div>
		</div>
	);
}
