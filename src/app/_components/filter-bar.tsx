"use client";

export interface FilterState {
	roomId: string;
	type: "" | "sensor" | "valve" | "plug";
	status: "" | "online" | "offline";
	search: string;
}

interface FilterBarProps {
	activeFilterCount: number;
	filters: FilterState;
	onClear: () => void;
	onRoomChange: (roomId: string) => void;
	onSearchChange: (search: string) => void;
	onStatusChange: (status: FilterState["status"]) => void;
	onTypeChange: (type: FilterState["type"]) => void;
	rooms: { roomId: string; roomName: string }[];
}

const TYPES: { label: string; value: FilterState["type"] }[] = [
	{ label: "All", value: "" },
	{ label: "Sensor", value: "sensor" },
	{ label: "Valve", value: "valve" },
	{ label: "Plug", value: "plug" },
];

const STATUSES: { label: string; value: FilterState["status"] }[] = [
	{ label: "All", value: "" },
	{ label: "Online", value: "online" },
	{ label: "Offline", value: "offline" },
];

export function FilterBar({
	activeFilterCount,
	filters,
	onClear,
	onRoomChange,
	onSearchChange,
	onStatusChange,
	onTypeChange,
	rooms,
}: FilterBarProps) {
	return (
		<div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
			<input
				className="min-w-32 flex-1 rounded border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				onChange={(e) => onSearchChange(e.target.value)}
				placeholder="Search by name…"
				type="text"
				value={filters.search}
			/>

			<select
				className="rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
				onChange={(e) => onRoomChange(e.target.value)}
				value={filters.roomId}
			>
				<option value="">All Rooms</option>
				{rooms.map((room) => (
					<option key={room.roomId} value={room.roomId}>
						{room.roomName}
					</option>
				))}
			</select>

			<fieldset className="m-0 flex items-center gap-1 border-0 p-0">
				{TYPES.map((t) => (
					<button
						className={`rounded px-2 py-1 font-medium text-xs ${
							filters.type === t.value
								? "bg-blue-600 text-white"
								: "bg-gray-700 text-gray-300 hover:bg-gray-600"
						}`}
						key={t.value}
						onClick={() => onTypeChange(t.value)}
						type="button"
					>
						{t.label}
					</button>
				))}
			</fieldset>

			<fieldset className="m-0 flex items-center gap-1 border-0 p-0">
				{STATUSES.map((s) => (
					<button
						className={`rounded px-2 py-1 font-medium text-xs ${
							filters.status === s.value
								? "bg-blue-600 text-white"
								: "bg-gray-700 text-gray-300 hover:bg-gray-600"
						}`}
						key={s.value}
						onClick={() => onStatusChange(s.value)}
						type="button"
					>
						{s.label}
					</button>
				))}
			</fieldset>

			{activeFilterCount > 0 && (
				<button
					className="text-gray-400 text-xs hover:text-white"
					onClick={onClear}
					type="button"
				>
					Clear filters
				</button>
			)}
		</div>
	);
}
