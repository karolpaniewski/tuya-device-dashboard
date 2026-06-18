type RoomStatus = "OK" | "Too Cold" | "Too Hot";

export const ROOM_STATUS_BADGE_CLASSES: Record<RoomStatus, string> = {
	OK: "bg-green-700 text-green-100",
	"Too Cold": "bg-blue-700 text-blue-100",
	"Too Hot": "bg-red-700 text-red-100",
};

export const ROOM_STATUS_DOT_CLASSES: Record<RoomStatus, string> = {
	OK: "bg-green-400",
	"Too Cold": "bg-blue-400",
	"Too Hot": "bg-red-400",
};
