"use client";

import { useEffect, useState } from "react";
import type { RouterOutputs } from "~/trpc/react";

type RoomItem = RouterOutputs["device"]["overview"]["rooms"][number];

function alertSignature(rooms: RoomItem[]): string {
	return rooms
		.map((r) => r.roomId)
		.sort()
		.join(",");
}

export function CcAlertToast({ rooms }: { rooms: RoomItem[] }) {
	const alertingRooms = rooms.filter(
		(r) => r.badge === "Too Hot" || r.badge === "Too Cold",
	);
	const signature = alertSignature(alertingRooms);

	const [dismissed, setDismissed] = useState(false);
	const [lastSignature, setLastSignature] = useState(signature);

	useEffect(() => {
		if (signature !== lastSignature) {
			setLastSignature(signature);
			setDismissed(false);
		}
	}, [signature, lastSignature]);

	if (alertingRooms.length === 0 || dismissed) return null;

	const title =
		alertingRooms.length === 1
			? `${alertingRooms[0]?.roomName} needs attention`
			: `${alertingRooms.length} rooms need attention`;
	const subtitle =
		alertingRooms.length === 1
			? alertingRooms[0]?.badge
			: alertingRooms.map((r) => `${r.roomName} (${r.badge})`).join(", ");

	return (
		<div
			className="fixed bottom-[22px] left-[90px] z-20 flex items-center gap-[11px] rounded-[14px] border py-[11px] pr-4 pl-[13px] backdrop-blur-2xl"
			style={{
				background:
					"linear-gradient(150deg, rgba(251,113,133,0.18), rgba(20,12,16,0.85))",
				borderColor: "rgba(251, 113, 133, 0.4)",
				boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
			}}
		>
			<span
				className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]"
				style={{ backgroundColor: "rgba(251, 113, 133, 0.2)" }}
			>
				<span
					className="h-2 w-2 animate-pulse rounded-full"
					style={{
						backgroundColor: "var(--cc-rose)",
						boxShadow: "0 0 10px var(--cc-rose)",
					}}
				/>
			</span>
			<div>
				<div
					className="font-semibold text-[13px]"
					style={{ color: "var(--cc-text-primary)" }}
				>
					{title}
				</div>
				<div
					className="text-[11px]"
					style={{ color: "var(--cc-text-secondary)" }}
				>
					{subtitle}
				</div>
			</div>
			<button
				className="ml-1.5 font-semibold text-[11px]"
				onClick={() => setDismissed(true)}
				style={{ color: "var(--cc-rose)" }}
				type="button"
			>
				Dismiss
			</button>
		</div>
	);
}
