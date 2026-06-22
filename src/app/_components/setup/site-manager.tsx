"use client";

import { Globe, Pencil, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

interface Props {
	utils: ReturnType<typeof api.useUtils>;
}

export function SiteManager({ utils }: Props) {
	const sitesQuery = api.site.list.useQuery();
	const [newName, setNewName] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [error, setError] = useState<string | null>(null);

	const invalidate = () => {
		void utils.site.list.invalidate();
	};

	const createMutation = api.site.create.useMutation({
		onError: (e) => setError(e.message),
		onSuccess: () => {
			toast.success("Site created");
			setNewName("");
			invalidate();
		},
	});

	const renameMutation = api.site.rename.useMutation({
		onError: (e) => setError(e.message),
		onSuccess: () => {
			toast.success("Site renamed");
			setEditingId(null);
			invalidate();
		},
	});

	const deleteMutation = api.site.delete.useMutation({
		onError: (e) => setError(e.message),
		onSuccess: () => {
			toast.success("Site deleted");
			invalidate();
		},
	});

	function startRename(site: { id: string; name: string }) {
		setEditingId(site.id);
		setEditingName(site.name);
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

	const sites = sitesQuery.data ?? [];

	return (
		<section>
			<h2 className="mb-4 font-semibold text-foreground text-lg">Sites</h2>
			{error && (
				<div className="mb-3">
					<ErrorMessage message={error} variant="banner" />
				</div>
			)}
			<ul className="flex flex-col gap-2">
				{sites.map((site) => (
					<li
						className="flex items-center gap-1.5 rounded-xl border px-4 py-3 sm:gap-3"
						key={site.id}
						style={{
							background: "var(--cc-glass-bg)",
							borderColor: "var(--cc-glass-border)",
						}}
					>
						{editingId === site.id ? (
							<Input
								autoFocus
								className="flex-1 text-sm"
								onBlur={() => commitRename(site.id)}
								onChange={(e) => setEditingName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") commitRename(site.id);
									if (e.key === "Escape") setEditingId(null);
								}}
								value={editingName}
							/>
						) : (
							<span
								className="flex-1"
								style={{ color: "var(--cc-text-primary)" }}
							>
								{site.name}
							</span>
						)}
						<Button
							onClick={() => startRename(site)}
							size="icon"
							title="Rename"
							type="button"
							variant="ghost"
						>
							<Pencil size={14} />
						</Button>
						<Button
							disabled={deleteMutation.isPending}
							onClick={() => {
								setError(null);
								deleteMutation.mutate({ id: site.id });
							}}
							size="sm"
							title="Delete site"
							type="button"
							variant="destructive"
						>
							<X size={14} />
						</Button>
					</li>
				))}
				{sites.length === 0 && (
					<li className="flex flex-col items-center justify-center py-16 text-center">
						<Globe className="mb-4 text-gray-600" size={48} />
						<p className="font-semibold text-foreground">No sites yet</p>
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
				<Input
					className="flex-1 text-sm"
					onChange={(e) => setNewName(e.target.value)}
					placeholder="New site name"
					value={newName}
				/>
				<Button
					disabled={createMutation.isPending || !newName.trim()}
					type="submit"
				>
					{createMutation.isPending ? "Adding…" : "Add"}
				</Button>
			</form>
		</section>
	);
}
