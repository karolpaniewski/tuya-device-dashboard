"use client";

import { motion, type PanInfo } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
	angleToSetpoint,
	arcPath,
	clampToStep,
	dialColor,
	pointerToAngle,
	polarPoint,
	setpointToSweepAngle,
} from "~/lib/dial-math";
import { useReducedMotion } from "~/lib/use-reduced-motion";

const DIAMETER: Record<"compact" | "large", number> = {
	compact: 72,
	large: 224,
};

const STROKE_WIDTH: Record<"compact" | "large", number> = {
	compact: 6,
	large: 14,
};

const FONT_SIZE: Record<"compact" | "large", number> = {
	compact: 14,
	large: 34,
};

// Geometry ratios lifted from the design handoff's 360-viewBox reference
// (R=138, halo r=19, dot r=11, ticks r 150-161, glow inset 30/blur 46 @
// diameter 460) and reapplied proportionally at this component's own sizes.
const TRACK_RADIUS_RATIO = 138 / 180;
const HALO_RADIUS_RATIO = 19 / 180;
const DOT_RADIUS_RATIO = 11 / 180;
const TICK_INNER_RATIO = 150 / 180;
const TICK_OUTER_RATIO = 161 / 180;
const GLOW_INSET_RATIO = 30 / 460;
const GLOW_BLUR_RATIO = 46 / 460;
const TICK_COUNT = 32;
const WHEEL_COMMIT_DELAY_MS = 400;

interface ThermostatDialProps {
	value: number | null;
	min: number;
	max: number;
	step: number;
	size: "compact" | "large";
	disabled?: boolean;
	onChange: (next: number) => void;
}

/**
 * A draggable circular setpoint dial: a 300° track with a 60° gap at the
 * bottom (6 o'clock), matching a physical thermostat's hard min/max stops.
 * Color sweeps blue → sage green → amber across the range via an OKLCH hue
 * rotation. Scroll-to-adjust is only wired up at "large" size — a tiny
 * "compact" card dial sits inside a scrollable device list, where wheel
 * events are far more likely to be incidental page-scrolling than an
 * intentional setpoint change.
 */
export function ThermostatDial({
	value,
	min,
	max,
	step,
	size,
	disabled,
	onChange,
}: ThermostatDialProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const lastCommittedRef = useRef(value ?? 20);
	const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const reducedMotion = useReducedMotion();
	const [dragValue, setDragValue] = useState<number | null>(null);

	// Read via refs (not effect deps) inside the wheel listener below — it's
	// attached once per size/disabled/min/max/step change, not re-bound on
	// every value/dragValue/onChange update.
	const latestRef = useRef({ dragValue, value, onChange });
	latestRef.current = { dragValue, value, onChange };

	useEffect(() => {
		return () => {
			if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
		};
	}, []);

	useEffect(() => {
		const el = containerRef.current;
		if (!el || size !== "large") return;
		function handleWheel(event: WheelEvent) {
			event.preventDefault();
			if (disabled) return;
			const latest = latestRef.current;
			const base = latest.dragValue ?? latest.value ?? 20;
			const next = clampToStep(
				base + (event.deltaY < 0 ? step : -step),
				min,
				max,
				step,
			);
			lastCommittedRef.current = next;
			setDragValue(next);
			if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
			wheelTimeoutRef.current = setTimeout(() => {
				latestRef.current.onChange(lastCommittedRef.current);
				setDragValue(null);
			}, WHEEL_COMMIT_DELAY_MS);
		}
		el.addEventListener("wheel", handleWheel, { passive: false });
		return () => el.removeEventListener("wheel", handleWheel);
	}, [disabled, min, max, step, size]);

	const displayValue = dragValue ?? value;
	const current = displayValue ?? 20;
	const diameter = DIAMETER[size];
	const center = diameter / 2;
	const strokeWidth = STROKE_WIDTH[size];
	const trackRadius = center * TRACK_RADIUS_RATIO;
	const showTicks = size === "large";

	const sweepAngle = setpointToSweepAngle(current, min, max);
	const trackPath = arcPath(210, 510, trackRadius, center);
	const activePath =
		sweepAngle <= 210 ? "" : arcPath(210, sweepAngle, trackRadius, center);
	const handle = polarPoint(sweepAngle, trackRadius, center);
	const { stroke, glow } = dialColor(current, min, max);

	const ticks = showTicks
		? Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
				const angle = 210 + (i / TICK_COUNT) * 300;
				const inner = polarPoint(angle, center * TICK_INNER_RATIO, center);
				const outer = polarPoint(angle, center * TICK_OUTER_RATIO, center);
				return { inner, outer, on: angle <= sweepAngle + 0.5, key: i };
			})
		: [];

	function angleFromClientPoint(clientX: number, clientY: number): number {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return 0;
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		return pointerToAngle(clientX, clientY, centerX, centerY);
	}

	function commitFromAngle(angleDeg: number) {
		const next = angleToSetpoint(angleDeg, min, max, step);
		setDragValue(next);
		if (next !== lastCommittedRef.current) {
			lastCommittedRef.current = next;
			if (typeof navigator !== "undefined" && "vibrate" in navigator) {
				navigator.vibrate(8);
			}
		}
	}

	function handlePanStart(event: PointerEvent) {
		if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
		lastCommittedRef.current = value ?? 20;
		commitFromAngle(angleFromClientPoint(event.clientX, event.clientY));
	}

	function handlePan(event: PointerEvent, _info: PanInfo) {
		commitFromAngle(angleFromClientPoint(event.clientX, event.clientY));
	}

	// Commits once, with the final dragged value, instead of once per step —
	// firing a mutation on every 0.5° step crossed during a fast drag floods
	// the network with overlapping requests whose responses can resolve out
	// of order, letting a stale one clobber the final value.
	function handlePanEnd() {
		onChange(lastCommittedRef.current);
		setDragValue(null);
	}

	const glowInset = diameter * GLOW_INSET_RATIO;
	const glowBlur = diameter * GLOW_BLUR_RATIO;
	const haloRadius = center * HALO_RADIUS_RATIO;
	const dotRadius = center * DOT_RADIUS_RATIO;

	return (
		<motion.div
			aria-disabled={disabled}
			aria-label="Setpoint dial"
			aria-valuemax={max}
			aria-valuemin={min}
			aria-valuenow={value ?? undefined}
			data-no-dnd="true"
			onPan={disabled ? undefined : handlePan}
			onPanEnd={disabled ? undefined : handlePanEnd}
			onPanStart={disabled ? undefined : handlePanStart}
			ref={containerRef}
			role="slider"
			style={{
				cursor: disabled ? "default" : "grab",
				height: diameter,
				position: "relative",
				touchAction: "none",
				width: diameter,
			}}
		>
			<div
				style={{
					background: `radial-gradient(circle, ${glow} 0%, transparent 68%)`,
					borderRadius: "50%",
					filter: `blur(${glowBlur}px)`,
					inset: -glowInset,
					opacity: 0.32,
					pointerEvents: "none",
					position: "absolute",
					transition: reducedMotion ? undefined : "background 300ms ease",
					zIndex: 0,
				}}
			/>
			<svg
				height={diameter}
				style={{ position: "relative", zIndex: 1 }}
				viewBox={`0 0 ${diameter} ${diameter}`}
				width={diameter}
			>
				<title>Setpoint dial</title>
				<path
					d={trackPath}
					fill="none"
					stroke="rgba(255, 255, 255, 0.07)"
					strokeLinecap="round"
					strokeWidth={strokeWidth}
				/>
				{ticks.map((t) => (
					<line
						key={t.key}
						stroke={t.on ? stroke : "rgba(255, 255, 255, 0.10)"}
						strokeLinecap="round"
						strokeWidth={2}
						x1={t.inner.x}
						x2={t.outer.x}
						y1={t.inner.y}
						y2={t.outer.y}
					/>
				))}
				{activePath && (
					<path
						d={activePath}
						fill="none"
						stroke={stroke}
						strokeLinecap="round"
						strokeWidth={strokeWidth}
						style={{
							filter: `drop-shadow(0 0 ${glowBlur / 5}px ${glow})`,
							transition: reducedMotion ? undefined : "stroke 250ms ease",
						}}
					/>
				)}
				<circle
					cx={handle.x}
					cy={handle.y}
					fill="none"
					opacity={0.28}
					r={haloRadius}
					stroke={stroke}
					strokeWidth={2}
				/>
				<circle
					cx={handle.x}
					cy={handle.y}
					fill="white"
					r={dotRadius}
					style={{ filter: `drop-shadow(0 0 ${glowBlur / 6.5}px ${glow})` }}
				/>
			</svg>
			<div
				style={{
					alignItems: "center",
					display: "flex",
					inset: 0,
					justifyContent: "center",
					pointerEvents: "none",
					position: "absolute",
					zIndex: 2,
				}}
			>
				<span
					style={{
						color: "#fff",
						fontFamily: "var(--font-display)",
						fontSize: FONT_SIZE[size],
						fontVariantNumeric: "tabular-nums",
						fontWeight: 400,
						lineHeight: 1,
						transition: reducedMotion ? undefined : "color 250ms ease",
					}}
				>
					{displayValue !== null ? `${displayValue.toFixed(1)}°` : "—"}
				</span>
			</div>
		</motion.div>
	);
}
