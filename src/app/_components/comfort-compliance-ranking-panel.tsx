"use client";

import { ListOrdered } from "lucide-react";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";

function severityColor(pctOutOfThreshold: number): string {
	if (pctOutOfThreshold >= 50) return "var(--cc-rose)";
	if (pctOutOfThreshold >= 15) return "var(--cc-amber)";
	if (pctOutOfThreshold > 0) return "var(--cc-cyan)";
	return "var(--cc-emerald)";
}

function RankingRow({
	room,
	onSelect,
}: {
	room: {
		roomId: string;
		roomName: string;
		pctOutOfThreshold: number | null;
		avgDegreesOffThreshold: number | null;
		daysWithData: number;
	};
	onSelect: (roomId: string) => void;
}) {
	const hasData = room.pctOutOfThreshold !== null;
	const barColor = hasData
		? severityColor(room.pctOutOfThreshold as number)
		: "var(--cc-text-faint)";

	return (
		<button
			className="flex w-full flex-col gap-1.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
			onClick={() => onSelect(room.roomId)}
			type="button"
		>
			<div className="flex items-center justify-between gap-3">
				<span
					className="min-w-0 flex-1 truncate font-medium text-[13px]"
					style={{ color: "var(--cc-text-primary)" }}
				>
					{room.roomName}
				</span>
				{hasData ? (
					<span
						className="shrink-0 font-mono font-semibold text-[13px]"
						style={{ color: barColor }}
					>
						{(room.pctOutOfThreshold as number).toFixed(0)}%
					</span>
				) : (
					<span
						className="shrink-0 text-[12px]"
						style={{ color: "var(--cc-text-faint)" }}
					>
						No data
					</span>
				)}
			</div>
			<div className="h-1.5 w-full rounded-[3px] bg-white/[0.06]">
				<div
					className="h-full rounded-[3px]"
					style={{
						backgroundColor: barColor,
						width: hasData
							? `${Math.min(100, room.pctOutOfThreshold as number)}%`
							: "0%",
					}}
				/>
			</div>
			<div
				className="flex items-center gap-2 text-[11px]"
				style={{ color: "var(--cc-text-faint)" }}
			>
				{room.avgDegreesOffThreshold !== null && (
					<span>avg {room.avgDegreesOffThreshold.toFixed(1)}° off</span>
				)}
				{room.daysWithData < 7 && (
					<span>
						{room.avgDegreesOffThreshold !== null && "· "}based on{" "}
						{room.daysWithData} of 7 days
					</span>
				)}
			</div>
		</button>
	);
}

export function ComfortComplianceRankingPanel({
	siteId,
	onRoomSelect,
}: {
	siteId: string;
	onRoomSelect: (roomId: string) => void;
}) {
	const { data, isLoading } = api.device.comfortComplianceRanking.useQuery({
		siteId,
	});

	return (
		<div
			className="rounded-[20px] border p-5"
			style={{
				background:
					"linear-gradient(155deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))",
				borderColor: "var(--cc-glass-border)",
			}}
		>
			<div className="flex items-center gap-2">
				<ListOrdered
					className="h-3.5 w-3.5"
					style={{ color: "var(--cc-text-muted)" }}
				/>
				<h2
					className="font-semibold text-[15px]"
					style={{ color: "var(--cc-text-primary)" }}
				>
					Comfort Compliance Ranking
				</h2>
			</div>
			<div
				className="mt-1 font-mono text-[11px]"
				style={{ color: "var(--cc-text-faint)" }}
			>
				WORST TO BEST · LAST 7 DAYS
			</div>
			{isLoading ? (
				<div className="mt-3 flex flex-col gap-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton
							className="h-14 w-full"
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
							key={i}
						/>
					))}
				</div>
			) : !data || data.length === 0 ? (
				<div
					className="flex items-center justify-center text-sm"
					style={{ color: "var(--cc-text-faint)", height: 120 }}
				>
					No rooms
				</div>
			) : (
				<div className="mt-2 flex flex-col gap-1">
					{data.map((room) => (
						<RankingRow key={room.roomId} onSelect={onRoomSelect} room={room} />
					))}
				</div>
			)}
		</div>
	);
}
