"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";

interface Props {
	icon: LucideIcon;
	title: string;
	description: string;
	size?: "default" | "wide";
	children: ReactNode;
}

export function SettingsCard({
	icon: Icon,
	title,
	description,
	size,
	children,
}: Props) {
	return (
		<Dialog>
			<DialogTrigger
				className="relative flex flex-col items-start gap-3 overflow-hidden rounded-[20px] border px-[22px] py-5 text-left transition-colors hover:border-[var(--cc-cyan)]/40"
				style={{
					background: "var(--cc-glass-bg)",
					borderColor: "var(--cc-glass-border)",
				}}
			>
				<div
					className="flex h-10 w-10 items-center justify-center rounded-[10px]"
					style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
				>
					<Icon
						className="h-[18px] w-[18px]"
						style={{ color: "var(--cc-cyan)" }}
					/>
				</div>
				<div>
					<h2
						className="font-semibold text-[17px]"
						style={{ color: "var(--cc-text-primary)" }}
					>
						{title}
					</h2>
					<p
						className="mt-0.5 text-[13px]"
						style={{ color: "var(--cc-text-muted)" }}
					>
						{description}
					</p>
				</div>
			</DialogTrigger>

			<DialogContent
				className="command-center"
				size={size}
				style={{
					background: "var(--cc-glass-bg)",
					borderColor: "var(--cc-glass-border)",
				}}
			>
				<DialogHeader>
					<DialogTitle style={{ color: "var(--cc-text-primary)" }}>
						{title}
					</DialogTitle>
					<DialogClose />
				</DialogHeader>
				<DialogBody>{children}</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
