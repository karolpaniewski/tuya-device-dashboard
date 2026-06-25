const MODE_X = 0;
const ROOM_X = 340;
const DEVICE_X = 680;
const VERTICAL_GAP = 100;

interface Point {
	x: number;
	y: number;
}

export interface AutomationFlowLayout {
	room: Point;
	modes: Point[];
	devices: Point[];
}

function centeredColumn(x: number, count: number): Point[] {
	const firstY = -((count - 1) * VERTICAL_GAP) / 2;
	return Array.from({ length: count }, (_, i) => ({
		x,
		y: firstY + i * VERTICAL_GAP,
	}));
}

/**
 * Places mode nodes in a left column and device nodes in a right column,
 * each independently centered on the room node's fixed y = 0 — the room's
 * position never shifts with either column's length.
 */
export function computeAutomationFlowLayout(
	modeCount: number,
	deviceCount: number,
): AutomationFlowLayout {
	return {
		devices: centeredColumn(DEVICE_X, deviceCount),
		modes: centeredColumn(MODE_X, modeCount),
		room: { x: ROOM_X, y: 0 },
	};
}
