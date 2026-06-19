"use client";

import { useEffect, useState } from "react";

function formatClock(date: Date) {
	return date.toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

export function CommandCenterClock() {
	const [mounted, setMounted] = useState(false);
	const [time, setTime] = useState("");

	useEffect(() => {
		setMounted(true);
		setTime(formatClock(new Date()));
		const interval = setInterval(() => {
			setTime(formatClock(new Date()));
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	if (!mounted) return null;

	return (
		<div
			className="flex items-baseline gap-1.5 rounded-xl border px-3.5 py-2.5"
			style={{
				fontFamily: "var(--font-mono-display)",
				backgroundColor: "rgba(34, 211, 238, 0.08)",
				borderColor: "rgba(34, 211, 238, 0.22)",
			}}
		>
			<span
				className="font-semibold text-[15px] tracking-[0.04em]"
				style={{ color: "var(--cc-cyan)" }}
			>
				{time}
			</span>
			<span className="text-[10px]" style={{ color: "var(--cc-text-faint)" }}>
				LOCAL
			</span>
		</div>
	);
}
