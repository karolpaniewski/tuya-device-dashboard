import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

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
