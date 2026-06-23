import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";

const session = {
	user: { id: "u1", email: "test@test.com" },
} as never;

afterEach(() => vi.resetAllMocks());

// ─── Auth gate ────────────────────────────────────────────────────────────────

describe("notification — auth gate", () => {
	const caller = createCaller({
		db: {} as never,
		session: null,
		headers: new Headers(),
	});

	it("notification.list throws UNAUTHORIZED", async () => {
		await expect(caller.notification.list()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("notification.create throws UNAUTHORIZED", async () => {
		await expect(
			caller.notification.create({ email: "x@test.com" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("notification.delete throws UNAUTHORIZED", async () => {
		await expect(
			caller.notification.delete({ id: "c1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

// ─── notification.list ───────────────────────────────────────────────────────

describe("notification.list", () => {
	it("returns empty list", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockResolvedValue([]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.notification.list();
		expect(result).toEqual([]);
	});

	it("returns contacts ordered by createdAt", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockResolvedValue([
						{ id: "c1", email: "a@test.com", createdAt: new Date(1) },
						{ id: "c2", email: "b@test.com", createdAt: new Date(2) },
					]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.notification.list();
		expect(result).toHaveLength(2);
		expect(result[0]?.email).toBe("a@test.com");
	});
});

// ─── notification.create ─────────────────────────────────────────────────────

describe("notification.create", () => {
	it("returns the created contact", async () => {
		const mockDb = {
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi
						.fn()
						.mockResolvedValue([
							{ id: "c1", email: "new@test.com", createdAt: new Date() },
						]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.notification.create({
			email: "new@test.com",
		});
		expect(result).toMatchObject({ id: "c1", email: "new@test.com" });
	});

	it("throws DUPLICATE_CONTACT on a unique-constraint violation", async () => {
		// Mirrors the real shape: drizzle wraps the libsql driver error in a
		// DrizzleQueryError, so `code` lands on `.cause`, not on the error itself.
		const driverError = Object.assign(new Error("UNIQUE constraint failed"), {
			code: "SQLITE_CONSTRAINT_UNIQUE",
			libsqlError: true,
		});
		const queryError = Object.assign(new Error("Failed query"), {
			cause: driverError,
		});
		const mockDb = {
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockRejectedValue(queryError),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		await expect(
			caller.notification.create({ email: "dup@test.com" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "DUPLICATE_CONTACT",
		});
	});
});

// ─── notification.delete ─────────────────────────────────────────────────────

describe("notification.delete", () => {
	it("deletes an existing contact", async () => {
		const mockDb = {
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([{ id: "c1" }]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.notification.delete({ id: "c1" });
		expect(result).toEqual({ success: true });
	});

	it("throws NOT_FOUND when contact does not exist", async () => {
		const mockDb = {
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		await expect(
			caller.notification.delete({ id: "missing" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
