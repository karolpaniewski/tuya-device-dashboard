"use client";

import { Button } from "~/components/ui/button";
import { type Density, useDensity } from "../density-provider";

const OPTIONS: { value: Density; label: string; hint: string }[] = [
	{
		value: "comfortable",
		label: "Comfortable",
		hint: "More breathing room between dashboard cards",
	},
	{
		value: "compact",
		label: "Compact",
		hint: "Tighter spacing, more cards on screen",
	},
];

export function DisplaySettings() {
	const { density, setDensity } = useDensity();

	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm" style={{ color: "var(--cc-text-secondary)" }}>
				Card density only affects the dashboard — this Settings page stays the
				same either way.
			</p>
			<div className="flex flex-col gap-2">
				{OPTIONS.map((option) => {
					const active = density === option.value;
					return (
						<Button
							className="h-auto flex-col items-start gap-0.5 px-4 py-3 text-left"
							key={option.value}
							onClick={() => setDensity(option.value)}
							style={
								active
									? {
											backgroundColor: "rgba(34, 211, 238, 0.14)",
											borderColor: "rgba(34, 211, 238, 0.4)",
										}
									: undefined
							}
							type="button"
							variant={active ? "default" : "outline"}
						>
							<span style={{ color: "var(--cc-text-primary)" }}>
								{option.label}
							</span>
							<span
								className="font-normal text-xs"
								style={{ color: "var(--cc-text-muted)" }}
							>
								{option.hint}
							</span>
						</Button>
					);
				})}
			</div>
		</div>
	);
}
