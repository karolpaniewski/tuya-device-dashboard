"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import type { ModeRoomOption, ModeSummary } from "./mode-manager";

interface Props {
	onClose: () => void;
	utils: ReturnType<typeof api.useUtils>;
	rooms: ModeRoomOption[];
	initialMode?: ModeSummary;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(hour: number, minute: number) {
	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function ModeForm({ onClose, utils, rooms, initialMode }: Props) {
	const [name, setName] = useState(initialMode?.name ?? "");
	const [targets, setTargets] = useState<Record<string, boolean>>(
		Object.fromEntries(
			(initialMode?.targets ?? []).map((t) => [t.roomId, t.targetOn]),
		),
	);
	const [manualOnly, setManualOnly] = useState(
		initialMode ? initialMode.daysOfWeek === null : false,
	);
	const [days, setDays] = useState<number[]>(initialMode?.daysOfWeek ?? []);
	const [time, setTime] = useState(
		initialMode?.fireHour !== null &&
			initialMode?.fireHour !== undefined &&
			initialMode?.fireMinute !== null &&
			initialMode?.fireMinute !== undefined
			? formatTime(initialMode.fireHour, initialMode.fireMinute)
			: "",
	);
	const [formError, setFormError] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);

	function handleSuccess(resultWarnings: string[]) {
		void utils.mode.list.invalidate();
		if (resultWarnings.length > 0) {
			setWarnings(resultWarnings);
			return;
		}
		toast.success(initialMode ? "Mode updated" : "Mode created");
		onClose();
	}

	const createMutation = api.mode.create.useMutation({
		onError: (e) => setFormError(e.message),
		onSuccess: (data) => handleSuccess(data.warnings),
	});

	const updateMutation = api.mode.update.useMutation({
		onError: (e) => setFormError(e.message),
		onSuccess: (data) => handleSuccess(data.warnings),
	});

	const isPending = createMutation.isPending || updateMutation.isPending;

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

	function toggleRoom(roomId: string) {
		setTargets((prev) => {
			if (roomId in prev) {
				const next = { ...prev };
				delete next[roomId];
				return next;
			}
			return { ...prev, [roomId]: true };
		});
	}

	function setRoomTargetOn(roomId: string, targetOn: boolean) {
		setTargets((prev) => ({ ...prev, [roomId]: targetOn }));
	}

	const canSubmit =
		name.trim().length > 0 &&
		Object.keys(targets).length > 0 &&
		(manualOnly || (days.length > 0 && /^\d{2}:\d{2}$/.test(time)));

	const previewTargets = Object.entries(targets).map(([roomId, targetOn]) => ({
		roomName: rooms.find((r) => r.id === roomId)?.name ?? roomId,
		targetOn,
	}));
	const previewSchedule = manualOnly
		? "on manual trigger only"
		: days.length > 0 && /^\d{2}:\d{2}$/.test(time)
			? `${days.map((d) => DAY_LABELS[d]).join(" ")} at ${time}`
			: null;

	return (
		<form
			className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto rounded-xl border p-4"
			onSubmit={(e) => {
				e.preventDefault();
				if (!canSubmit) return;
				setFormError(null);
				setWarnings([]);

				const targetList = Object.entries(targets).map(
					([roomId, targetOn]) => ({ roomId, targetOn }),
				);
				const schedule = manualOnly
					? null
					: (() => {
							const [hourStr, minuteStr] = time.split(":");
							return {
								daysOfWeek: days,
								fireHour: Number(hourStr),
								fireMinute: Number(minuteStr),
							};
						})();

				if (initialMode) {
					updateMutation.mutate({
						id: initialMode.id,
						name: name.trim(),
						targets: targetList,
						schedule,
					});
				} else {
					createMutation.mutate({
						name: name.trim(),
						targets: targetList,
						schedule,
					});
				}
			}}
			style={{
				backgroundColor: "rgba(255, 255, 255, 0.03)",
				borderColor: "rgba(255, 255, 255, 0.06)",
			}}
		>
			<label
				className="flex flex-col gap-1 text-foreground text-sm"
				htmlFor="mode-name"
			>
				Mode name
				<Input
					id="mode-name"
					onChange={(e) => setName(e.target.value)}
					placeholder="Everyone's out"
					value={name}
				/>
			</label>

			<div className="flex flex-col gap-1 text-foreground text-sm">
				Target rooms
				{rooms.length === 0 ? (
					<p className="text-[var(--cc-text-muted)] text-xs">
						No rooms available. Create a room before defining a mode.
					</p>
				) : (
					<div
						className="flex flex-col gap-2 rounded-lg border p-2"
						style={{ borderColor: "var(--cc-glass-border)" }}
					>
						{rooms.map((room) => {
							const selected = room.id in targets;
							return (
								<div
									className="flex items-center justify-between gap-2"
									key={room.id}
								>
									<label className="flex items-center gap-2 text-sm">
										<input
											checked={selected}
											onChange={() => toggleRoom(room.id)}
											type="checkbox"
										/>
										{room.name}
									</label>
									{selected && (
										<div className="flex gap-1">
											<button
												className={cn(
													"h-7 rounded-lg border px-2 text-xs transition-colors",
													targets[room.id]
														? "border-primary bg-primary text-primary-foreground"
														: "border-input bg-transparent text-foreground hover:bg-muted",
												)}
												onClick={() => setRoomTargetOn(room.id, true)}
												type="button"
											>
												ON
											</button>
											<button
												className={cn(
													"h-7 rounded-lg border px-2 text-xs transition-colors",
													!targets[room.id]
														? "border-primary bg-primary text-primary-foreground"
														: "border-input bg-transparent text-foreground hover:bg-muted",
												)}
												onClick={() => setRoomTargetOn(room.id, false)}
												type="button"
											>
												OFF
											</button>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			<label className="flex items-center gap-2 text-foreground text-sm">
				<input
					checked={manualOnly}
					onChange={(e) => setManualOnly(e.target.checked)}
					type="checkbox"
				/>
				Manual trigger only — no schedule
			</label>

			{!manualOnly && (
				<>
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

					<label
						className="flex flex-col gap-1 text-foreground text-sm"
						htmlFor="mode-time"
					>
						Fire time
						<Input
							className="w-full sm:w-32"
							id="mode-time"
							inputMode="numeric"
							onChange={(e) => handleTimeChange(e.target.value)}
							placeholder="HH:MM"
							type="text"
							value={time}
						/>
					</label>
				</>
			)}

			{previewTargets.length > 0 && (
				<div
					className="rounded-lg border p-3 text-xs"
					style={{ borderColor: "var(--cc-glass-border)" }}
				>
					<p className="mb-1 font-medium text-foreground">This mode will:</p>
					<ul className="flex flex-col gap-0.5 text-[var(--cc-text-muted)]">
						{previewTargets.map((t) => (
							<li key={t.roomName}>
								Turn <span className="text-foreground">{t.roomName}</span>{" "}
								{t.targetOn ? "ON" : "OFF"}
							</li>
						))}
					</ul>
					<p className="mt-1 text-[var(--cc-text-muted)]">
						{previewSchedule
							? `Fires ${previewSchedule}`
							: "No schedule set yet"}
					</p>
				</div>
			)}

			<ErrorMessage message={formError} variant="inline" />

			{warnings.length > 0 && (
				<div className="rounded-lg border border-amber-700/40 bg-amber-700/10 px-3 py-2 text-amber-200 text-xs">
					{warnings.map((w) => (
						<p key={w}>{w}</p>
					))}
				</div>
			)}

			<div className="flex gap-2">
				<Button disabled={!canSubmit || isPending} type="submit">
					{isPending ? "Saving…" : initialMode ? "Save changes" : "Create mode"}
				</Button>
				<Button onClick={onClose} type="button" variant="outline">
					{warnings.length > 0 ? "Done" : "Cancel"}
				</Button>
			</div>
		</form>
	);
}
