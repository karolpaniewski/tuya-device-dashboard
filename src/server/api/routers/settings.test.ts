import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("bcryptjs", () => ({
	default: { compare: vi.fn(), hash: vi.fn() },
}));

import bcryptjs from "bcryptjs";
import { createCaller } from "~/server/api/root";
import { DEFAULT_THRESHOLDS } from "~/server/lib/scoring";

const session = {
	user: { id: "u1", email: "test@test.com" },
} as never;

afterEach(() => vi.resetAllMocks());

// ─── Auth gate ────────────────────────────────────────────────────────────────

describe("settings — auth gate", () => {
	const caller = createCaller({
		db: {} as never,
		session: null,
		headers: new Headers(),
	});

	it("settings.getDefaultThresholds throws UNAUTHORIZED", async () => {
		await expect(caller.settings.getDefaultThresholds()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("settings.setDefaultThresholds throws UNAUTHORIZED", async () => {
		await expect(
			caller.settings.setDefaultThresholds({
				minTempC: 18,
				maxTempC: 24,
				anomalyGapC: 3,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("settings.changePassword throws UNAUTHORIZED", async () => {
		await expect(
			caller.settings.changePassword({
				currentPassword: "old",
				newPassword: "newpass123",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

// ─── settings.getDefaultThresholds ──────────────────────────────────────────

describe("settings.getDefaultThresholds", () => {
	it("returns the in-code constant when no row exists yet", async () => {
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

		const result = await caller.settings.getDefaultThresholds();

		expect(result).toEqual(DEFAULT_THRESHOLDS);
	});

	it("returns the stored row's values when present", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							id: "default",
							minTempC: 19,
							maxTempC: 25,
							anomalyGapC: 4,
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

		const result = await caller.settings.getDefaultThresholds();

		expect(result).toEqual({ minTempC: 19, maxTempC: 25, anomalyGapC: 4 });
	});
});

// ─── settings.setDefaultThresholds ──────────────────────────────────────────

describe("settings.setDefaultThresholds", () => {
	it("upserts the singleton row and returns success", async () => {
		const onConflictMock = vi.fn().mockResolvedValue(undefined);
		const mockDb = {
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

		const result = await caller.settings.setDefaultThresholds({
			minTempC: 18,
			maxTempC: 24,
			anomalyGapC: 3,
		});

		expect(result).toEqual({ success: true });
		expect(onConflictMock).toHaveBeenCalled();
	});

	it("rejects min >= max with BAD_REQUEST", async () => {
		const mockDb = { insert: vi.fn() };
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		await expect(
			caller.settings.setDefaultThresholds({
				minTempC: 24,
				maxTempC: 24,
				anomalyGapC: 3,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

// ─── settings.changePassword ─────────────────────────────────────────────────

describe("settings.changePassword — wrong password", () => {
	it("throws UNAUTHORIZED", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ id: "u1", passwordHash: "hashed" }]),
					}),
				}),
			}),
		};
		vi.mocked(bcryptjs.compare).mockResolvedValue(false as never);
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		await expect(
			caller.settings.changePassword({
				currentPassword: "wrong",
				newPassword: "newpass123",
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("settings.changePassword — success", () => {
	it("returns { success: true } and writes the new hash", async () => {
		const updateWhere = vi.fn().mockResolvedValue(undefined);
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ id: "u1", passwordHash: "old-hash" }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: updateWhere,
				}),
			}),
		};
		vi.mocked(bcryptjs.compare).mockResolvedValue(true as never);
		vi.mocked(bcryptjs.hash).mockResolvedValue("new-hash" as never);
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.settings.changePassword({
			currentPassword: "correct",
			newPassword: "newpass123",
		});

		expect(result).toEqual({ success: true });
		expect(bcryptjs.hash).toHaveBeenCalledWith("newpass123", 12);
		expect(updateWhere).toHaveBeenCalled();
	});
});
