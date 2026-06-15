"use client";

import { cn } from "~/lib/utils";

interface Room {
	roomId: string;
	roomName: string;
	badge: "OK" | "Too Cold" | "Too Hot" | null;
}

interface RoomSidebarProps {
	activeRoomId: string | null;
	onSelect: (roomId: string | null) => void;
	rooms: Room[];
}

const BADGE_DOT: Record<string, string> = {
	OK: "bg-green-400",
	"Too Cold": "bg-blue-400",
	"Too Hot": "bg-red-400",
};

export function RoomSidebar({
	activeRoomId,
	onSelect,
	rooms,
}: RoomSidebarProps) {
	return (
		<nav className="flex w-44 shrink-0 flex-col gap-1">
			<button
				className={cn(
					"flex cursor-pointer items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
					activeRoomId === null
						? "bg-[var(--s-bg-dim)] text-foreground"
						: "text-[var(--s-text-secondary)] hover:bg-[var(--s-bg-dim)] hover:text-[var(--s-text-secondary-hov)]",
				)}
				onClick={() => onSelect(null)}
				type="button"
			>
				All Rooms
			</button>
			{rooms.map((room) => (
				<button
					className={cn(
						"flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
						activeRoomId === room.roomId
							? "bg-[var(--s-bg-dim)] text-foreground"
							: "text-[var(--s-text-secondary)] hover:bg-[var(--s-bg-dim)] hover:text-[var(--s-text-secondary-hov)]",
					)}
					key={room.roomId}
					onClick={() => onSelect(room.roomId)}
					type="button"
				>
					<span
						className={cn(
							"h-2 w-2 shrink-0 rounded-full",
							room.badge ? BADGE_DOT[room.badge] : "bg-[var(--s-sidebar-dot)]",
						)}
					/>
					<span className="truncate">{room.roomName}</span>
				</button>
			))}
		</nav>
	);
}
