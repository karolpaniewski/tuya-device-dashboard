function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function roundToStep(value: number, min: number, step: number): number {
	return Math.round((value - min) / step) * step + min;
}

/**
 * Converts a 0-360° dial angle into a clamped, step-rounded setpoint.
 * `angleDeg` is clamped (not wrapped) into [0, 360] first: a true 360°
 * dial has no gap between its 0° and 360° positions, so min (0°) and max
 * (360°) must stay distinguishable rather than both collapsing to the
 * same wrapped angle — this also matches the dial's hard-stop behavior.
 */
export function angleToSetpoint(
	angleDeg: number,
	min: number,
	max: number,
	step: number,
): number {
	const clampedAngle = clamp(angleDeg, 0, 360);
	const raw = min + (clampedAngle / 360) * (max - min);
	return clamp(roundToStep(raw, min, step), min, max);
}

/** Inverse of `angleToSetpoint`: maps a setpoint back to its 0-360° angle. */
export function setpointToAngle(
	value: number,
	min: number,
	max: number,
): number {
	const clamped = clamp(value, min, max);
	return ((clamped - min) / (max - min)) * 360;
}

/**
 * Angle of a pointer position relative to a center point, in degrees,
 * oriented so that 12 o'clock (straight up from center) is 0° and the
 * angle increases clockwise up to 360° — matching the dial's "minimum
 * value sits at the top, turn clockwise to increase" framing. Screen
 * coordinates (y increasing downward) already produce a clockwise sweep
 * out of `Math.atan2`, so only a 12-o'clock-relative rotation is needed.
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

// Matches --cc-dial-cool / --cc-dial-warm in src/styles/globals.css
const DIAL_COOL_RGB = { r: 0x38, g: 0xbd, b: 0xf8 };
const DIAL_WARM_RGB = { r: 0xfb, g: 0x92, b: 0x3c };

/** Interpolates a setpoint's position in [min, max] into a blue→orange CSS color. */
export function setpointToColor(
	value: number,
	min: number,
	max: number,
): string {
	const t = max === min ? 0 : clamp((value - min) / (max - min), 0, 1);
	const r = Math.round(
		DIAL_COOL_RGB.r + (DIAL_WARM_RGB.r - DIAL_COOL_RGB.r) * t,
	);
	const g = Math.round(
		DIAL_COOL_RGB.g + (DIAL_WARM_RGB.g - DIAL_COOL_RGB.g) * t,
	);
	const b = Math.round(
		DIAL_COOL_RGB.b + (DIAL_WARM_RGB.b - DIAL_COOL_RGB.b) * t,
	);
	return `rgb(${r}, ${g}, ${b})`;
}
