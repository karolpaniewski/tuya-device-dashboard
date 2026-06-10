import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks hoisted before import resolution — prevents ~/env Zod validation from firing.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";

const session = {
	user: { id: "u1", email: "test@test.com" },
} as never;

afterEach(() => vi.resetAllMocks());

// ─── Auth gate ───────────────────────────────────────────────────────────────

describe("room — auth gate", () => {
	const caller = createCaller({
		db: {} as never,
		session: null,
		headers: new Headers(),
	});

	it("room.list throws UNAUTHORIZED", async () => {
		await expect(caller.room.list()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("room.create throws UNAUTHORIZED", async () => {
		await expect(caller.room.create({ name: "x" })).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("room.rename throws UNAUTHORIZED", async () => {
		await expect(
			caller.room.rename({ id: "r1", name: "x" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("room.delete throws UNAUTHORIZED", async () => {
		await expect(caller.room.delete({ id: "r1" })).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("room.setDeviceRoom throws UNAUTHORIZED", async () => {
		await expect(
			caller.room.setDeviceRoom({ deviceId: "d1", roomId: "r1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

// ─── room.list ───────────────────────────────────────────────────────────────

describe("room.list", () => {
	it("returns rooms with deviceCount aggregated from assignments", async () => {
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						orderBy: vi
							.fn()
							.mockResolvedValue([
								{ id: "r1", name: "Room 1", createdAt: new Date() },
							]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ roomId: "r1" }, { roomId: "r1" }]),
				}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.list();
		expect(result).toEqual([{ id: "r1", name: "Room 1", deviceCount: 2 }]);
	});

	it("returns deviceCount 0 for rooms with no assignments", async () => {
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						orderBy: vi
							.fn()
							.mockResolvedValue([
								{ id: "r1", name: "Empty Room", createdAt: new Date() },
							]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([]),
				}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.list();
		expect(result[0]?.deviceCount).toBe(0);
	});
});

// ─── room.create ─────────────────────────────────────────────────────────────

describe("room.create", () => {
	it("returns the created room", async () => {
		const mockDb = {
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi
						.fn()
						.mockResolvedValue([{ id: "r1", name: "New Room" }]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.create({ name: "New Room" });
		expect(result).toEqual({ id: "r1", name: "New Room" });
	});
});

// ─── room.rename ─────────────────────────────────────────────────────────────

describe("room.rename", () => {
	it("happy path: returns updated room", async () => {
		const mockDb = {
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi
							.fn()
							.mockResolvedValue([{ id: "r1", name: "Renamed" }]),
					}),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.rename({ id: "r1", name: "Renamed" });
		expect(result).toEqual({ id: "r1", name: "Renamed" });
	});

	it("throws NOT_FOUND when room does not exist", async () => {
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
			caller.room.rename({ id: "bad", name: "x" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ─── room.delete ─────────────────────────────────────────────────────────────

describe("room.delete", () => {
	it("happy path: deletes room when no devices are assigned", async () => {
		const deleteMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			delete: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.delete({ id: "r1" });
		expect(result).toEqual({ success: true });
		expect(deleteMock).toHaveBeenCalled();
	});

	it("throws BAD_REQUEST and does NOT call delete when devices are assigned", async () => {
		// Oracle: the guard fires before delete — deleteMock must not be called.
		// This is the highest-signal test: a broken guard (that lets delete through)
		// would still return success but orphan the assignments.
		const deleteMock = vi.fn();
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ deviceId: "d1" }]),
				}),
			}),
			delete: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		await expect(caller.room.delete({ id: "r1" })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(deleteMock).not.toHaveBeenCalled();
	});
});

// ─── room.setDeviceRoom ──────────────────────────────────────────────────────

describe("room.setDeviceRoom", () => {
	it("assign: upserts assignment and returns success", async () => {
		const onConflictMock = vi.fn().mockResolvedValue(undefined);
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ id: "r1" }]),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoUpdate: onConflictMock,
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.setDeviceRoom({
			deviceId: "d1",
			roomId: "r1",
		});
		expect(result).toEqual({ success: true });
		expect(onConflictMock).toHaveBeenCalled();
	});

	it("unassign: deletes assignment when roomId is null", async () => {
		const whereMock = vi.fn().mockResolvedValue(undefined);
		const mockDb = {
			delete: vi.fn().mockReturnValue({ where: whereMock }),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.setDeviceRoom({
			deviceId: "d1",
			roomId: null,
		});
		expect(result).toEqual({ success: true });
		expect(whereMock).toHaveBeenCalled();
	});

	it("throws NOT_FOUND when roomId references a non-existent room", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		await expect(
			caller.room.setDeviceRoom({ deviceId: "d1", roomId: "bad-room" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
