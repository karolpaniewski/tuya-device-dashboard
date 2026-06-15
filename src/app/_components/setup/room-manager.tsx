"use client";

import { Building2, Pencil, Settings, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { api, type RouterOutputs } from "~/trpc/react";
import { RoomThresholdForm } from "./room-threshold-form";

type RoomItem = RouterOutputs["room"]["list"][number];

interface Props {
	activeSiteId: string;
	rooms: RoomItem[];
	utils: ReturnType<typeof api.useUtils>;
}

export function RoomManager({ activeSiteId, rooms, utils }: Props) {
	const [newName, setNewName] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [thresholdRoomId, setThresholdRoomId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const invalidate = () => {
		void utils.room.list.invalidate();
		void utils.device.overview.invalidate();
	};

	const createMutation = api.room.create.useMutation({
		onError: (e) => setError(e.message),
		onSuccess: () => {
			toast.success("Room created");
			setNewName("");
			invalidate();
		},
	});

	const renameMutation = api.room.rename.useMutation({
		onError: (e) => setError(e.message),
		onSuccess: () => {
			toast.success("Room renamed");
			setEditingId(null);
			invalidate();
		},
	});

	const deleteMutation = api.room.delete.useMutation({
		onError: (e) => setError(e.message),
		onSuccess: () => {
			toast.success("Room deleted");
			invalidate();
		},
	});

	function startRename(room: RoomItem) {
		setThresholdRoomId(null);
		setEditingId(room.id);
		setEditingName(room.name);
		setError(null);
	}

	function commitRename(id: string) {
		const trimmed = editingName.trim();
		if (trimmed) {
			renameMutation.mutate({ id, name: trimmed });
		} else {
			setEditingId(null);
		}
	}

	return (
		<section>
			<h2 className="mb-4 font-semibold text-foreground text-lg">Rooms</h2>
			{error && (
				<div className="mb-3">
					<ErrorMessage message={error} variant="banner" />
				</div>
			)}
			<ul className="flex flex-col gap-2">
				{rooms.map((room) => (
					<li
						className="flex flex-col gap-2 rounded-xl border border-[var(--s-border-card)] bg-[var(--s-bg-card)] px-4 py-3"
						key={room.id}
					>
						<div className="flex items-center gap-1.5 sm:gap-3">
							{editingId === room.id ? (
								<Input
									autoFocus
									className="flex-1 text-sm"
									onBlur={() => commitRename(room.id)}
									onChange={(e) => setEditingName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") commitRename(room.id);
										if (e.key === "Escape") setEditingId(null);
									}}
									value={editingName}
								/>
							) : (
								<span className="flex-1 text-foreground">{room.name}</span>
							)}
							<span className="rounded bg-[var(--s-badge-bg)] px-2 py-0.5 text-[var(--s-badge-text)] text-xs">
								{room.deviceCount}{" "}
								{room.deviceCount === 1 ? "device" : "devices"}
							</span>
							<Button
								className={
									thresholdRoomId === room.id ? "text-blue-400" : undefined
								}
								onClick={() => {
									if (thresholdRoomId === room.id) {
										setThresholdRoomId(null);
									} else {
										setEditingId(null);
										setThresholdRoomId(room.id);
									}
								}}
								size="icon"
								title="Thresholds"
								type="button"
								variant="ghost"
							>
								<Settings size={14} />
							</Button>
							<Button
								onClick={() => startRename(room)}
								size="icon"
								title="Rename"
								type="button"
								variant="ghost"
							>
								<Pencil size={14} />
							</Button>
							<Button
								disabled={room.deviceCount > 0 || deleteMutation.isPending}
								onClick={() => {
									setError(null);
									deleteMutation.mutate({ id: room.id });
								}}
								size="sm"
								title={
									room.deviceCount > 0
										? "Room has assigned devices — reassign them first"
										: "Delete room"
								}
								type="button"
								variant="destructive"
							>
								<X size={14} />
							</Button>
						</div>
						{thresholdRoomId === room.id && (
							<RoomThresholdForm
								onClose={() => setThresholdRoomId(null)}
								roomId={room.id}
								utils={utils}
							/>
						)}
					</li>
				))}
				{rooms.length === 0 && (
					<li className="flex flex-col items-center justify-center py-16 text-center">
						<Building2 className="mb-4 text-gray-600" size={48} />
						<p className="font-semibold text-foreground">No rooms yet</p>
						<p className="mt-1 max-w-xs text-gray-400 text-sm">
							Add a room below to start organizing your devices.
						</p>
					</li>
				)}
			</ul>

			{activeSiteId === "all" ? (
				<p className="mt-4 text-gray-400 text-sm">
					Select a specific site to add a room.
				</p>
			) : (
				<form
					className="mt-4 flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						const trimmed = newName.trim();
						if (trimmed) {
							setError(null);
							createMutation.mutate({ name: trimmed, siteId: activeSiteId });
						}
					}}
				>
					<Input
						className="flex-1 text-sm"
						onChange={(e) => setNewName(e.target.value)}
						placeholder="New room name"
						value={newName}
					/>
					<Button
						disabled={createMutation.isPending || !newName.trim()}
						type="submit"
					>
						{createMutation.isPending ? "Adding…" : "Add"}
					</Button>
				</form>
			)}
		</section>
	);
}
