"use client";

import { useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";

type RoomItem = RouterOutputs["room"]["list"][number];

interface Props {
	rooms: RoomItem[];
	utils: ReturnType<typeof api.useUtils>;
}

export function RoomManager({ rooms, utils }: Props) {
	const [newName, setNewName] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [error, setError] = useState<string | null>(null);

	const invalidate = () => {
		void utils.room.list.invalidate();
		void utils.device.overview.invalidate();
	};

	const createMutation = api.room.create.useMutation({
		onSuccess: () => {
			setNewName("");
			invalidate();
		},
		onError: (e) => setError(e.message),
	});

	const renameMutation = api.room.rename.useMutation({
		onSuccess: () => {
			setEditingId(null);
			invalidate();
		},
		onError: (e) => setError(e.message),
	});

	const deleteMutation = api.room.delete.useMutation({
		onSuccess: invalidate,
		onError: (e) => setError(e.message),
	});

	function startRename(room: RoomItem) {
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
			<h2 className="mb-4 font-semibold text-lg text-white">Rooms</h2>
			{error && (
				<p className="mb-3 rounded bg-red-900 px-3 py-2 text-red-200 text-sm">
					{error}
				</p>
			)}
			<ul className="flex flex-col gap-2">
				{rooms.map((room) => (
					<li
						className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3"
						key={room.id}
					>
						{editingId === room.id ? (
							<input
								// biome-ignore lint/a11y/noAutofocus: intentional for inline edit UX
								autoFocus
								className="flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
								onBlur={() => commitRename(room.id)}
								onChange={(e) => setEditingName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") commitRename(room.id);
									if (e.key === "Escape") setEditingId(null);
								}}
								value={editingName}
							/>
						) : (
							<span className="flex-1 text-white">{room.name}</span>
						)}
						<span className="rounded bg-gray-700 px-2 py-0.5 text-gray-400 text-xs">
							{room.deviceCount} {room.deviceCount === 1 ? "device" : "devices"}
						</span>
						<button
							className="text-gray-400 text-sm hover:text-white"
							onClick={() => startRename(room)}
							title="Rename"
							type="button"
						>
							✎
						</button>
						<button
							className="text-gray-400 text-sm hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
							disabled={room.deviceCount > 0 || deleteMutation.isPending}
							onClick={() => {
								setError(null);
								deleteMutation.mutate({ id: room.id });
							}}
							title={
								room.deviceCount > 0
									? "Room has assigned devices — reassign them first"
									: "Delete room"
							}
							type="button"
						>
							✕
						</button>
					</li>
				))}
				{rooms.length === 0 && (
					<li className="text-gray-500 text-sm">
						No rooms yet — add one below.
					</li>
				)}
			</ul>

			<form
				className="mt-4 flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const trimmed = newName.trim();
					if (trimmed) {
						setError(null);
						createMutation.mutate({ name: trimmed });
					}
				}}
			>
				<input
					className="flex-1 rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					onChange={(e) => setNewName(e.target.value)}
					placeholder="New room name"
					value={newName}
				/>
				<button
					className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={createMutation.isPending || !newName.trim()}
					type="submit"
				>
					{createMutation.isPending ? "Adding…" : "Add"}
				</button>
			</form>
		</section>
	);
}
