"use client";

import { LayoutGrid, Moon, Settings, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSiteContext } from "~/components/site-context";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { cn } from "~/lib/utils";
import { CommandCenterClock } from "./command-center-clock";
import { DensityProvider, useDensity } from "./density-provider";

function RailLink({
	href,
	active,
	label,
	icon,
}: {
	href: string;
	active: boolean;
	label: string;
	icon: ReactNode;
}) {
	return (
		<Link
			aria-current={active ? "page" : undefined}
			aria-label={label}
			className={cn(
				"relative flex h-[46px] w-[46px] items-center justify-center rounded-[13px] transition-colors",
				active ? "border" : "border border-transparent hover:bg-white/5",
			)}
			href={href}
			style={
				active
					? {
							backgroundColor: "rgba(34, 211, 238, 0.14)",
							borderColor: "rgba(34, 211, 238, 0.4)",
							boxShadow: "0 0 18px rgba(34, 211, 238, 0.2)",
						}
					: undefined
			}
		>
			{active && (
				<span
					className="absolute top-[13px] left-[-13px] h-5 w-[3px] rounded-sm"
					style={{
						backgroundColor: "var(--cc-cyan)",
						boxShadow: "0 0 10px var(--cc-cyan)",
					}}
				/>
			)}
			<span
				style={{ color: active ? "var(--cc-cyan)" : "var(--cc-text-muted)" }}
			>
				{icon}
			</span>
		</Link>
	);
}

export function CommandCenterShell({ children }: { children: ReactNode }) {
	return (
		<DensityProvider>
			<CommandCenterShellInner>{children}</CommandCenterShellInner>
		</DensityProvider>
	);
}

function CommandCenterShellInner({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const { activeSiteId, sites, setActiveSite } = useSiteContext();
	const { density } = useDensity();

	const siteItems = Object.fromEntries([
		...sites.map((site) => [site.id, site.name]),
		["all", "All Sites"],
	]);

	return (
		<div
			className="command-center fixed inset-0 flex overflow-hidden"
			data-density={density}
			style={{
				backgroundColor: "var(--cc-bg)",
				color: "var(--cc-text-primary)",
				fontFamily: "var(--font-display)",
			}}
		>
			<div
				className="pointer-events-none fixed inset-0"
				style={{
					background:
						"radial-gradient(1300px 680px at 82% -8%, var(--cc-glow-1), transparent 58%), radial-gradient(1000px 560px at -5% 105%, var(--cc-glow-2), transparent 55%)",
				}}
			/>

			<aside
				className="relative z-10 flex w-[74px] flex-none flex-col items-center gap-1.5 border-r py-[22px]"
				style={{
					borderColor: "rgba(255, 255, 255, 0.06)",
					background:
						"linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01))",
				}}
			>
				<div
					className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl"
					style={{
						background:
							"linear-gradient(150deg, var(--cc-cyan), var(--cc-cyan-dark))",
						boxShadow: "0 0 22px rgba(34, 211, 238, 0.55)",
					}}
				>
					<div
						className="h-3.5 w-3.5 rounded"
						style={{ backgroundColor: "var(--cc-bg)" }}
					/>
				</div>

				<RailLink
					active={pathname === "/"}
					href="/"
					icon={<LayoutGrid size={20} />}
					label="Dashboard"
				/>
				<RailLink
					active={pathname === "/setup"}
					href="/setup"
					icon={<Settings size={20} />}
					label="Setup"
				/>

				<div
					className="mt-auto flex h-[34px] w-[34px] items-center justify-center rounded-full"
					style={{
						background:
							"linear-gradient(150deg, var(--cc-violet), var(--cc-violet-dark))",
					}}
				>
					<User color="#fff" size={16} />
				</div>
			</aside>

			<main className="relative z-10 flex min-w-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[30px] py-6 pb-[60px]">
				<header className="flex flex-wrap items-center justify-between gap-5">
					<div className="flex items-center gap-3">
						<h1
							className="font-bold text-[26px] tracking-[-0.02em]"
							style={{ color: "var(--cc-text-primary)" }}
						>
							Device Control Center
						</h1>
						<span
							className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-[11px] tracking-[0.06em]"
							style={{
								backgroundColor: "rgba(52, 211, 153, 0.12)",
								border: "1px solid rgba(52, 211, 153, 0.35)",
								color: "var(--cc-emerald)",
							}}
						>
							<span
								className="h-1.5 w-1.5 rounded-full"
								style={{
									backgroundColor: "var(--cc-emerald)",
									boxShadow: "0 0 8px var(--cc-emerald)",
								}}
							/>
							SYSTEM NOMINAL
						</span>
					</div>

					<div className="flex items-center gap-3">
						{sites.length > 1 && (
							<Select
								items={siteItems}
								onValueChange={(val) => {
									if (val) setActiveSite(val);
								}}
								value={activeSiteId}
							>
								<SelectTrigger
									className="w-36 rounded-xl text-[13px]"
									style={{
										backgroundColor: "rgba(255, 255, 255, 0.04)",
										borderColor: "rgba(255, 255, 255, 0.09)",
										color: "var(--cc-text-secondary)",
									}}
								>
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

						<CommandCenterClock />

						<button
							aria-label="Theme (dashboard is dark-only)"
							className="flex h-[42px] w-[42px] cursor-not-allowed items-center justify-center rounded-xl"
							disabled
							style={{
								backgroundColor: "rgba(255, 255, 255, 0.04)",
								border: "1px solid rgba(255, 255, 255, 0.09)",
							}}
							title="Dashboard is dark-only"
							type="button"
						>
							<Moon color="var(--cc-text-secondary)" size={18} />
						</button>
					</div>
				</header>

				{children}
			</main>
		</div>
	);
}
