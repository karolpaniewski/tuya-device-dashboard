import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { DeviceCard } from "./device-card";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

const BADGE_STYLE: Record<string, string> = {
	OK: "bg-green-700 text-green-100",
	"Too Cold": "bg-blue-700 text-blue-100",
	"Too Hot": "bg-red-700 text-red-100",
};

interface RoomGroupProps {
	anomaly?: boolean;
	badge?: "OK" | "Too Cold" | "Too Hot" | null;
	devices: DeviceItem[];
	isUnassigned?: boolean;
	roomName: string;
	suggestion?: string | null;
}

export function RoomGroup({
	anomaly,
	badge,
	devices,
	isUnassigned,
	roomName,
	suggestion,
}: RoomGroupProps) {
	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<h2
					className={`font-semibold text-xl ${isUnassigned ? "text-gray-400" : "text-white"}`}
				>
					{roomName}
					<span className="ml-2 font-normal text-gray-500 text-sm">
						({devices.length})
					</span>
				</h2>
				{badge && (
					<Badge
						className={cn(
							"h-auto rounded-lg px-3 py-1 font-semibold text-sm",
							BADGE_STYLE[badge] ?? "",
						)}
					>
						{badge}
					</Badge>
				)}
			</div>
			{anomaly && suggestion && (
				<p className="text-amber-400 text-sm italic">{suggestion}</p>
			)}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{devices.map((device) => (
					<DeviceCard device={device} key={device.id} />
				))}
			</div>
		</section>
	);
}
