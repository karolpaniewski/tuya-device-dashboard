import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks hoisted before import resolution — prevents ~/env Zod validation from firing.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";
import { devices, gateways, rooms } from "~/server/db/schema";

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
		await expect(caller.room.list({ siteId: "all" })).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("room.create throws UNAUTHORIZED", async () => {
		await expect(
			caller.room.create({ name: "x", siteId: "s1" }),
		).rejects.toMatchObject({
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

	it("room.setSite throws UNAUTHORIZED", async () => {
		await expect(
			caller.room.setSite({ roomId: "r1", targetSiteId: "s2" }),
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
		const result = await caller.room.list({ siteId: "all" });
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
		const result = await caller.room.list({ siteId: "all" });
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
		const result = await caller.room.create({ name: "New Room", siteId: "s1" });
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
					where: vi.fn().mockResolvedValue([{ id: "r1", siteId: "s1" }]),
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

	it("throws CROSS_SITE_ASSIGNMENT when room and device are in different sites", async () => {
		const deleteMock = vi.fn();
		const mockDb = {
			select: vi
				.fn()
				// room select — siteId: "site-a"
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1", siteId: "site-a" }]),
					}),
				})
				// device select — siteId: "site-b"
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ siteId: "site-b" }]),
					}),
				}),
			insert: deleteMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		await expect(
			caller.room.setDeviceRoom({ deviceId: "d1", roomId: "r1" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "CROSS_SITE_ASSIGNMENT",
		});
		expect(deleteMock).not.toHaveBeenCalled();
	});
});

// ─── room.list — scoping ─────────────────────────────────────────────────────

describe("room.list — scoping", () => {
	it("siteId='site-a': returns only rooms from site-a", async () => {
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi
								.fn()
								.mockResolvedValue([
									{ id: "r1", name: "Room A", createdAt: new Date() },
								]),
						}),
					}),
				})
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) }),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.list({ siteId: "site-a" });
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("Room A");
	});

	it("siteId='all': returns rooms from all sites", async () => {
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockResolvedValue([
							{ id: "r1", name: "Room A", createdAt: new Date() },
							{ id: "r2", name: "Room B", createdAt: new Date() },
						]),
					}),
				})
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) }),
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});
		const result = await caller.room.list({ siteId: "all" });
		expect(result).toHaveLength(2);
	});
});

// ─── room.setSite ────────────────────────────────────────────────────────────

describe("room.setSite", () => {
	it("happy path: cascades rooms, devices, and gateway updates when the gateway is exclusive to this room", async () => {
		const setMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const txUpdateMock = vi.fn().mockReturnValue({ set: setMock });
		const transactionMock = vi.fn(async (cb) => cb({ update: txUpdateMock }));
		const mockDb = {
			select: vi
				.fn()
				// target site exists
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "s2" }]),
					}),
				})
				// room exists, currently on s1
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1", siteId: "s1" }]),
					}),
				})
				// assigned devices
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([{ deviceId: "d1" }, { deviceId: "d2" }]),
					}),
				})
				// devices' gatewayIds
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([{ gatewayId: "g1" }, { gatewayId: "g1" }]),
					}),
				})
				// gateway exclusivity check — every device on g1 belongs to r1
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{ deviceId: "d1", gatewayId: "g1", roomId: "r1" },
								{ deviceId: "d2", gatewayId: "g1", roomId: "r1" },
							]),
						}),
					}),
				}),
			transaction: transactionMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.room.setSite({
			roomId: "r1",
			targetSiteId: "s2",
		});

		expect(result).toEqual({ success: true });
		expect(transactionMock).toHaveBeenCalled();
		expect(txUpdateMock).toHaveBeenCalledTimes(3);
		expect(txUpdateMock).toHaveBeenNthCalledWith(1, rooms);
		expect(txUpdateMock).toHaveBeenNthCalledWith(2, devices);
		expect(txUpdateMock).toHaveBeenNthCalledWith(3, gateways);
		expect(setMock).toHaveBeenCalledTimes(3);
		expect(setMock).toHaveBeenNthCalledWith(1, { siteId: "s2" });
		expect(setMock).toHaveBeenNthCalledWith(2, { siteId: "s2" });
		expect(setMock).toHaveBeenNthCalledWith(3, { siteId: "s2" });
	});

	it("same-site rejection: targetSiteId === room.siteId throws BAD_REQUEST, no update runs", async () => {
		const transactionMock = vi.fn();
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "s1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1", siteId: "s1" }]),
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
			caller.room.setSite({ roomId: "r1", targetSiteId: "s1" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Room is already assigned to this site",
		});
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("target site not found: throws BAD_REQUEST, no update runs", async () => {
		const transactionMock = vi.fn();
		const mockDb = {
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
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
			caller.room.setSite({ roomId: "r1", targetSiteId: "bad-site" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Site not found" });
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("gateway shared with a different room: throws BAD_REQUEST GATEWAY_SHARED_WITH_OTHER_ROOM, no update runs", async () => {
		const transactionMock = vi.fn();
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "s2" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1", siteId: "s1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ deviceId: "d1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ gatewayId: "g1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{ deviceId: "d1", gatewayId: "g1", roomId: "r1" },
								{ deviceId: "d2", gatewayId: "g1", roomId: "r-other" },
							]),
						}),
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
			caller.room.setSite({ roomId: "r1", targetSiteId: "s2" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "GATEWAY_SHARED_WITH_OTHER_ROOM",
		});
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("gateway shared with an unassigned device (no room): throws BAD_REQUEST GATEWAY_SHARED_WITH_OTHER_ROOM, no update runs", async () => {
		const transactionMock = vi.fn();
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "s2" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1", siteId: "s1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ deviceId: "d1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ gatewayId: "g1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{ deviceId: "d1", gatewayId: "g1", roomId: "r1" },
								{ deviceId: "d2", gatewayId: "g1", roomId: null },
							]),
						}),
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
			caller.room.setSite({ roomId: "r1", targetSiteId: "s2" }),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "GATEWAY_SHARED_WITH_OTHER_ROOM",
		});
		expect(transactionMock).not.toHaveBeenCalled();
	});

	it("no-gateway room: devices have gatewayId null — succeeds, updates rooms and devices only", async () => {
		const setMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const txUpdateMock = vi.fn().mockReturnValue({ set: setMock });
		const transactionMock = vi.fn(async (cb) => cb({ update: txUpdateMock }));
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "s2" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1", siteId: "s1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ deviceId: "d1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ gatewayId: null }]),
					}),
				}),
			transaction: transactionMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.room.setSite({
			roomId: "r1",
			targetSiteId: "s2",
		});

		expect(result).toEqual({ success: true });
		expect(txUpdateMock).toHaveBeenCalledTimes(2);
		expect(txUpdateMock).toHaveBeenNthCalledWith(1, rooms);
		expect(txUpdateMock).toHaveBeenNthCalledWith(2, devices);
	});

	it("no-devices room: succeeds, only the rooms update runs", async () => {
		const setMock = vi
			.fn()
			.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const txUpdateMock = vi.fn().mockReturnValue({ set: setMock });
		const transactionMock = vi.fn(async (cb) => cb({ update: txUpdateMock }));
		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "s2" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([{ id: "r1", siteId: "s1" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
			transaction: transactionMock,
		};
		const caller = createCaller({
			db: mockDb as never,
			session,
			headers: new Headers(),
		});

		const result = await caller.room.setSite({
			roomId: "r1",
			targetSiteId: "s2",
		});

		expect(result).toEqual({ success: true });
		expect(txUpdateMock).toHaveBeenCalledTimes(1);
		expect(txUpdateMock).toHaveBeenNthCalledWith(1, rooms);
	});
});
