"use client";

import { Plus, Timer, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";
import { AutomationForm } from "./automation-form";

export interface ValveDeviceOption {
	id: string;
	name: string;
	roomName: string | null;
}

interface Props {
	activeSiteId: string;
	utils: ReturnType<typeof api.useUtils>;
	valveDevices: ValveDeviceOption[];
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

export function AutomationManager({
	activeSiteId,
	utils,
	valveDevices,
}: Props) {
	const [showForm, setShowForm] = useState(false);
	const rulesQuery = api.automation.list.useQuery({ siteId: activeSiteId });

	const invalidate = () => void utils.automation.list.invalidate();

	const toggleMutation = api.automation.toggle.useMutation({
		onError: (e) => toast.error(e.message),
		onSuccess: invalidate,
	});

	const deleteMutation = api.automation.delete.useMutation({
		onError: (e) => toast.error(e.message),
		onSuccess: () => {
			toast.success("Rule deleted");
			invalidate();
		},
	});

	const rules = rulesQuery.data ?? [];

	return (
		<section>
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-foreground text-lg">Automations</h2>
				<Button onClick={() => setShowForm((s) => !s)} size="sm" type="button">
					<Plus size={14} />
					Add rule
				</Button>
			</div>

			{showForm && (
				<div className="mb-4">
					<AutomationForm
						onClose={() => setShowForm(false)}
						utils={utils}
						valveDevices={valveDevices}
					/>
				</div>
			)}

			<ul className="flex flex-col gap-2">
				{rules.map((rule) => (
					<li
						className="flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
						key={rule.id}
						style={{
							background: "var(--cc-glass-bg)",
							borderColor: "var(--cc-glass-border)",
						}}
					>
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<span
									className="font-medium"
									style={{ color: "var(--cc-text-primary)" }}
								>
									{rule.name}
								</span>
								<Badge variant={rule.isEnabled ? "default" : "outline"}>
									{rule.isEnabled ? "Enabled" : "Disabled"}
								</Badge>
							</div>
							<p className="text-[var(--cc-text-muted)] text-xs">
								{rule.deviceName} · {rule.roomName ?? "–"} ·{" "}
								{formatDays(rule.daysOfWeek)} ·{" "}
								{formatTime(rule.fireHour, rule.fireMinute)} ·{" "}
								{rule.targetSetpointC}°C ·{" "}
								{rule.tempThresholdC !== null
									? `< ${rule.tempThresholdC}°C`
									: "—"}
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								disabled={toggleMutation.isPending}
								onClick={() =>
									toggleMutation.mutate({
										id: rule.id,
										isEnabled: !rule.isEnabled,
									})
								}
								size="sm"
								type="button"
								variant="outline"
							>
								{rule.isEnabled ? "Disable" : "Enable"}
							</Button>
							<Button
								disabled={deleteMutation.isPending}
								onClick={() => {
									if (confirm(`Delete rule "${rule.name}"?`)) {
										deleteMutation.mutate({ id: rule.id });
									}
								}}
								size="icon"
								title="Delete rule"
								type="button"
								variant="destructive"
							>
								<Trash2 size={14} />
							</Button>
						</div>
					</li>
				))}
				{rules.length === 0 && (
					<li className="flex flex-col items-center justify-center py-16 text-center">
						<Timer className="mb-4 text-gray-600" size={48} />
						<p className="font-semibold text-foreground">
							No automation rules yet. Add one to get started.
						</p>
					</li>
				)}
			</ul>
		</section>
	);
}
