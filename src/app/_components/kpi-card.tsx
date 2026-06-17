import type { ReactNode } from "react";

export function KpiCard({
	icon,
	label,
	sub,
	value,
}: {
	icon: ReactNode;
	label: string;
	sub: string;
	value: string | number;
}) {
	return (
		<div className="rounded-xl border border-[var(--s-border)] bg-[var(--s-bg)] p-4 shadow-[var(--s-shadow)]">
			<div className="mb-1 flex items-center gap-2 text-[var(--s-text-muted)] text-xs">
				{icon}
				{label}
			</div>
			<div className="font-semibold text-2xl text-foreground">{value}</div>
			<div className="mt-0.5 text-[var(--s-text-dim)] text-xs">{sub}</div>
		</div>
	);
}
