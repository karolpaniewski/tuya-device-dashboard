/**
 * Sorts `items` by a saved id order. Items whose id appears in `order` come
 * first, sorted by their index in `order`; items not in `order` (e.g. newly
 * created since the layout was last saved) are appended afterward in their
 * original relative order. Ids in `order` with no matching item (e.g.
 * deleted since the layout was last saved) are silently dropped.
 */
export function applySavedOrder<T>(
	items: T[],
	order: string[],
	getId: (item: T) => string,
): T[] {
	const position = new Map(order.map((id, index) => [id, index]));

	const known: { item: T; index: number }[] = [];
	const unknown: T[] = [];

	for (const item of items) {
		const index = position.get(getId(item));
		if (index === undefined) {
			unknown.push(item);
		} else {
			known.push({ item, index });
		}
	}

	known.sort((a, b) => a.index - b.index);

	return [...known.map((k) => k.item), ...unknown];
}
