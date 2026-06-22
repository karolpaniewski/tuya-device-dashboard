import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks hoisted before import resolution — prevents ~/env Zod validation from firing.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/lib/valve-control", () => ({
	sendValveStateCommand: vi.fn(),
}));

import { createCaller } from "~/server/api/root";
import { sendValveStateCommand } from "~/server/lib/valve-control";

const session = {
	user: { id: "u1", email: "test@test.com" },
} as never;

afterEach(() => vi.resetAllMocks());

describe("room.toggleHeat", () => {
	it("throws NOT_FOUND when room does not exist", async () => {
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
			caller.room.toggleHeat({ roomId: "bad-room", pinnedOff: true }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("toggling off with all valves succeeding: pin persisted, sendValveStateCommand called with isOpen: false for each valve", async () => {
		const onConflictMock = vi.fn().mockResolvedValue(undefined);
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi
								.fn()
								.mockResolvedValue([{ deviceId: "d1" }, { deviceId: "d2" }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoUpdate: onConflictMock,
				}),
			}),
		};
		vi.mocked(sendValveStateCommand).mockResolvedValue(undefined);

		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.room.toggleHeat({
			roomId: "r1",
			pinnedOff: true,
		});

		expect(result).toEqual({
			success: true,
			pinnedOff: true,
			deviceErrors: [],
		});
		expect(onConflictMock).toHaveBeenCalled();
		expect(sendValveStateCommand).toHaveBeenCalledWith("d1", false);
		expect(sendValveStateCommand).toHaveBeenCalledWith("d2", false);
	});

	it("toggling off with one valve's command rejecting: pin still persisted, deviceErrors includes the failed device, mutation does not throw", async () => {
		const onConflictMock = vi.fn().mockResolvedValue(undefined);
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi
								.fn()
								.mockResolvedValue([{ deviceId: "d1" }, { deviceId: "d2" }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoUpdate: onConflictMock,
				}),
			}),
		};
		vi.mocked(sendValveStateCommand)
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("COMMAND_FAILED"));

		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.room.toggleHeat({
			roomId: "r1",
			pinnedOff: true,
		});

		expect(onConflictMock).toHaveBeenCalled();
		expect(result.success).toBe(true);
		expect(result.deviceErrors).toEqual([
			{ deviceId: "d2", message: "COMMAND_FAILED" },
		]);
	});

	it("toggling on: sendValveStateCommand called with isOpen: true", async () => {
		const onConflictMock = vi.fn().mockResolvedValue(undefined);
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([{ deviceId: "d1" }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					onConflictDoUpdate: onConflictMock,
				}),
			}),
		};
		vi.mocked(sendValveStateCommand).mockResolvedValue(undefined);

		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.room.toggleHeat({
			roomId: "r1",
			pinnedOff: false,
		});

		expect(result).toEqual({
			success: true,
			pinnedOff: false,
			deviceErrors: [],
		});
		expect(sendValveStateCommand).toHaveBeenCalledWith("d1", true);
	});
});
