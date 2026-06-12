"use client";

import type { ReactNode } from "react";
import { useSiteContext } from "~/components/site-context";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";

interface PageShellProps {
	children: ReactNode;
	rightContent?: ReactNode;
	title: string;
}

export function PageShell({ children, rightContent, title }: PageShellProps) {
	const { activeSiteId, sites, setActiveSite } = useSiteContext();

	return (
		<main className="min-h-screen px-4 py-8 text-white sm:px-6">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="font-bold text-white text-xl sm:text-2xl">{title}</h1>
				<div className="flex items-center gap-3">
					{sites.length > 1 && (
						<Select
							onValueChange={(val) => {
								if (val) setActiveSite(val);
							}}
							value={activeSiteId}
						>
							<SelectTrigger className="w-36 text-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{sites.map((site) => (
									<SelectItem key={site.id} value={site.id}>
										{site.name}
									</SelectItem>
								))}
								<SelectItem value="all">All Sites</SelectItem>
							</SelectContent>
						</Select>
					)}
					{rightContent}
				</div>
			</div>
			{children}
		</main>
	);
}
