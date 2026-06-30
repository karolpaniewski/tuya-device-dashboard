"use client";

import { format } from "date-fns";
import { useMemo, useState } from "react";
import { Badge } from "~/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

type EventRow = {
	id: number;
	createdAt: Date;
	eventType: string;
	roomId: string | null;
	deviceId: string | null;
	payload: string;
	roomName: string | null;
	deviceName: string | null;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
	threshold_breach: "Próg temperatury",
	toggle_heat: "Zmiana ogrzewania",
	connectivity_change: "Łączność",
	alert_sent: "Alert e-mail",
};

type BadgeVariant = "destructive" | "secondary" | "outline" | "default";

const EVENT_TYPE_VARIANT: Record<string, BadgeVariant> = {
	threshold_breach: "destructive",
	toggle_heat: "secondary",
	connectivity_change: "outline",
	alert_sent: "default",
};

function deriveDetails(eventType: string, payload: string): string {
	try {
		const data = JSON.parse(payload) as Record<string, unknown>;
		if (eventType === "threshold_breach") {
			return data.badge === "Too Cold" ? "Zbyt zimno" : "Zbyt gorąco";
		}
		if (eventType === "toggle_heat") {
			return data.pinnedOff ? "Ogrzewanie wyłączone" : "Ogrzewanie włączone";
		}
		if (eventType === "connectivity_change") {
			return data.isOnline ? "Urządzenie online" : "Urządzenie offline";
		}
		if (eventType === "alert_sent") {
			return `Alert e-mail (${String(data.count)} pokojów)`;
		}
	} catch {
		/* swallow */
	}
	return "—";
}

export function EventFeed() {
	const { data: events, isLoading } = api.event.list.useQuery();

	const [selectedRoomId, setSelectedRoomId] = useState<string>("all");
	const [selectedDeviceId, setSelectedDeviceId] = useState<string>("all");

	const roomItems = useMemo(() => {
		const map: Record<string, string> = { all: "Wszystkie pokoje" };
		for (const e of events ?? []) {
			if (e.roomId && e.roomName && !(e.roomId in map)) {
				map[e.roomId] = e.roomName;
			}
		}
		return map;
	}, [events]);

	const deviceItems = useMemo(() => {
		const map: Record<string, string> = { all: "Wszystkie urządzenia" };
		for (const e of events ?? []) {
			if (e.deviceId && e.deviceName && !(e.deviceId in map)) {
				map[e.deviceId] = e.deviceName;
			}
		}
		return map;
	}, [events]);

	const filtered = useMemo(() => {
		return (events ?? []).filter((e: EventRow) => {
			if (selectedRoomId !== "all" && e.roomId !== selectedRoomId) return false;
			if (selectedDeviceId !== "all" && e.deviceId !== selectedDeviceId)
				return false;
			return true;
		});
	}, [events, selectedRoomId, selectedDeviceId]);

	return (
		<div className="p-6">
			<h1
				className="mb-4 font-semibold text-xl"
				style={{ color: "var(--cc-text-primary)" }}
			>
				Dziennik zdarzeń
			</h1>

			<div className="mb-4 flex gap-3">
				<Select
					items={roomItems}
					onValueChange={(v) => setSelectedRoomId(v ?? "all")}
					value={selectedRoomId}
				>
					<SelectTrigger className="w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Object.entries(roomItems).map(([value, label]) => (
							<SelectItem key={value} value={value}>
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					items={deviceItems}
					onValueChange={(v) => setSelectedDeviceId(v ?? "all")}
					value={selectedDeviceId}
				>
					<SelectTrigger className="w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Object.entries(deviceItems).map(([value, label]) => (
							<SelectItem key={value} value={value}>
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div
				className="overflow-hidden rounded-lg border"
				style={{ borderColor: "var(--cc-glass-border)" }}
			>
				<table className="w-full text-sm">
					<thead>
						<tr
							className="border-b text-left"
							style={{
								borderColor: "var(--cc-glass-border)",
								color: "var(--cc-text-muted)",
							}}
						>
							<th className="px-4 py-3 font-medium">Czas</th>
							<th className="px-4 py-3 font-medium">Typ</th>
							<th className="px-4 py-3 font-medium">Dotyczy</th>
							<th className="px-4 py-3 font-medium">Szczegóły</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							Array.from({ length: 5 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder rows have no identity
								<tr key={i}>
									<td className="px-4 py-3">
										<Skeleton className="h-4 w-24" />
									</td>
									<td className="px-4 py-3">
										<Skeleton className="h-5 w-28" />
									</td>
									<td className="px-4 py-3">
										<Skeleton className="h-4 w-32" />
									</td>
									<td className="px-4 py-3">
										<Skeleton className="h-4 w-40" />
									</td>
								</tr>
							))
						) : filtered.length === 0 ? (
							<tr>
								<td
									className="px-4 py-8 text-center"
									colSpan={4}
									style={{ color: "var(--cc-text-muted)" }}
								>
									Brak zdarzeń z ostatnich 24h
								</td>
							</tr>
						) : (
							filtered.map((e: EventRow) => (
								<tr
									className="border-t hover:bg-[rgba(255,255,255,0.03)]"
									key={e.id}
									style={{ borderColor: "var(--cc-glass-border)" }}
								>
									<td
										className="px-4 py-3 tabular-nums"
										style={{ color: "var(--cc-text-muted)" }}
									>
										{format(new Date(e.createdAt), "dd.MM HH:mm")}
									</td>
									<td className="px-4 py-3">
										<Badge
											variant={EVENT_TYPE_VARIANT[e.eventType] ?? "default"}
										>
											{EVENT_TYPE_LABEL[e.eventType] ?? e.eventType}
										</Badge>
									</td>
									<td
										className="px-4 py-3"
										style={{ color: "var(--cc-text-primary)" }}
									>
										{e.roomName ?? e.deviceName ?? "—"}
									</td>
									<td
										className="px-4 py-3"
										style={{ color: "var(--cc-text-muted)" }}
									>
										{deriveDetails(e.eventType, e.payload)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
