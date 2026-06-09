import { describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
// Without these, importing createCaller triggers ~/server/auth and ~/server/db
// which fire ~/env Zod validation against the real env vars.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";

describe("device.overview — auth gate", () => {
	it("throws UNAUTHORIZED when session is null", async () => {
		const caller = createCaller({
			// db is never reached: enforceUserIsAuthed fires before the procedure body
			db: {} as never,
			session: null,
			headers: new Headers(),
		});
		await expect(caller.device.overview()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
