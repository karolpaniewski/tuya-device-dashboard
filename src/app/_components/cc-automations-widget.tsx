"use client";

import { Timer } from "lucide-react";
import { toast } from "sonner";
import { api, type RouterOutputs } from "~/trpc/react";

type AutomationItem = RouterOutputs["automation"]["list"][number];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

function includesAll(days: number[], target: number[]): boolean {
	return days.length === target.length && target.every((d) => days.includes(d));
}

function formatSchedule(rule: AutomationItem): string {
	const time = `${String(rule.fireHour).padStart(2, "0")}:${String(
		rule.fireMinute,
	).padStart(2, "0")}`;
	const days = [...rule.daysOfWeek].sort((a, b) => a - b);
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

function AutomationRow({
	rule,
	siteId,
	utils,
}: {
	rule: AutomationItem;
	siteId: string;
	utils: ReturnType<typeof api.useUtils>;
}) {
	const mutation = api.automation.toggle.useMutation({
		onMutate: async (input) => {
			await utils.automation.list.cancel({ siteId });
			const previous = utils.automation.list.getData({ siteId });
			utils.automation.list.setData({ siteId }, (old) =>
				old?.map((r) =>
					r.id === input.id ? { ...r, isEnabled: input.isEnabled } : r,
				),
			);
			return { previous };
		},
		onError: (_err, _input, ctx) => {
			if (ctx?.previous)
				utils.automation.list.setData({ siteId }, ctx.previous);
			toast.error("Failed to update automation");
		},
		onSettled: () => void utils.automation.list.invalidate({ siteId }),
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
					backgroundColor: rule.isEnabled
						? "rgba(34, 211, 238, 0.14)"
						: "rgba(91, 103, 118, 0.18)",
				}}
			>
				<div
					className="h-[11px] w-[11px] rounded-full"
					style={{
						backgroundColor: rule.isEnabled ? "var(--cc-cyan)" : "#7a8694",
						boxShadow: rule.isEnabled ? "0 0 10px var(--cc-cyan)" : undefined,
					}}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div
					className="truncate font-medium text-[13px]"
					style={{
						color: rule.isEnabled
							? "var(--cc-text-primary)"
							: "var(--cc-text-secondary)",
					}}
				>
					{rule.name}
				</div>
				<div
					className="font-mono text-[10px]"
					style={{ color: "var(--cc-text-faint)" }}
				>
					{formatSchedule(rule)}
				</div>
			</div>
			<button
				aria-label={
					rule.isEnabled ? `Disable ${rule.name}` : `Enable ${rule.name}`
				}
				aria-pressed={rule.isEnabled}
				className="flex h-[21px] w-[38px] flex-none items-center rounded-full p-[3px] transition-colors disabled:opacity-60"
				disabled={mutation.isPending}
				onClick={() =>
					mutation.mutate({ id: rule.id, isEnabled: !rule.isEnabled })
				}
				style={{
					background: rule.isEnabled
						? "linear-gradient(90deg, var(--cc-cyan-dark), var(--cc-cyan))"
						: "rgba(255, 255, 255, 0.08)",
					boxShadow: rule.isEnabled
						? "0 0 12px rgba(34, 211, 238, 0.3)"
						: undefined,
					justifyContent: rule.isEnabled ? "flex-end" : "flex-start",
				}}
				type="button"
			>
				<span
					className="h-[15px] w-[15px] rounded-full"
					style={{
						backgroundColor: rule.isEnabled ? "var(--cc-bg)" : "#7a8694",
					}}
				/>
			</button>
		</div>
	);
}

export function CcAutomationsWidget({ siteId }: { siteId: string }) {
	const utils = api.useUtils();
	const { data } = api.automation.list.useQuery({ siteId });
	const rules = data ?? [];
	const activeCount = rules.filter((r) => r.isEnabled).length;

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
					Automations
				</h2>
				<span
					className="font-mono text-[10px] tracking-[0.06em]"
					style={{ color: "var(--cc-cyan)" }}
				>
					{activeCount} ACTIVE
				</span>
			</div>
			{rules.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-6 text-center">
					<Timer
						className="mb-2"
						size={28}
						style={{ color: "var(--cc-text-faint)" }}
					/>
					<p className="text-[12px]" style={{ color: "var(--cc-text-faint)" }}>
						No automation rules yet
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-[10px]">
					{rules.map((rule) => (
						<AutomationRow
							key={rule.id}
							rule={rule}
							siteId={siteId}
							utils={utils}
						/>
					))}
				</div>
			)}
		</div>
	);
}
