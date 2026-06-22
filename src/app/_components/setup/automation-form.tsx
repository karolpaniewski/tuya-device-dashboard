"use client";

import { useState } from "react";
import { toast } from "sonner";
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
import { api } from "~/trpc/react";
import type { ValveDeviceOption } from "./automation-manager";

interface Props {
	onClose: () => void;
	utils: ReturnType<typeof api.useUtils>;
	valveDevices: ValveDeviceOption[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AutomationForm({ onClose, utils, valveDevices }: Props) {
	const [name, setName] = useState("");
	const [deviceId, setDeviceId] = useState(valveDevices[0]?.id ?? "");
	const [days, setDays] = useState<number[]>([]);
	const [time, setTime] = useState("");
	const [targetSetpointC, setTargetSetpointC] = useState("");
	const [tempThresholdC, setTempThresholdC] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	const createMutation = api.automation.create.useMutation({
		onError: (e) => {
			if (e.message === "RULE_CONFLICT") {
				setFormError(
					"A rule already targets this room at the same time on one or more of the selected days.",
				);
			} else if (e.message === "NOT_A_VALVE") {
				setFormError("Only valve devices can be targeted.");
			} else {
				setFormError(e.message);
			}
		},
		onSuccess: () => {
			toast.success("Rule created");
			void utils.automation.list.invalidate();
			onClose();
		},
	});

	function handleDecimalChange(raw: string, setter: (value: string) => void) {
		const normalized = raw.replace(",", ".");
		if (/^\d*\.?\d*$/.test(normalized)) {
			setter(normalized);
		}
	}

	function handleTimeChange(raw: string) {
		const digits = raw.replace(/\D/g, "").slice(0, 4);
		setTime(
			digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits,
		);
	}

	function toggleDay(day: number) {
		setDays((prev) =>
			prev.includes(day)
				? prev.filter((d) => d !== day)
				: [...prev, day].sort((a, b) => a - b),
		);
	}

	if (valveDevices.length === 0) {
		return (
			<div
				className="rounded-xl border p-4 text-gray-400 text-sm"
				style={{
					backgroundColor: "rgba(255, 255, 255, 0.03)",
					borderColor: "rgba(255, 255, 255, 0.06)",
				}}
			>
				No valve devices available. Pair a valve device before creating a rule.
				<div className="mt-3">
					<Button onClick={onClose} type="button" variant="outline">
						Close
					</Button>
				</div>
			</div>
		);
	}

	const deviceLabel = (device: ValveDeviceOption) =>
		device.roomName ? `${device.name} (${device.roomName})` : device.name;
	const deviceItems = Object.fromEntries(
		valveDevices.map((device) => [device.id, deviceLabel(device)]),
	);

	const canSubmit =
		name.trim().length > 0 &&
		deviceId.length > 0 &&
		days.length > 0 &&
		/^\d{2}:\d{2}$/.test(time) &&
		targetSetpointC.length > 0;

	return (
		<form
			className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto rounded-xl border p-4"
			onSubmit={(e) => {
				e.preventDefault();
				if (!canSubmit) return;
				const [hourStr, minuteStr] = time.split(":");
				const trimmedThreshold = tempThresholdC.trim();
				setFormError(null);
				createMutation.mutate({
					daysOfWeek: days,
					deviceId,
					fireHour: Number(hourStr),
					fireMinute: Number(minuteStr),
					name: name.trim(),
					targetSetpointC: parseFloat(targetSetpointC),
					tempThresholdC: trimmedThreshold
						? parseFloat(trimmedThreshold)
						: undefined,
				});
			}}
			style={{
				backgroundColor: "rgba(255, 255, 255, 0.03)",
				borderColor: "rgba(255, 255, 255, 0.06)",
			}}
		>
			<label
				className="flex flex-col gap-1 text-foreground text-sm"
				htmlFor="automation-name"
			>
				Rule name
				<Input
					id="automation-name"
					onChange={(e) => setName(e.target.value)}
					placeholder="Morning warm-up"
					value={name}
				/>
			</label>

			<label
				className="flex flex-col gap-1 text-foreground text-sm"
				htmlFor="automation-device"
			>
				Device
				<Select
					items={deviceItems}
					onValueChange={(v) => setDeviceId(v ?? "")}
					value={deviceId}
				>
					<SelectTrigger className="w-full" id="automation-device">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{valveDevices.map((device) => (
							<SelectItem key={device.id} value={device.id}>
								{deviceLabel(device)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</label>

			<div className="flex flex-col gap-1 text-foreground text-sm">
				Days of week
				<div className="flex flex-wrap gap-2">
					{DAY_LABELS.map((label, i) => (
						<label
							className={cn(
								"flex h-8 w-12 cursor-pointer items-center justify-center rounded-lg border text-xs transition-colors",
								days.includes(i)
									? "border-primary bg-primary text-primary-foreground"
									: "border-input bg-transparent text-foreground hover:bg-muted",
							)}
							key={label}
						>
							<input
								checked={days.includes(i)}
								className="sr-only"
								onChange={() => toggleDay(i)}
								type="checkbox"
							/>
							{label}
						</label>
					))}
				</div>
			</div>

			<div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
				<label
					className="flex flex-col gap-1 text-foreground text-sm"
					htmlFor="automation-time"
				>
					Fire time
					<Input
						className="w-full sm:w-32"
						id="automation-time"
						inputMode="numeric"
						onChange={(e) => handleTimeChange(e.target.value)}
						placeholder="HH:MM"
						type="text"
						value={time}
					/>
				</label>
				<label
					className="flex flex-col gap-1 text-foreground text-sm"
					htmlFor="automation-setpoint"
				>
					Target setpoint °C
					<Input
						className="w-full sm:w-28"
						id="automation-setpoint"
						inputMode="decimal"
						onChange={(e) =>
							handleDecimalChange(e.target.value, setTargetSetpointC)
						}
						type="text"
						value={targetSetpointC}
					/>
				</label>
			</div>

			<label
				className="flex flex-col gap-1 text-foreground text-sm"
				htmlFor="automation-threshold"
			>
				Only fire if room &lt; X °C — leave empty to always fire
				<Input
					className="w-full sm:w-28"
					id="automation-threshold"
					inputMode="decimal"
					onChange={(e) =>
						handleDecimalChange(e.target.value, setTempThresholdC)
					}
					type="text"
					value={tempThresholdC}
				/>
			</label>

			<ErrorMessage message={formError} variant="inline" />

			<div className="flex gap-2">
				<Button disabled={!canSubmit || createMutation.isPending} type="submit">
					{createMutation.isPending ? "Creating…" : "Create rule"}
				</Button>
				<Button onClick={onClose} type="button" variant="outline">
					Cancel
				</Button>
			</div>
		</form>
	);
}
