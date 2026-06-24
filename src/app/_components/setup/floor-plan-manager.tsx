"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import type { api, RouterOutputs } from "~/trpc/react";

type SiteItem = RouterOutputs["site"]["list"][number];

interface Props {
	activeSiteId: string;
	sites: SiteItem[];
	utils: ReturnType<typeof api.useUtils>;
}

export function FloorPlanManager({ activeSiteId, sites, utils }: Props) {
	const [error, setError] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const activeSite = sites.find((site) => site.id === activeSiteId);

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file || !activeSite) return;

		setError(null);
		setIsUploading(true);
		try {
			const formData = new FormData();
			formData.append("siteId", activeSite.id);
			formData.append("file", file);

			const response = await fetch("/api/floor-plan/upload", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const body = (await response.json()) as { message?: string };
				throw new Error(body.message ?? "Upload failed");
			}

			toast.success("Floor plan uploaded");
			void utils.site.list.invalidate();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Upload failed";
			setError(message);
			toast.error(message);
		} finally {
			setIsUploading(false);
		}
	}

	if (activeSiteId === "all") {
		return (
			<p className="text-sm" style={{ color: "var(--cc-text-muted)" }}>
				Select a specific site to manage its floor plan.
			</p>
		);
	}

	return (
		<section>
			{error && (
				<div className="mb-3">
					<ErrorMessage message={error} variant="banner" />
				</div>
			)}

			{activeSite?.floorPlanImagePath ? (
				<img
					alt={`${activeSite.name} floor plan`}
					className="mb-4 max-h-48 w-full rounded-lg border object-contain"
					src={activeSite.floorPlanImagePath}
					style={{ borderColor: "var(--cc-glass-border)" }}
				/>
			) : (
				<p className="mb-4 text-sm" style={{ color: "var(--cc-text-muted)" }}>
					No floor plan uploaded yet.
				</p>
			)}

			<input
				accept="image/png,image/jpeg"
				className="hidden"
				disabled={isUploading}
				onChange={handleFileChange}
				ref={fileInputRef}
				type="file"
			/>
			<Button
				disabled={isUploading}
				onClick={() => fileInputRef.current?.click()}
				type="button"
			>
				{isUploading
					? "Uploading…"
					: activeSite?.floorPlanImagePath
						? "Replace floor plan"
						: "Upload floor plan"}
			</Button>
			<p className="mt-2 text-xs" style={{ color: "var(--cc-text-faint)" }}>
				PNG or JPEG, up to 5MB.
			</p>
		</section>
	);
}
