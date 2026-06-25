"use client";

import { Thermometer, Timer, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	formatModeSchedule,
	type ModeTargetingRoom,
} from "~/lib/mode-targeting";
import type { RouterOutputs } from "~/trpc/react";

type DeviceItem =
	RouterOutputs["device"]["overview"]["rooms"][number]["devices"][number];

interface Props {
	roomId: string;
	roomName: string;
	devices: DeviceItem[];
	modesForRoom: ModeTargetingRoom[];
	onClose: () => void;
}

export function RoomModal({ roomName, devices, modesForRoom, onClose }: Props) {
	return (
		<Dialog defaultOpen onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{roomName}</DialogTitle>
					<DialogClose />
				</DialogHeader>
				<DialogBody className="space-y-5">
					<div>
						<p className="mb-2 font-semibold text-[var(--s-text-secondary)] text-sm uppercase tracking-[0.04em]">
							Targeted by
						</p>
						{modesForRoom.length > 0 ? (
							<ul className="flex flex-col gap-2">
								{modesForRoom.map((mode) => (
									<li
										className="flex flex-col gap-1 rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] px-4 py-3"
										key={mode.id}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="font-medium text-foreground text-sm">
												{mode.name}
											</span>
											<Badge variant={mode.targetOn ? "default" : "outline"}>
												{mode.targetOn ? "ON" : "OFF"}
											</Badge>
										</div>
										<p className="text-[var(--s-text-muted)] text-xs">
											{formatModeSchedule(mode)}
										</p>
									</li>
								))}
							</ul>
						) : (
							<div className="flex flex-col items-center justify-center py-6 text-center">
								<Timer
									className="mb-2"
									size={28}
									style={{ color: "var(--s-text-dim)" }}
								/>
								<p className="text-[var(--s-text-dim)] text-sm">
									No modes target this room yet.
								</p>
							</div>
						)}
						<Link
							className="mt-2 inline-block text-[var(--s-text-secondary)] text-sm underline hover:text-[var(--s-text-secondary-hov)]"
							href="/setup"
						>
							Manage modes in Settings →
						</Link>
					</div>

					<div className="border-[var(--s-border)] border-t pt-5">
						<p className="mb-2 font-semibold text-[var(--s-text-secondary)] text-sm uppercase tracking-[0.04em]">
							Devices in this room
						</p>
						<ul className="flex flex-col gap-2">
							{devices.map((device) => (
								<li
									className="flex items-center justify-between gap-2 rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] px-4 py-3"
									key={device.id}
								>
									<div className="flex items-center gap-2">
										{device.isOnline ? (
											<Wifi className="shrink-0 text-green-400" size={14} />
										) : (
											<WifiOff
												className="shrink-0 text-[var(--s-text-ghost)]"
												size={14}
											/>
										)}
										<span className="font-medium text-foreground text-sm">
											{device.name}
										</span>
										<span className="rounded bg-[var(--s-bg-dim)] px-1.5 py-0.5 font-mono text-[var(--s-text-dim)] text-xs">
											{device.deviceType}
										</span>
									</div>
									<div className="flex items-center gap-1 text-[var(--s-text-muted)] text-sm">
										<Thermometer size={14} />
										{device.temperatureC !== null
											? `${device.temperatureC.toFixed(1)} °C`
											: "—"}
									</div>
								</li>
							))}
						</ul>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
