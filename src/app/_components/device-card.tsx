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
		<div className="fade-in slide-in-from-bottom-2 flex animate-in flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-[2px] transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08]">
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
						<span className="rounded border border-yellow-700/40 bg-yellow-900/40 px-1 text-xs text-yellow-300">
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
