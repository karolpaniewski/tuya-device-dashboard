"use client";

import { motion, type PanInfo } from "framer-motion";
import { useRef, useState } from "react";
import {
	angleToSetpoint,
	pointerToAngle,
	setpointToAngle,
	setpointToColor,
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
	compact: 13,
	large: 28,
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Shortest signed angular distance from `from` to `to`, in (-180, 180]. */
function shortestAngleDelta(from: number, to: number): number {
	let diff = (to - from) % 360;
	if (diff > 180) diff -= 360;
	if (diff < -180) diff += 360;
	return diff;
}

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
 * A draggable circular setpoint dial. Tracks pointer rotation as a signed,
 * clamped accumulator (rather than the raw 0-360° pointer angle) so dragging
 * past the min/max boundary hard-stops there instead of wrapping around to
 * the opposite end — the raw angle alone can't distinguish "just past max"
 * from "back at min" since both sit at the same physical 12 o'clock point.
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
	const cumulativeAngleRef = useRef(0);
	const lastRawAngleRef = useRef(0);
	const lastCommittedRef = useRef(value ?? 20);
	const reducedMotion = useReducedMotion();
	const [dragValue, setDragValue] = useState<number | null>(null);

	const displayValue = dragValue ?? value;
	const current = displayValue ?? 20;
	const diameter = DIAMETER[size];
	const center = diameter / 2;
	const strokeWidth = STROKE_WIDTH[size];
	const handleDistance = center - strokeWidth;

	const angle = setpointToAngle(current, min, max);
	const angleRad = (angle * Math.PI) / 180;
	const handleX = center + Math.sin(angleRad) * handleDistance;
	const handleY = center - Math.cos(angleRad) * handleDistance;

	function angleFromClientPoint(clientX: number, clientY: number): number {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return 0;
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		return pointerToAngle(clientX, clientY, centerX, centerY);
	}

	function handlePanStart(event: PointerEvent) {
		const base = value ?? 20;
		cumulativeAngleRef.current = setpointToAngle(base, min, max);
		lastRawAngleRef.current = angleFromClientPoint(
			event.clientX,
			event.clientY,
		);
		lastCommittedRef.current = base;
		setDragValue(base);
	}

	function handlePan(event: PointerEvent, _info: PanInfo) {
		const rawAngle = angleFromClientPoint(event.clientX, event.clientY);
		const delta = shortestAngleDelta(lastRawAngleRef.current, rawAngle);
		cumulativeAngleRef.current = clamp(
			cumulativeAngleRef.current + delta,
			0,
			360,
		);
		lastRawAngleRef.current = rawAngle;

		const next = angleToSetpoint(cumulativeAngleRef.current, min, max, step);
		setDragValue(next);
		if (next !== lastCommittedRef.current) {
			lastCommittedRef.current = next;
			onChange(next);
			if (typeof navigator !== "undefined" && "vibrate" in navigator) {
				navigator.vibrate(8);
			}
		}
	}

	function handlePanEnd() {
		setDragValue(null);
	}

	const fillColor = setpointToColor(current, min, max);

	return (
		<motion.div
			aria-disabled={disabled}
			aria-label="Setpoint dial"
			aria-valuemax={max}
			aria-valuemin={min}
			aria-valuenow={value ?? undefined}
			onPan={disabled ? undefined : handlePan}
			onPanEnd={disabled ? undefined : handlePanEnd}
			onPanStart={disabled ? undefined : handlePanStart}
			ref={containerRef}
			role="slider"
			style={{
				cursor: disabled ? "default" : "grab",
				height: diameter,
				touchAction: "none",
				width: diameter,
			}}
		>
			<svg
				height={diameter}
				viewBox={`0 0 ${diameter} ${diameter}`}
				width={diameter}
			>
				<title>Setpoint dial</title>
				<circle
					cx={center}
					cy={center}
					fill={fillColor}
					r={center - strokeWidth / 2}
					stroke="rgba(255, 255, 255, 0.12)"
					strokeWidth={strokeWidth}
					style={
						reducedMotion ? undefined : { transition: "fill 150ms ease-out" }
					}
				/>
				<circle
					cx={handleX}
					cy={handleY}
					fill="white"
					r={strokeWidth / 2}
					stroke="rgba(0, 0, 0, 0.35)"
					strokeWidth={1}
				/>
				<text
					dominantBaseline="middle"
					fill="white"
					fontSize={FONT_SIZE[size]}
					fontWeight={600}
					textAnchor="middle"
					x={center}
					y={center}
				>
					{displayValue !== null ? `${displayValue.toFixed(1)}°` : "—"}
				</text>
			</svg>
		</motion.div>
	);
}
