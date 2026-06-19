import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

const TONE_CLASSES: Record<"alert" | "default" | "healthy", string> = {
	alert:
		"bg-[linear-gradient(155deg,rgba(251,113,133,0.08),rgba(255,255,255,0.015))] border-[rgba(251,113,133,0.18)]",
	default:
		"bg-[linear-gradient(155deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] border-[rgba(255,255,255,0.08)]",
	healthy:
		"bg-[linear-gradient(155deg,rgba(52,211,153,0.07),rgba(255,255,255,0.015))] border-[rgba(52,211,153,0.18)]",
};

export function CcKpiCard({
	icon,
	label,
	value,
	sub,
	tone = "default",
	children,
}: {
	icon?: ReactNode;
	label: string;
	value: ReactNode;
	sub: ReactNode;
	tone?: "alert" | "default" | "healthy";
	children?: ReactNode;
}) {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-[18px] border p-[18px] transition-colors hover:border-[rgba(34,211,238,0.35)]",
				TONE_CLASSES[tone],
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<span className="font-medium text-[#8b96a3] text-[12px] uppercase tracking-[0.05em]">
					{label}
				</span>
				{icon}
			</div>
			<div className="mt-3 flex items-baseline gap-1.5">{value}</div>
			<div className="mt-1.5 text-[#7a8694] text-[12px]">{sub}</div>
			{children}
		</div>
	);
}
