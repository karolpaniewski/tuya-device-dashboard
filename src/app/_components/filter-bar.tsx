"use client";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

export interface FilterState {
	roomId: string;
	search: string;
	status: "" | "offline" | "online";
	type: "" | "plug" | "sensor" | "valve";
}

interface FilterBarProps {
	activeFilterCount: number;
	filters: FilterState;
	hideRoomFilter?: boolean;
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
	hideRoomFilter,
	onClear,
	onRoomChange,
	onSearchChange,
	onStatusChange,
	onTypeChange,
	rooms,
}: FilterBarProps) {
	return (
		<div className="mb-6 flex flex-col gap-2 rounded-xl border border-[var(--s-border)] bg-[var(--s-bg-alt)] px-4 py-3 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
			<Input
				className="w-full text-sm sm:min-w-32 sm:flex-1"
				onChange={(e) => onSearchChange(e.target.value)}
				placeholder="Search by name…"
				type="text"
				value={filters.search}
			/>

			{!hideRoomFilter && (
				<Select
					onValueChange={(v) => onRoomChange(!v || v === "all" ? "" : v)}
					value={filters.roomId || "all"}
				>
					<SelectTrigger className="w-full sm:w-36">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Rooms</SelectItem>
						{rooms.map((room) => (
							<SelectItem key={room.roomId} value={room.roomId}>
								{room.roomName}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			<fieldset className="m-0 flex items-center gap-1 border-0 p-0">
				{TYPES.map((t) => (
					<Button
						key={t.value}
						onClick={() => onTypeChange(t.value)}
						size="sm"
						type="button"
						variant={filters.type === t.value ? "default" : "secondary"}
					>
						{t.label}
					</Button>
				))}
			</fieldset>

			<fieldset className="m-0 flex items-center gap-1 border-0 p-0">
				{STATUSES.map((s) => (
					<Button
						key={s.value}
						onClick={() => onStatusChange(s.value)}
						size="sm"
						type="button"
						variant={filters.status === s.value ? "default" : "secondary"}
					>
						{s.label}
					</Button>
				))}
			</fieldset>

			{activeFilterCount > 0 && (
				<Button onClick={onClear} size="sm" type="button" variant="ghost">
					Clear filters
				</Button>
			)}
		</div>
	);
}
