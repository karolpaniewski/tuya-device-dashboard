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

/**
 * Replaces the slots in `fullOrder` held by `sectionIds` with the ids in
 * `newSectionOrder`, in order, leaving every other id's position untouched.
 * Used to fold a reorder of one visible section (e.g. one site's rooms) back
 * into the full saved order without dropping ids that belong to sections not
 * currently visible (other sites, filtered-out rooms).
 */
export function spliceSectionOrder(
	fullOrder: string[],
	sectionIds: string[],
	newSectionOrder: string[],
): string[] {
	const sectionIdSet = new Set(sectionIds);
	let i = 0;

	return fullOrder.map((id) => {
		if (!sectionIdSet.has(id)) return id;
		const replacement = newSectionOrder[i];
		i += 1;
		return replacement ?? id;
	});
}
