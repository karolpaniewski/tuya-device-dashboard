"use client";

import { Timer, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, type RouterOutputs } from "~/trpc/react";

type ModeItem = RouterOutputs["mode"]["list"][number];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

function includesAll(days: number[], target: number[]): boolean {
	return days.length === target.length && target.every((d) => days.includes(d));
}

function formatSchedule(mode: ModeItem): string {
	if (
		mode.daysOfWeek === null ||
		mode.fireHour === null ||
		mode.fireMinute === null
	) {
		return "MANUAL TRIGGER ONLY";
	}
	const time = `${String(mode.fireHour).padStart(2, "0")}:${String(
		mode.fireMinute,
	).padStart(2, "0")}`;
	const days = [...mode.daysOfWeek].sort((a, b) => a - b);
	const dayLabel = includesAll(days, [0, 1, 2, 3, 4, 5, 6])
		? "DAILY"
		: includesAll(days, WEEKDAYS)
			? "WEEKDAYS"
			: includesAll(days, WEEKENDS)
				? "WEEKENDS"
				: days
						.map((d) => DAY_LABELS[d])
						.join(" ")
						.toUpperCase();
	return `${time} · ${dayLabel}`;
}

function ModeRow({
	mode,
	siteId,
	utils,
}: {
	mode: ModeItem;
	siteId: string;
	utils: ReturnType<typeof api.useUtils>;
}) {
	const isScheduled = mode.daysOfWeek !== null;

	const triggerMutation = api.mode.trigger.useMutation({
		onError: (e) => toast.error(e.message),
		onSuccess: ({ results }) => {
			const applied = results.filter((r) => r.status === "applied").length;
			const skipped = results.filter(
				(r) => r.status === "skipped-pinned",
			).length;
			const failed = results.filter((r) => r.status === "failed").length;
			const parts = [
				applied > 0 ? `${applied} applied` : null,
				skipped > 0 ? `${skipped} skipped (pinned)` : null,
				failed > 0 ? `${failed} failed` : null,
			].filter((p): p is string => p !== null);
			if (failed > 0) {
				toast.error(`${mode.name}: ${parts.join(", ")}`);
			} else {
				toast.success(`${mode.name}: ${parts.join(", ") || "no rooms"}`);
			}
			void utils.mode.list.invalidate({ siteId });
		},
	});

	return (
		<div
			className="flex items-center gap-[11px] rounded-xl border px-3 py-2.5"
			style={{
				backgroundColor: "rgba(255, 255, 255, 0.03)",
				borderColor: "rgba(255, 255, 255, 0.06)",
			}}
		>
			<div
				className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]"
				style={{
					backgroundColor: isScheduled
						? "rgba(34, 211, 238, 0.14)"
						: "rgba(91, 103, 118, 0.18)",
				}}
			>
				<div
					className="h-[11px] w-[11px] rounded-full"
					style={{
						backgroundColor: isScheduled ? "var(--cc-cyan)" : "#7a8694",
						boxShadow: isScheduled ? "0 0 10px var(--cc-cyan)" : undefined,
					}}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div
					className="truncate font-medium text-[13px]"
					style={{
						color: isScheduled
							? "var(--cc-text-primary)"
							: "var(--cc-text-secondary)",
					}}
				>
					{mode.name}
				</div>
				<div
					className="truncate font-mono text-[10px]"
					style={{ color: "var(--cc-text-faint)" }}
				>
					{formatSchedule(mode)} · {mode.targets.length} room
					{mode.targets.length === 1 ? "" : "s"}
				</div>
			</div>
			<button
				aria-label={`Trigger ${mode.name}`}
				className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] transition-colors disabled:opacity-60"
				disabled={triggerMutation.isPending}
				onClick={() => triggerMutation.mutate({ id: mode.id })}
				style={{ backgroundColor: "rgba(34, 211, 238, 0.14)" }}
				type="button"
			>
				<Zap size={14} style={{ color: "var(--cc-cyan)" }} />
			</button>
		</div>
	);
}

export function CcModesWidget({ siteId }: { siteId: string }) {
	const utils = api.useUtils();
	const { data } = api.mode.list.useQuery({ siteId });
	const modes = data ?? [];
	const scheduledCount = modes.filter((m) => m.daysOfWeek !== null).length;

	return (
		<div
			className="rounded-[20px] border px-5 py-[18px]"
			style={{
				background:
					"linear-gradient(155deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))",
				borderColor: "var(--cc-glass-border)",
			}}
		>
			<div className="mb-3.5 flex items-center justify-between">
				<h2
					className="font-semibold text-[15px]"
					style={{ color: "var(--cc-text-primary)" }}
				>
					Modes
				</h2>
				<span
					className="font-mono text-[10px] tracking-[0.06em]"
					style={{ color: "var(--cc-cyan)" }}
				>
					{scheduledCount} SCHEDULED
				</span>
			</div>
			{modes.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-6 text-center">
					<Timer
						className="mb-2"
						size={28}
						style={{ color: "var(--cc-text-faint)" }}
					/>
					<p className="text-[12px]" style={{ color: "var(--cc-text-faint)" }}>
						No modes yet
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-[10px]">
					{modes.map((mode) => (
						<ModeRow key={mode.id} mode={mode} siteId={siteId} utils={utils} />
					))}
				</div>
			)}
		</div>
	);
}
