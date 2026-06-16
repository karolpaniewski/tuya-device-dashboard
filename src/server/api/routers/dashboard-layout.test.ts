import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { DEFAULT_WIDGET_ORDER } from "~/lib/dashboard-widgets";
import { createCaller } from "~/server/api/root";

const session = {
	user: { id: "u1", email: "test@test.com" },
} as never;

afterEach(() => vi.resetAllMocks());

// ─── Auth gate ────────────────────────────────────────────────────────────────

describe("dashboardLayout — auth gate", () => {
	const caller = createCaller({
		db: {} as never,
		session: null,
		headers: new Headers(),
	});

	it("dashboardLayout.get throws UNAUTHORIZED", async () => {
		await expect(caller.dashboardLayout.get()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("dashboardLayout.save throws UNAUTHORIZED", async () => {
		await expect(
			caller.dashboardLayout.save({
				widgetOrder: [],
				hiddenWidgets: [],
				roomOrder: [],
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

// ─── dashboardLayout.get ─────────────────────────────────────────────────────

describe("dashboardLayout.get", () => {
	it("returns an all-defaults shape when no row exists yet", async () => {
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

		const result = await caller.dashboardLayout.get();

		expect(result).toEqual({
			widgetOrder: [...DEFAULT_WIDGET_ORDER],
			hiddenWidgets: [],
			roomOrder: [],
		});
	});

	it("parses the stored row's JSON-text columns", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							id: "default",
							widgetOrder: JSON.stringify(["kpi-alerts", "kpi-devices"]),
							hiddenWidgets: JSON.stringify(["kpi-by-room"]),
							roomOrder: JSON.stringify(["room-1", "room-2"]),
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

		const result = await caller.dashboardLayout.get();

		expect(result).toEqual({
			widgetOrder: ["kpi-alerts", "kpi-devices"],
			hiddenWidgets: ["kpi-by-room"],
			roomOrder: ["room-1", "room-2"],
		});
	});
});

// ─── dashboardLayout.save ────────────────────────────────────────────────────

describe("dashboardLayout.save", () => {
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

		const result = await caller.dashboardLayout.save({
			widgetOrder: ["kpi-devices"],
			hiddenWidgets: [],
			roomOrder: ["room-1"],
		});

		expect(result).toEqual({ success: true });
		expect(onConflictMock).toHaveBeenCalled();
	});

	it("rejects malformed payloads (non-string array entries)", async () => {
		const mockDb = { insert: vi.fn() };
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		await expect(
			caller.dashboardLayout.save({
				// @ts-expect-error — intentionally malformed for validation test
				widgetOrder: [1, 2],
				hiddenWidgets: [],
				roomOrder: [],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
