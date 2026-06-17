import { describe, expect, it } from "vitest";

import { applySavedOrder, spliceSectionOrder } from "./layout-order";

type Item = { id: string };
const getId = (item: Item) => item.id;
const items = (ids: string[]): Item[] => ids.map((id) => ({ id }));

describe("applySavedOrder", () => {
	it("sorts known items by their index in the saved order", () => {
		const result = applySavedOrder(
			items(["a", "b", "c"]),
			["c", "a", "b"],
			getId,
		);
		expect(result.map(getId)).toEqual(["c", "a", "b"]);
	});

	it("appends unknown items (new since the layout was saved) at the end, in original relative order", () => {
		const result = applySavedOrder(items(["a", "b", "c"]), ["c"], getId);
		expect(result.map(getId)).toEqual(["c", "a", "b"]);
	});

	it("silently drops saved-order ids that no longer exist (deleted items)", () => {
		const result = applySavedOrder(items(["a", "b"]), ["z", "b", "a"], getId);
		expect(result.map(getId)).toEqual(["b", "a"]);
	});

	it("empty order: returns items in original order", () => {
		const result = applySavedOrder(items(["a", "b", "c"]), [], getId);
		expect(result.map(getId)).toEqual(["a", "b", "c"]);
	});

	it("empty items: returns an empty array regardless of order", () => {
		const result = applySavedOrder([], ["a", "b"], getId);
		expect(result).toEqual([]);
	});

	it("duplicate ids in the saved order do not crash and each matching item keeps its place", () => {
		const result = applySavedOrder(items(["a", "b"]), ["a", "a", "b"], getId);
		expect(result.map(getId)).toEqual(["a", "b"]);
	});
});

describe("spliceSectionOrder", () => {
	it("replaces only the section's slots, leaving other ids' positions untouched", () => {
		const result = spliceSectionOrder(
			["x1", "a", "x2", "b", "c", "x3"],
			["a", "b", "c"],
			["c", "a", "b"],
		);
		expect(result).toEqual(["x1", "c", "x2", "a", "b", "x3"]);
	});

	it("a room not in any visible section is preserved untouched after a same-section reorder", () => {
		const fullOrder = ["siteA-1", "siteA-2", "siteB-1", "siteB-2"];
		const result = spliceSectionOrder(
			fullOrder,
			["siteA-1", "siteA-2"],
			["siteA-2", "siteA-1"],
		);
		expect(result).toEqual(["siteA-2", "siteA-1", "siteB-1", "siteB-2"]);
	});

	it("no-op when the new section order matches the old one", () => {
		const result = spliceSectionOrder(["a", "b", "c"], ["a", "b"], ["a", "b"]);
		expect(result).toEqual(["a", "b", "c"]);
	});

	it("empty section: returns fullOrder unchanged", () => {
		const result = spliceSectionOrder(["a", "b", "c"], [], []);
		expect(result).toEqual(["a", "b", "c"]);
	});
});
