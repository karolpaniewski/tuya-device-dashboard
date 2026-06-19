import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const SERIES_COLORS = [
	"var(--color-chart-1)",
	"var(--color-chart-2)",
	"var(--color-chart-3)",
	"var(--color-chart-4)",
	"var(--color-chart-5)",
];

export function CcDevicesByRoom({
	roomDeviceCounts,
}: {
	roomDeviceCounts: { name: string; count: number }[];
}) {
	const total = roomDeviceCounts.reduce((sum, r) => sum + r.count, 0);

	return (
		<div
			className="rounded-[20px] border p-5"
			style={{
				background:
					"linear-gradient(155deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))",
				borderColor: "var(--cc-glass-border)",
			}}
		>
			<h2
				className="font-semibold text-[15px]"
				style={{ color: "var(--cc-text-primary)" }}
			>
				Devices by Room
			</h2>
			<div
				className="mt-1 font-mono text-[11px]"
				style={{ color: "var(--cc-text-faint)" }}
			>
				{total} TOTAL
			</div>
			{roomDeviceCounts.length === 0 ? (
				<div
					className="flex items-center justify-center text-sm"
					style={{ color: "var(--cc-text-faint)", height: 120 }}
				>
					No rooms
				</div>
			) : (
				<div className="mt-2 flex items-center gap-[18px]">
					<div className="relative h-[120px] w-[120px] flex-none">
						<ResponsiveContainer height={120} width={120}>
							<PieChart>
								<Pie
									cx="50%"
									cy="50%"
									data={roomDeviceCounts}
									dataKey="count"
									innerRadius={42}
									nameKey="name"
									outerRadius={58}
									paddingAngle={2}
								>
									{roomDeviceCounts.map((_, i) => (
										<Cell
											// biome-ignore lint/suspicious/noArrayIndexKey: chart segment index
											key={i}
											stroke="none"
											style={{
												fill: SERIES_COLORS[i % SERIES_COLORS.length],
											}}
										/>
									))}
								</Pie>
								<Tooltip
									contentStyle={{
										background: "var(--popover)",
										border: "1px solid var(--border)",
										borderRadius: "8px",
										color: "var(--popover-foreground)",
										fontSize: 12,
									}}
									formatter={(val: unknown, name: unknown) => [
										`${val} devices`,
										String(name),
									]}
								/>
							</PieChart>
						</ResponsiveContainer>
						<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
							<span
								className="font-bold text-[26px] leading-none"
								style={{ color: "var(--cc-text-primary)" }}
							>
								{total}
							</span>
							<span
								className="font-mono text-[9px] tracking-[0.06em]"
								style={{ color: "var(--cc-text-faint)" }}
							>
								DEVICES
							</span>
						</div>
					</div>
					<div className="flex flex-1 flex-col gap-[11px]">
						{roomDeviceCounts.map((r, i) => (
							<div className="flex items-center gap-[9px]" key={r.name}>
								<span
									className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
									style={{
										backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length],
									}}
								/>
								<span
									className="min-w-0 flex-1 truncate text-[12px]"
									style={{ color: "var(--cc-text-secondary)" }}
								>
									{r.name}
								</span>
								<span
									className="shrink-0 font-mono font-semibold text-[12px]"
									style={{ color: "var(--cc-text-primary)" }}
								>
									{r.count}
								</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
