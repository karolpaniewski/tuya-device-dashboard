"use client";

import { Gauge, Plug, Thermometer, Wifi } from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];
type RoomItem = RouterOutputs["room"]["list"][number];

type SortCol = "name" | "type" | "room" | "status";

const TYPE_BADGE: Record<string, string> = {
	sensor: "bg-blue-600 text-blue-100",
	valve: "bg-orange-600 text-orange-100",
	plug: "bg-gray-600 text-gray-100",
};

const TYPE_ICON = {
	sensor: Thermometer,
	valve: Gauge,
	plug: Plug,
} as const;

const PAGE_SIZE = 20;

interface Props {
	devices: DeviceItem[];
	rooms: Pick<RoomItem, "id" | "name">[];
	utils: ReturnType<typeof api.useUtils>;
}

export function DeviceTable({ devices, rooms, utils }: Props) {
	const [sortBy, setSortBy] = useState<SortCol>("name");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);

	const [errorById, setErrorById] = useState<Record<string, string>>({});
	const [savingById, setSavingById] = useState<Record<string, boolean>>({});

	const setDeviceRoom = api.room.setDeviceRoom.useMutation({
		onSuccess: () => {
			void utils.room.list.invalidate();
			void utils.device.overview.invalidate();
		},
	});

	function assign(deviceId: string, roomId: string | null) {
		setSavingById((p) => ({ ...p, [deviceId]: true }));
		setErrorById((p) => ({ ...p, [deviceId]: "" }));
		setDeviceRoom.mutate(
			{ deviceId, roomId },
			{
				onError: (e) => setErrorById((p) => ({ ...p, [deviceId]: e.message })),
				onSettled: () => setSavingById((p) => ({ ...p, [deviceId]: false })),
			},
		);
	}

	function toggleSort(col: SortCol) {
		if (sortBy === col) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortBy(col);
			setSortDir("asc");
		}
	}

	const filtered = devices
		.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
		.slice()
		.sort((a, b) => {
			let cmp = 0;
			if (sortBy === "name") cmp = a.name.localeCompare(b.name);
			else if (sortBy === "type")
				cmp = a.deviceType.localeCompare(b.deviceType);
			else if (sortBy === "room")
				cmp = (a.roomName ?? "").localeCompare(b.roomName ?? "");
			else if (sortBy === "status")
				cmp = Number(b.isOnline) - Number(a.isOnline);
			return sortDir === "asc" ? cmp : -cmp;
		});

	const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
	const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

	if (devices.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<Wifi className="mb-4 text-gray-600" size={48} />
				<p className="font-semibold text-foreground">No devices discovered</p>
				<p className="mt-1 max-w-xs text-gray-400 text-sm">
					Devices will appear here once the polling worker finds them on the
					LAN.
				</p>
			</div>
		);
	}

	const COLS: { key: SortCol; label: string }[] = [
		{ key: "name", label: "Name" },
		{ key: "type", label: "Type" },
		{ key: "room", label: "Room" },
		{ key: "status", label: "Status" },
	];

	return (
		<div>
			<Input
				className="mb-4 max-w-xs text-sm"
				onChange={(e) => {
					setSearch(e.target.value);
					setPage(0);
				}}
				placeholder="Search devices…"
				type="text"
				value={search}
			/>

			<div className="overflow-hidden rounded-xl border border-[var(--s-border)]">
				<table className="w-full text-sm">
					<thead className="border-[var(--s-border)] border-b bg-[var(--s-bg-alt)]">
						<tr>
							{COLS.map(({ key, label }) => (
								<th
									className="cursor-pointer px-4 py-3 text-left font-medium text-[var(--s-text-muted)] capitalize hover:text-[var(--s-text-secondary-hov)]"
									key={key}
									onClick={() => toggleSort(key)}
								>
									{label}
									{sortBy === key && (
										<span className="ml-1 text-[var(--s-text-dim)]">
											{sortDir === "asc" ? "↑" : "↓"}
										</span>
									)}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-[var(--s-divide)]">
						{paged.map((device) => (
							<tr className="hover:bg-[var(--s-row-hov)]" key={device.id}>
								<td className="px-4 py-3 text-foreground">{device.name}</td>
								<td className="px-4 py-3">
									<Badge
										className={cn(
											"font-medium",
											TYPE_BADGE[device.deviceType] ??
												"bg-gray-600 text-gray-100",
										)}
									>
										{(() => {
											const Icon =
												TYPE_ICON[device.deviceType as keyof typeof TYPE_ICON];
											return Icon ? <Icon className="shrink-0" /> : null;
										})()}
										{device.deviceType}
									</Badge>
								</td>
								<td className="px-4 py-3">
									<Select
										onValueChange={(v) =>
											assign(device.id, v === "unassigned" ? null : v)
										}
										value={device.roomId ?? "unassigned"}
									>
										<SelectTrigger
											className="h-8 w-40 text-xs"
											disabled={savingById[device.id]}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="unassigned">— Unassigned</SelectItem>
											{rooms.map((room) => (
												<SelectItem key={room.id} value={room.id}>
													{room.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{errorById[device.id] && (
										<ErrorMessage
											message={errorById[device.id]}
											variant="inline"
										/>
									)}
								</td>
								<td className="px-4 py-3">
									<Badge
										className="text-xs"
										variant={device.isOnline ? "default" : "outline"}
									>
										{device.isOnline ? "Online" : "Offline"}
									</Badge>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{totalPages > 1 && (
				<div className="mt-3 flex items-center gap-3">
					<Button
						disabled={page === 0}
						onClick={() => setPage((p) => p - 1)}
						size="sm"
						type="button"
						variant="outline"
					>
						Prev
					</Button>
					<span className="text-[var(--s-text-dim)] text-xs">
						{page + 1} / {totalPages}
					</span>
					<Button
						disabled={page >= totalPages - 1}
						onClick={() => setPage((p) => p + 1)}
						size="sm"
						type="button"
						variant="outline"
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
}
