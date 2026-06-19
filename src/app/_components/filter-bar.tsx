"use client";

import { Search } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";

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

function ChipButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: string;
	onClick: () => void;
}) {
	return (
		<button
			aria-pressed={active}
			className="rounded-[10px] px-3.5 py-2 font-semibold text-[12px] transition-colors"
			onClick={onClick}
			style={{
				backgroundColor: active
					? "rgba(34, 211, 238, 0.15)"
					: "rgba(255, 255, 255, 0.04)",
				border: `1px solid ${active ? "rgba(34, 211, 238, 0.5)" : "rgba(255, 255, 255, 0.08)"}`,
				color: active ? "var(--cc-cyan)" : "var(--cc-text-secondary)",
			}}
			type="button"
		>
			{children}
		</button>
	);
}

function SegmentButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: string;
	onClick: () => void;
}) {
	return (
		<button
			aria-pressed={active}
			className="rounded-[8px] px-3 py-1.5 font-semibold text-[12px] transition-colors"
			onClick={onClick}
			style={{
				backgroundColor: active ? "rgba(34, 211, 238, 0.18)" : "transparent",
				color: active ? "var(--cc-cyan)" : "var(--cc-text-secondary)",
			}}
			type="button"
		>
			{children}
		</button>
	);
}

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
	const roomItems = Object.fromEntries([
		["all", "All Rooms"],
		...rooms.map((room) => [room.roomId, room.roomName]),
	]);

	return (
		<div
			className="mb-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
			style={{ color: "var(--cc-text-primary)" }}
		>
			<div
				className="flex w-full items-center gap-2 rounded-[11px] px-[13px] py-[9px] sm:min-w-[200px] sm:flex-1"
				style={{
					backgroundColor: "rgba(255, 255, 255, 0.04)",
					border: "1px solid rgba(255, 255, 255, 0.09)",
				}}
			>
				<Search
					className="shrink-0"
					size={14}
					style={{ color: "var(--cc-text-muted)" }}
				/>
				<input
					className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--cc-text-muted)]"
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Search devices…"
					style={{ color: "var(--cc-text-primary)" }}
					type="text"
					value={filters.search}
				/>
			</div>

			{!hideRoomFilter && (
				<Select
					items={roomItems}
					onValueChange={(v) => onRoomChange(!v || v === "all" ? "" : v)}
					value={filters.roomId || "all"}
				>
					<SelectTrigger
						className="w-full rounded-[11px] text-[13px] sm:w-36"
						style={{
							backgroundColor: "rgba(255, 255, 255, 0.04)",
							borderColor: "rgba(255, 255, 255, 0.09)",
							color: "var(--cc-text-secondary)",
						}}
					>
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

			<fieldset className="m-0 flex items-center gap-1.5 border-0 p-0">
				{TYPES.map((t) => (
					<ChipButton
						active={filters.type === t.value}
						key={t.value}
						onClick={() => onTypeChange(t.value)}
					>
						{t.label}
					</ChipButton>
				))}
			</fieldset>

			<fieldset
				className="m-0 flex items-center gap-1.5 rounded-[11px] border-0 p-1"
				style={{
					backgroundColor: "rgba(255, 255, 255, 0.04)",
					border: "1px solid rgba(255, 255, 255, 0.08)",
				}}
			>
				{STATUSES.map((s) => (
					<SegmentButton
						active={filters.status === s.value}
						key={s.value}
						onClick={() => onStatusChange(s.value)}
					>
						{s.label}
					</SegmentButton>
				))}
			</fieldset>

			{activeFilterCount > 0 && (
				<button
					className={cn(
						"rounded-[10px] px-3 py-2 font-semibold text-[12px] transition-colors hover:text-[var(--cc-text-primary)]",
					)}
					onClick={onClear}
					style={{ color: "var(--cc-text-secondary)" }}
					type="button"
				>
					Clear filters
				</button>
			)}
		</div>
	);
}
