const MODE_X = 0;
const ROOM_X = 400;
const VERTICAL_GAP = 100;

interface Point {
	x: number;
	y: number;
}

export interface AutomationFlowLayout {
	modes: Point[];
	rooms: Point[];
}

function centeredColumn(x: number, count: number): Point[] {
	const firstY = -((count - 1) * VERTICAL_GAP) / 2;
	return Array.from({ length: count }, (_, i) => ({
		x,
		y: firstY + i * VERTICAL_GAP,
	}));
}

export function computeAutomationFlowLayout(
	modeCount: number,
	roomCount: number,
): AutomationFlowLayout {
	return {
		modes: centeredColumn(MODE_X, modeCount),
		rooms: centeredColumn(ROOM_X, roomCount),
	};
}
