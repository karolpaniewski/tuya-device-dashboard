import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks hoisted before import resolution — prevents ~/env Zod validation from firing.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/lib/mode-control", () => ({
	applyModeToRooms: vi.fn(),
}));

import { createCaller } from "~/server/api/root";
import { applyModeToRooms } from "~/server/lib/mode-control";

const session = {
	user: { id: "u1", email: "test@test.com" },
} as never;

afterEach(() => vi.resetAllMocks());

describe("mode.list", () => {
	it("returns modes scoped to siteId, with targets and parsed schedule", async () => {
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockResolvedValue([
							{
								modeId: "mode-1",
								roomId: "room-1",
								targetOn: true,
								roomName: "Living Room",
								roomSiteId: "site-1",
							},
							{
								modeId: "mode-2",
								roomId: "room-2",
								targetOn: false,
								roomName: "Garage",
								roomSiteId: "site-2",
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([
								{
									id: "mode-1",
									name: "Morning warm-up",
									daysOfWeek: JSON.stringify([1, 2]),
									fireHour: 7,
									fireMinute: 0,
								},
							]),
						}),
					}),
				}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.list({ siteId: "site-1" });

		expect(result).toEqual([
			{
				id: "mode-1",
				name: "Morning warm-up",
				daysOfWeek: [1, 2],
				fireHour: 7,
				fireMinute: 0,
				targets: [
					{ roomId: "room-1", roomName: "Living Room", targetOn: true },
				],
			},
		]);
	});

	it("returns an empty array when no mode targets a room in scope", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					innerJoin: vi.fn().mockResolvedValue([
						{
							modeId: "mode-2",
							roomId: "room-2",
							targetOn: false,
							roomName: "Garage",
							roomSiteId: "site-2",
						},
					]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.list({ siteId: "site-1" });

		expect(result).toEqual([]);
	});
});

describe("mode.create", () => {
	const baseInput = {
		name: "Evening cooldown",
		targets: [{ roomId: "room-1", targetOn: true }],
		schedule: null,
	};

	it("schedule null: skips the overlap check entirely and creates the mode", async () => {
		const returningMock = vi.fn().mockResolvedValue([{ id: "mode-new" }]);
		const txInsertMock = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({ returning: returningMock }),
			})
			.mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });
		const transactionMock = vi.fn(async (cb) => cb({ insert: txInsertMock }));
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ id: "room-1", siteId: "s1" }]),
				}),
			}),
			transaction: transactionMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.create(baseInput);

		expect(result).toEqual({ id: "mode-new", warnings: [] });
		expect(transactionMock).toHaveBeenCalled();
	});

	it("targets spanning two sites: throws CROSS_SITE_TARGETS, never opens a transaction", async () => {
		const transactionMock = vi.fn();
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{ id: "room-1", siteId: "s1" },
						{ id: "room-2", siteId: "s2" },
					]),
				}),
			}),
			transaction: transactionMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		await expect(
			caller.mode.create({
				...baseInput,
				targets: [
					{ roomId: "room-1", targetOn: true },
					{ roomId: "room-2", targetOn: false },
				],
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "CROSS_SITE_TARGETS",
		});
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("schedule overlaps another mode's schedule on a shared room: warns but still creates the mode", async () => {
		const returningMock = vi.fn().mockResolvedValue([{ id: "mode-new" }]);
		const txInsertMock = vi
			.fn()
			.mockReturnValueOnce({
				values: vi.fn().mockReturnValue({ returning: returningMock }),
			})
			.mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });
		const transactionMock = vi.fn(async (cb) => cb({ insert: txInsertMock }));
		const mockDb = {
			select: vi
				.fn()
				// validateTargetsSameSite
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "room-1", siteId: "s1" }]),
					}),
				})
				// findOverlapWarnings: other modes' targets on room-1
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi
								.fn()
								.mockResolvedValue([{ modeId: "mode-x", roomName: "Room 1" }]),
						}),
					}),
				})
				// findOverlapWarnings: the other modes themselves
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "mode-x",
								name: "Evening",
								daysOfWeek: JSON.stringify([1, 2]),
								fireHour: 7,
								fireMinute: 0,
							},
						]),
					}),
				}),
			transaction: transactionMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.create({
			...baseInput,
			schedule: { daysOfWeek: [1], fireHour: 7, fireMinute: 0 },
		});

		expect(result.id).toBe("mode-new");
		expect(result.warnings).toEqual([
			'Overlaps with mode "Evening" on Room 1 at the same day/time',
		]);
		expect(transactionMock).toHaveBeenCalled();
	});
});

describe("mode.update", () => {
	it("throws NOT_FOUND when the mode does not exist", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
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
			caller.mode.update({
				id: "mode-missing",
				name: "X",
				targets: [{ roomId: "room-1", targetOn: true }],
				schedule: null,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("happy path: full-replaces targets and updates the mode row in one transaction", async () => {
		const txUpdateSetMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const txUpdateMock = vi.fn().mockReturnValue({ set: txUpdateSetMock });
		const txDeleteMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const txInsertMock = vi
			.fn()
			.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
		const transactionMock = vi.fn(async (cb) =>
			cb({ update: txUpdateMock, delete: txDeleteMock, insert: txInsertMock }),
		);
		const mockDb = {
			select: vi
				.fn()
				// existing mode check
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "mode-1" }]),
					}),
				})
				// validateTargetsSameSite
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "room-1", siteId: "s1" }]),
					}),
				}),
			transaction: transactionMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.update({
			id: "mode-1",
			name: "Renamed",
			targets: [{ roomId: "room-1", targetOn: false }],
			schedule: null,
		});

		expect(result).toEqual({ id: "mode-1", warnings: [] });
		expect(txUpdateMock).toHaveBeenCalled();
		expect(txDeleteMock).toHaveBeenCalled();
		expect(txInsertMock).toHaveBeenCalled();
	});
});

describe("mode.delete", () => {
	it("throws NOT_FOUND when the mode does not exist", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
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
			caller.mode.delete({ id: "mode-missing" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("deletes the mode row and returns success", async () => {
		const deleteMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ id: "mode-1" }]),
				}),
			}),
			delete: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.delete({ id: "mode-1" });

		expect(result).toEqual({ success: true });
		expect(deleteMock).toHaveBeenCalled();
	});
});

describe("mode.addTarget", () => {
	it("happy path: inserts a target row with targetOn true and returns success", async () => {
		const insertValuesMock = vi.fn().mockResolvedValue(undefined);
		const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ id: "mode-1" }]),
				}),
			}),
			insert: insertMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.addTarget({
			modeId: "mode-1",
			roomId: "room-1",
		});

		expect(result).toEqual({ success: true });
		expect(insertMock).toHaveBeenCalled();
		expect(insertValuesMock).toHaveBeenCalledWith({
			modeId: "mode-1",
			roomId: "room-1",
			targetOn: true,
		});
	});

	it("throws NOT_FOUND when the mode does not exist", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
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
			caller.mode.addTarget({ modeId: "mode-missing", roomId: "room-1" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("propagates error when the (modeId, roomId) pair already exists", async () => {
		const insertValuesMock = vi
			.fn()
			.mockRejectedValue(new Error("UNIQUE constraint failed"));
		const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ id: "mode-1" }]),
				}),
			}),
			insert: insertMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		await expect(
			caller.mode.addTarget({ modeId: "mode-1", roomId: "room-1" }),
		).rejects.toThrow("UNIQUE constraint failed");
	});
});

describe("mode.removeTarget", () => {
	it("happy path: deletes the target row and returns success", async () => {
		const deleteMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const mockDb = {
			delete: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.removeTarget({
			modeId: "mode-1",
			roomId: "room-1",
		});

		expect(result).toEqual({ success: true });
		expect(deleteMock).toHaveBeenCalled();
	});

	it("returns success when the (modeId, roomId) pair does not exist (idempotent)", async () => {
		const deleteMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const mockDb = {
			delete: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.removeTarget({
			modeId: "mode-missing",
			roomId: "room-missing",
		});

		expect(result).toEqual({ success: true });
		expect(deleteMock).toHaveBeenCalled();
	});
});

describe("mode.trigger", () => {
	it("throws NOT_FOUND when the mode does not exist", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
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
			caller.mode.trigger({ id: "mode-missing" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(applyModeToRooms).not.toHaveBeenCalled();
	});

	it("happy path: loads targets and delegates to applyModeToRooms with triggeredBy 'manual'", async () => {
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "mode-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([{ roomId: "room-1", targetOn: true }]),
					}),
				}),
		};
		vi.mocked(applyModeToRooms).mockResolvedValue([
			{ roomId: "room-1", status: "applied" },
		]);
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.mode.trigger({ id: "mode-1" });

		expect(applyModeToRooms).toHaveBeenCalledWith(
			"mode-1",
			[{ roomId: "room-1", targetOn: true }],
			"manual",
		);
		expect(result).toEqual({
			results: [{ roomId: "room-1", status: "applied" }],
		});
	});
});
