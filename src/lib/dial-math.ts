function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Rounds a raw value to the nearest `step` (anchored at `min`), then clamps into [min, max]. */
export function clampToStep(
	value: number,
	min: number,
	max: number,
	step: number,
): number {
	const rounded = Math.round((value - min) / step) * step + min;
	return clamp(rounded, min, max);
}

/**
 * Angle of a pointer position relative to a center point, in degrees,
 * oriented so that 12 o'clock (straight up from center) is 0° and the
 * angle increases clockwise up to 360°.
 */
export function pointerToAngle(
	pointerX: number,
	pointerY: number,
	centerX: number,
	centerY: number,
): number {
	const dx = pointerX - centerX;
	const dy = pointerY - centerY;
	const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
	const normalized = ((rawDeg % 360) + 360) % 360;
	return (normalized + 90) % 360;
}

// The dial's track is a 300° arc with a 60° gap centered at 6 o'clock —
// min sits just clockwise of the gap, max just counter-clockwise of it.
const SWEEP_START_DEG = 210;
const SWEEP_DEG = 300;
const GAP_LOW_DEG = 150;
const GAP_HIGH_DEG = 210;

/**
 * Maps a raw 0-360° pointer angle (12 o'clock = 0°, clockwise — see
 * `pointerToAngle`) to the dial's 0-1 fill fraction. The bottom ±30°
 * (150°-210°) is a dead zone with no track to drag along, so a pointer
 * angle landing there snaps to whichever end it's closer to, rather than
 * producing an ambiguous mid-gap fraction.
 */
function angleToFraction(angleDeg: number): number {
	if (angleDeg > GAP_LOW_DEG && angleDeg < GAP_HIGH_DEG) {
		return angleDeg < 180 ? 1 : 0;
	}
	const pos =
		angleDeg >= SWEEP_START_DEG
			? angleDeg - SWEEP_START_DEG
			: angleDeg + (360 - SWEEP_START_DEG);
	return pos / SWEEP_DEG;
}

/** Converts a raw pointer angle into a clamped, step-rounded setpoint. */
export function angleToSetpoint(
	angleDeg: number,
	min: number,
	max: number,
	step: number,
): number {
	const f = angleToFraction(angleDeg);
	return clampToStep(min + f * (max - min), min, max, step);
}

/** A setpoint's position in [min, max], as a 0-1 fraction. */
export function setpointToFraction(
	value: number,
	min: number,
	max: number,
): number {
	if (max === min) return 0;
	return clamp((value - min) / (max - min), 0, 1);
}

/**
 * Inverse of the fraction → angle step of `angleToSetpoint`: maps a setpoint
 * to its position on the dial's 300°-with-gap sweep, as an angle in the
 * 210°-510° range (can exceed 360° — `polarPoint`'s trig is periodic, so
 * this draws correctly without an extra modulo).
 */
export function setpointToSweepAngle(
	value: number,
	min: number,
	max: number,
): number {
	return SWEEP_START_DEG + setpointToFraction(value, min, max) * SWEEP_DEG;
}

/** A point at `radius` from `center`, at `angleDeg` (12 o'clock = 0°, clockwise). */
export function polarPoint(
	angleDeg: number,
	radius: number,
	center: number,
): { x: number; y: number } {
	const rad = ((angleDeg - 90) * Math.PI) / 180;
	return {
		x: center + radius * Math.cos(rad),
		y: center + radius * Math.sin(rad),
	};
}

/** An SVG arc path string from `a0` to `a1` degrees (clockwise), at `radius` from `center`. */
export function arcPath(
	a0: number,
	a1: number,
	radius: number,
	center: number,
): string {
	const p0 = polarPoint(a0, radius, center);
	const p1 = polarPoint(a1, radius, center);
	const large = a1 - a0 > 180 ? 1 : 0;
	return `M${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/**
 * A setpoint's dial color: a hue rotation in OKLCH from cool blue (min)
 * through sage green (~mid) to warm amber (max) — perceptually smoother
 * than a straight RGB lerp. `glow` is the same hue at higher chroma, for
 * the active arc's/handle's drop-shadow and the dial's ambient glow.
 */
export function dialColor(
	value: number,
	min: number,
	max: number,
): { stroke: string; glow: string } {
	const f = setpointToFraction(value, min, max);
	const hue = 230 - f * 205;
	return {
		stroke: `oklch(0.75 0.13 ${hue.toFixed(1)})`,
		glow: `oklch(0.72 0.17 ${hue.toFixed(1)})`,
	};
}
