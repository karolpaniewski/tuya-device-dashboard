"use client";

import type { ReactNode } from "react";
import { useSiteContext } from "~/components/site-context";
import { ThemeToggle } from "~/components/theme-toggle";
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

	const siteItems = Object.fromEntries([
		...sites.map((site) => [site.id, site.name]),
		["all", "All Sites"],
	]);

	return (
		<main className="min-h-screen px-4 py-8 text-foreground sm:px-6">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="font-bold text-foreground text-xl sm:text-2xl">
					{title}
				</h1>
				<div className="flex items-center gap-3">
					{sites.length > 1 && (
						<Select
							items={siteItems}
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
					<ThemeToggle />
					{rightContent}
				</div>
			</div>
			{children}
		</main>
	);
}
