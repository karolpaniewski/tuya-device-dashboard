"use client";

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

const BADGE_DOT_COLOR: Record<NonNullable<Room["badge"]>, string> = {
	OK: "var(--cc-emerald)",
	"Too Cold": "var(--cc-cyan)",
	"Too Hot": "var(--cc-amber)",
};

export function RoomSidebar({
	activeRoomId,
	onSelect,
	rooms,
}: RoomSidebarProps) {
	return (
		<nav className="flex w-44 shrink-0 flex-col gap-1">
			<button
				className="flex cursor-pointer items-center rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors"
				onClick={() => onSelect(null)}
				style={{
					backgroundColor:
						activeRoomId === null ? "rgba(255, 255, 255, 0.06)" : "transparent",
					color:
						activeRoomId === null
							? "var(--cc-text-primary)"
							: "var(--cc-text-secondary)",
				}}
				type="button"
			>
				All Rooms
			</button>
			{rooms.map((room) => {
				const active = activeRoomId === room.roomId;
				return (
					<button
						className="flex cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors"
						key={room.roomId}
						onClick={() => onSelect(room.roomId)}
						style={{
							backgroundColor: active
								? "rgba(255, 255, 255, 0.06)"
								: "transparent",
							color: active
								? "var(--cc-text-primary)"
								: "var(--cc-text-secondary)",
						}}
						type="button"
					>
						<span
							className="h-[7px] w-[7px] shrink-0 rounded-full"
							style={{
								backgroundColor: room.badge
									? BADGE_DOT_COLOR[room.badge]
									: "var(--cc-text-faint)",
								boxShadow: room.badge
									? `0 0 6px ${BADGE_DOT_COLOR[room.badge]}`
									: undefined,
							}}
						/>
						<span className="truncate">{room.roomName}</span>
					</button>
				);
			})}
		</nav>
	);
}
