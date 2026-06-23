"use client";

import { Plus, Timer, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { ModeForm } from "./mode-form";

export interface ModeRoomOption {
	id: string;
	name: string;
}

export interface ModeSummary {
	id: string;
	name: string;
	daysOfWeek: number[] | null;
	fireHour: number | null;
	fireMinute: number | null;
	targets: { roomId: string; roomName: string; targetOn: boolean }[];
}

interface Props {
	activeSiteId: string;
	utils: ReturnType<typeof api.useUtils>;
	rooms: ModeRoomOption[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDays(days: number[]) {
	return [...days]
		.sort((a, b) => a - b)
		.map((d) => DAY_LABELS[d])
		.join(" ");
}

function formatTime(hour: number, minute: number) {
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function scheduleSummary(mode: ModeSummary) {
	if (
		mode.daysOfWeek === null ||
		mode.fireHour === null ||
		mode.fireMinute === null
	) {
		return "Manual trigger only";
	}
	return `${formatDays(mode.daysOfWeek)} · ${formatTime(mode.fireHour, mode.fireMinute)}`;
}

export function ModeManager({ activeSiteId, utils, rooms }: Props) {
	const [showForm, setShowForm] = useState(false);
	const [editingMode, setEditingMode] = useState<ModeSummary | null>(null);

	const modesQuery = api.mode.list.useQuery({ siteId: activeSiteId });
	const legacyRulesQuery = api.automation.list.useQuery({ siteId: "all" });

	const invalidate = () => void utils.mode.list.invalidate();

	const deleteMutation = api.mode.delete.useMutation({
		onError: (e) => toast.error(e.message),
		onSuccess: () => {
			toast.success("Mode deleted");
			invalidate();
		},
	});

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
				toast.error(`Mode triggered: ${parts.join(", ")}`);
			} else {
				toast.success(`Mode triggered: ${parts.join(", ") || "no rooms"}`);
			}
		},
	});

	const confirmMigrationMutation = api.automation.confirmMigration.useMutation({
		onError: (e) => toast.error(e.message),
		onSuccess: ({ deletedCount }) => {
			toast.success(`Removed ${deletedCount} old rule(s)`);
			void utils.automation.list.invalidate();
		},
	});

	const modes = modesQuery.data ?? [];
	const legacyRules = legacyRulesQuery.data ?? [];

	function openCreate() {
		setEditingMode(null);
		setShowForm(true);
	}

	function openEdit(mode: ModeSummary) {
		setEditingMode(mode);
		setShowForm(true);
	}

	function closeForm() {
		setShowForm(false);
		setEditingMode(null);
	}

	return (
		<section>
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-foreground text-lg">Modes</h2>
				<Button onClick={openCreate} size="sm" type="button">
					<Plus size={14} />
					Add mode
				</Button>
			</div>

			{showForm && (
				<div className="mb-4">
					<ModeForm
						initialMode={editingMode ?? undefined}
						onClose={closeForm}
						rooms={rooms}
						utils={utils}
					/>
				</div>
			)}

			{legacyRules.length > 0 && (
				<div
					className="mb-4 flex flex-col gap-3 rounded-xl border p-4"
					style={{
						backgroundColor: "rgba(251, 191, 36, 0.06)",
						borderColor: "rgba(251, 191, 36, 0.3)",
					}}
				>
					<div>
						<p className="font-semibold text-foreground text-sm">
							Migrate old automation rules
						</p>
						<p className="text-[var(--cc-text-muted)] text-xs">
							These per-device rules still exist from before modes. Review them,
							then confirm to remove them permanently — they are not converted
							into modes automatically.
						</p>
					</div>
					<ul className="flex flex-col gap-1">
						{legacyRules.map((rule) => (
							<li className="text-[var(--cc-text-muted)] text-xs" key={rule.id}>
								{rule.name} — {rule.deviceName} · {rule.roomName ?? "–"} ·{" "}
								{formatTime(rule.fireHour, rule.fireMinute)} ·{" "}
								{rule.targetSetpointC}°C
							</li>
						))}
					</ul>
					<div>
						<Button
							disabled={confirmMigrationMutation.isPending}
							onClick={() => {
								if (
									confirm(
										`Remove all ${legacyRules.length} old automation rule(s)? This cannot be undone.`,
									)
								) {
									confirmMigrationMutation.mutate();
								}
							}}
							size="sm"
							type="button"
							variant="destructive"
						>
							Confirm and remove old rules
						</Button>
					</div>
				</div>
			)}

			<ul className="flex flex-col gap-2">
				{modes.map((mode) => (
					<li
						className="flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
						key={mode.id}
						style={{
							background: "var(--cc-glass-bg)",
							borderColor: "var(--cc-glass-border)",
						}}
					>
						<div className="flex flex-col gap-1">
							<div className="flex flex-wrap items-center gap-2">
								<span
									className="font-medium"
									style={{ color: "var(--cc-text-primary)" }}
								>
									{mode.name}
								</span>
								{mode.targets.map((t) => (
									<Badge
										key={t.roomId}
										variant={t.targetOn ? "default" : "outline"}
									>
										{t.roomName} {t.targetOn ? "ON" : "OFF"}
									</Badge>
								))}
							</div>
							<p className="text-[var(--cc-text-muted)] text-xs">
								{scheduleSummary(mode)}
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								disabled={triggerMutation.isPending}
								onClick={() => triggerMutation.mutate({ id: mode.id })}
								size="sm"
								type="button"
								variant="outline"
							>
								<Zap size={14} />
								Trigger
							</Button>
							<Button
								onClick={() => openEdit(mode)}
								size="sm"
								type="button"
								variant="outline"
							>
								Edit
							</Button>
							<Button
								disabled={deleteMutation.isPending}
								onClick={() => {
									if (confirm(`Delete mode "${mode.name}"?`)) {
										deleteMutation.mutate({ id: mode.id });
									}
								}}
								size="icon"
								title="Delete mode"
								type="button"
								variant="destructive"
							>
								<Trash2 size={14} />
							</Button>
						</div>
					</li>
				))}
				{modes.length === 0 && (
					<li className="flex flex-col items-center justify-center py-16 text-center">
						<Timer
							className="mb-4"
							size={48}
							style={{ color: "var(--cc-text-faint)" }}
						/>
						<p className="font-semibold text-foreground">
							No modes yet. Add one to get started.
						</p>
					</li>
				)}
			</ul>
		</section>
	);
}
