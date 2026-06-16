import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks hoisted before import resolution — prevents ~/env Zod validation from firing.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";

const session = {
	user: { id: "u1", email: "test@test.com" },
} as never;

const baseInput = {
	name: "Morning warm-up",
	deviceId: "device-1",
	daysOfWeek: [1],
	fireHour: 7,
	fireMinute: 0,
	targetSetpointC: 21,
};

const validDevice = { id: "device-1", deviceType: "valve" };

afterEach(() => vi.resetAllMocks());

describe("automation.create — conflict detection", () => {
	it("different rooms, same time/day: does NOT conflict and creates the rule", async () => {
		const insertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: "rule-new" }]),
		});
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([validDevice]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ deviceId: "device-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						// rule from a different room never matches the inArray filter
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.automation.create(baseInput);

		expect(result).toEqual({ id: "rule-new" });
		expect(insertValues).toHaveBeenCalled();
	});

	it("same room, different time, same day: does NOT conflict and creates the rule", async () => {
		const insertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: "rule-new" }]),
		});
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([validDevice]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([
								{ deviceId: "device-1" },
								{ deviceId: "device-2" },
							]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([
								{ daysOfWeek: JSON.stringify([1]), fireHour: 9, fireMinute: 0 },
							]),
					}),
				}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.automation.create(baseInput);

		expect(result).toEqual({ id: "rule-new" });
		expect(insertValues).toHaveBeenCalled();
	});

	it("same room, same time, non-overlapping days: does NOT conflict and creates the rule", async () => {
		const insertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: "rule-new" }]),
		});
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([validDevice]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ deviceId: "device-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								daysOfWeek: JSON.stringify([2, 3]),
								fireHour: 7,
								fireMinute: 0,
							},
						]),
					}),
				}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.automation.create(baseInput);

		expect(result).toEqual({ id: "rule-new" });
		expect(insertValues).toHaveBeenCalled();
	});

	it("same room, same time, one overlapping day: IS a conflict and does NOT insert", async () => {
		const insertMock = vi.fn();
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([validDevice]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ roomId: "room-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ deviceId: "device-1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								daysOfWeek: JSON.stringify([1, 2]),
								fireHour: 7,
								fireMinute: 0,
							},
						]),
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
			caller.automation.create({ ...baseInput, daysOfWeek: [1, 5] }),
		).rejects.toMatchObject({ code: "BAD_REQUEST", message: "RULE_CONFLICT" });
		expect(insertMock).not.toHaveBeenCalled();
	});

	it("no room assignment: is NOT blocked and creates the rule", async () => {
		const insertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: "rule-new" }]),
		});
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([validDevice]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.automation.create(baseInput);

		expect(result).toEqual({ id: "rule-new" });
		expect(insertValues).toHaveBeenCalled();
	});
});
