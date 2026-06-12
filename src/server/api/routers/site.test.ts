import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";

const session = {
	user: { id: "u1", email: "test@test.com" },
} as never;

afterEach(() => vi.resetAllMocks());

// ─── Auth gate ────────────────────────────────────────────────────────────────

describe("site — auth gate", () => {
	const caller = createCaller({
		db: {} as never,
		session: null,
		headers: new Headers(),
	});

	it("site.list throws UNAUTHORIZED", async () => {
		await expect(caller.site.list()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("site.create throws UNAUTHORIZED", async () => {
		await expect(caller.site.create({ name: "x" })).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("site.rename throws UNAUTHORIZED", async () => {
		await expect(
			caller.site.rename({ id: "s1", name: "x" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("site.delete throws UNAUTHORIZED", async () => {
		await expect(caller.site.delete({ id: "s1" })).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});

// ─── site.list ────────────────────────────────────────────────────────────────

describe("site.list", () => {
	it("returns sites ordered by name", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockResolvedValue([
						{ id: "s1", name: "Alpha", createdAt: new Date() },
						{ id: "s2", name: "Beta", createdAt: new Date() },
					]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.site.list();
		expect(result).toHaveLength(2);
		expect(result[0]?.name).toBe("Alpha");
	});
});

// ─── site.create ─────────────────────────────────────────────────────────────

describe("site.create", () => {
	it("returns the created site", async () => {
		const mockDb = {
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi
						.fn()
						.mockResolvedValue([{ id: "s1", name: "New Site" }]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.site.create({ name: "New Site" });
		expect(result).toEqual({ id: "s1", name: "New Site" });
	});
});

// ─── site.rename ─────────────────────────────────────────────────────────────

describe("site.rename", () => {
	it("happy path: returns updated site", async () => {
		const mockDb = {
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi
							.fn()
							.mockResolvedValue([{ id: "s1", name: "Renamed" }]),
					}),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.site.rename({ id: "s1", name: "Renamed" });
		expect(result).toEqual({ id: "s1", name: "Renamed" });
	});

	it("throws NOT_FOUND when site does not exist", async () => {
		const mockDb = {
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		await expect(
			caller.site.rename({ id: "bad", name: "x" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ─── site.delete ─────────────────────────────────────────────────────────────

describe("site.delete", () => {
	it("happy path: deletes site when empty and not the last", async () => {
		const deleteMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const mockDb = {
			select: vi
				.fn()
				// allSites — two sites exist
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]),
				})
				// rooms check — none
				.mockReturnValueOnce({
					from: vi
						.fn()
						.mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
				})
				// gateways check — none
				.mockReturnValueOnce({
					from: vi
						.fn()
						.mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
				}),
			delete: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.site.delete({ id: "s1" });
		expect(result).toEqual({ success: true });
		expect(deleteMock).toHaveBeenCalled();
	});

	it("throws CANNOT_DELETE_LAST_SITE when only one site remains", async () => {
		const deleteMock = vi.fn();
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockResolvedValue([{ id: "s1" }]),
			}),
			delete: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		await expect(caller.site.delete({ id: "s1" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "CANNOT_DELETE_LAST_SITE",
		});
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it("throws SITE_NOT_EMPTY and does NOT delete when rooms exist", async () => {
		const deleteMock = vi.fn();
		const mockDb = {
			select: vi
				.fn()
				// allSites — two sites
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]),
				})
				// rooms — has a room
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1" }]),
					}),
				}),
			delete: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		await expect(caller.site.delete({ id: "s1" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "SITE_NOT_EMPTY",
		});
		expect(deleteMock).not.toHaveBeenCalled();
	});
});
