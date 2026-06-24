import { afterEach, describe, expect, it, vi } from "vitest";

// Mocks are hoisted by Vitest before import resolution.
// Without these, importing createCaller triggers ~/server/auth and ~/server/db
// which fire ~/env Zod validation against the real env vars.
vi.mock("~/server/auth", () => ({ auth: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCaller } from "~/server/api/root";
import { deviceStateStore } from "~/server/lib/device-state-store";

describe("device.overview — auth gate", () => {
	it("throws UNAUTHORIZED when session is null", async () => {
		const caller = createCaller({
			// db is never reached: enforceUserIsAuthed fires before the procedure body
			db: {} as never,
			session: null,
			headers: new Headers(),
		});
		await expect(
			caller.device.overview({ siteId: "all" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});

describe("device.setMapPosition — auth gate", () => {
	it("throws UNAUTHORIZED when session is null", async () => {
		const caller = createCaller({
			db: {} as never,
			session: null,
			headers: new Headers(),
		});
		await expect(
			caller.device.setMapPosition({
				deviceId: "d1",
				siteId: "s1",
				xPct: 10,
				yPct: 20,
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("device.clearMapPosition — auth gate", () => {
	it("throws UNAUTHORIZED when session is null", async () => {
		const caller = createCaller({
			db: {} as never,
			session: null,
			headers: new Headers(),
		});
		await expect(
			caller.device.clearMapPosition({ deviceId: "d1", siteId: "s1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

describe("device.setMapPosition", () => {
	it("happy path: persists xPct/yPct on the matching device", async () => {
		const mockDb = {
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "d1" }]),
					}),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});
		const result = await caller.device.setMapPosition({
			deviceId: "d1",
			siteId: "s1",
			xPct: 42,
			yPct: 58,
		});
		expect(result).toEqual({ success: true });
	});

	it("throws NOT_FOUND when device does not exist", async () => {
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
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});
		await expect(
			caller.device.setMapPosition({
				deviceId: "bad",
				siteId: "s1",
				xPct: 1,
				yPct: 1,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("device.clearMapPosition", () => {
	it("happy path: nulls out the map position on the matching device", async () => {
		const mockDb = {
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([{ id: "d1" }]),
					}),
				}),
			}),
		};
		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});
		const result = await caller.device.clearMapPosition({
			deviceId: "d1",
			siteId: "s1",
		});
		expect(result).toEqual({ success: true });
	});

	it("throws NOT_FOUND when device does not exist", async () => {
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
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});
		await expect(
			caller.device.clearMapPosition({ deviceId: "bad", siteId: "s1" }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

describe("device.overview — stale detection", () => {
	afterEach(() => deviceStateStore.clear());

	const syntheticRow = {
		device: {
			id: "d1",
			tuyaDeviceId: "tuya-d1",
			name: "Dev",
			deviceType: "sensor",
			siteId: "default",
		},
		room: null,
	};

	function makeCallerWithRow() {
		const mockDb = {
			select: vi
				.fn()
				// First call: main devices+rooms query
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([syntheticRow]),
								}),
							}),
						}),
					}),
				})
				// Second call: roomHeatState query — no pins, returns []
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([]),
				})
				// Third call: roomAlertState query — no rows, returns []
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([]),
				})
				// Fourth call: roomThresholds query — no rooms assigned, returns []
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([]),
				})
				// Fifth call: sites query
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([]),
				})
				// Sixth call: defaultThresholds query — no row, falls back to constant
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		};
		return createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});
	}

	it("fresh data: isStale false", async () => {
		deviceStateStore.set("tuya-d1", {
			isOnline: true,
			temperatureC: 21,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(Date.now() - 10_000),
		});
		const result = await makeCallerWithRow().device.overview({ siteId: "all" });
		// biome-ignore lint/style/noNonNullAssertion: test seeds exactly one device; unassigned[0] is guaranteed
		expect(result.unassigned[0]!.isStale).toBe(false);
	});

	it("stale data: isStale true", async () => {
		deviceStateStore.set("tuya-d1", {
			isOnline: true,
			temperatureC: 21,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(Date.now() - 61_000),
		});
		const result = await makeCallerWithRow().device.overview({ siteId: "all" });
		// biome-ignore lint/style/noNonNullAssertion: test seeds exactly one device; unassigned[0] is guaranteed
		expect(result.unassigned[0]!.isStale).toBe(true);
	});

	it("never polled: isStale false, isOnline false", async () => {
		// store is clear from afterEach; verify device-absent path
		const result = await makeCallerWithRow().device.overview({ siteId: "all" });
		// biome-ignore lint/style/noNonNullAssertion: test seeds exactly one device; unassigned[0] is guaranteed
		const device = result.unassigned[0]!;
		expect(device.isStale).toBe(false);
		expect(device.isOnline).toBe(false);
		expect(device.lastPolledAt).toBeNull();
	});
});

describe("device.overview — room scoring", () => {
	afterEach(() => deviceStateStore.clear());

	const sensorRow = {
		device: {
			id: "d1",
			tuyaDeviceId: "tuya-d1",
			name: "Sensor 1",
			deviceType: "sensor",
			siteId: "default",
		},
		room: { id: "r1", name: "Living Room", siteId: "default" },
	};

	it("badge Too Cold and anomaly false when temp below min, setpoint null (PRD §FR-012)", async () => {
		deviceStateStore.set("tuya-d1", {
			isOnline: true,
			temperatureC: 15,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});

		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([sensorRow]),
								}),
							}),
						}),
					}),
				})
				// roomHeatState query — no pins
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// roomAlertState query — no rows
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				.mockReturnValueOnce({
					from: vi
						.fn()
						.mockResolvedValue([
							{ roomId: "r1", minTempC: 18, maxTempC: 24, anomalyGapC: 3 },
						]),
				})
				// Sites query
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "default", name: "Default" }]),
				})
				// defaultThresholds query — irrelevant here, room has its own override
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "all" });
		// Oracle: 15 < minTempC(18) → "Too Cold"; setpointC null → anomaly false
		expect(result.rooms[0]?.badge).toBe("Too Cold");
		expect(result.rooms[0]?.anomaly).toBe(false);
		expect(result.rooms[0]?.alertSent).toBe(false);
	});

	it("alertSent is true when roomAlertState has a non-null notifiedAt for the room", async () => {
		deviceStateStore.set("tuya-d1", {
			isOnline: true,
			temperatureC: 15,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});

		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([sensorRow]),
								}),
							}),
						}),
					}),
				})
				// roomHeatState query — no pins
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// roomAlertState query — r1 already notified for its active episode
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([
						{
							roomId: "r1",
							lastBadge: "Too Cold",
							enteredAt: new Date(),
							notifiedAt: new Date(),
						},
					]),
				})
				.mockReturnValueOnce({
					from: vi
						.fn()
						.mockResolvedValue([
							{ roomId: "r1", minTempC: 18, maxTempC: 24, anomalyGapC: 3 },
						]),
				})
				// Sites query
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "default", name: "Default" }]),
				})
				// defaultThresholds query — irrelevant here, room has its own override
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "all" });
		expect(result.rooms[0]?.alertSent).toBe(true);
	});

	it("room with no override falls back to the DB-backed default threshold, not the hardcoded constant (PRD §FR-012)", async () => {
		deviceStateStore.set("tuya-d1", {
			isOnline: true,
			temperatureC: 20,
			setpointC: null,
			humidityPct: null,
			isOn: null,
			lastPolledAt: new Date(),
		});

		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([sensorRow]),
								}),
							}),
						}),
					}),
				})
				// roomHeatState query — no pins
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// roomAlertState query — no rows
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// roomThresholds — no per-room override for r1
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Sites query
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "default", name: "Default" }]),
				})
				// defaultThresholds — DB row present, stricter than the hardcoded
				// constant (18-24): 20 < minTempC(21) → "Too Cold" only if the
				// DB row is actually used instead of the constant.
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "default",
								minTempC: 21,
								maxTempC: 25,
								anomalyGapC: 2,
							},
						]),
					}),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "all" });
		// Oracle: 20 < dbDefault.minTempC(21) → "Too Cold"; the hardcoded
		// constant's minTempC(18) would have scored this "OK" instead.
		expect(result.rooms[0]?.badge).toBe("Too Cold");
	});
});

// ─── device.overview — map position fields ───────────────────────────────────

describe("device.overview — map position fields", () => {
	afterEach(() => deviceStateStore.clear());

	it("surfaces mapXPct/mapYPct from the device row when placed", async () => {
		const placedRow = {
			device: {
				id: "d1",
				tuyaDeviceId: "tuya-d1",
				name: "Placed",
				deviceType: "sensor",
				siteId: "default",
				mapXPct: 42,
				mapYPct: 58,
			},
			room: null,
		};

		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([placedRow]),
								}),
							}),
						}),
					}),
				})
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "default", name: "Default" }]),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "all" });
		expect(result.unassigned[0]?.mapXPct).toBe(42);
		expect(result.unassigned[0]?.mapYPct).toBe(58);
	});

	it("defaults mapXPct/mapYPct to null when the device has not been placed", async () => {
		const unplacedRow = {
			device: {
				id: "d1",
				tuyaDeviceId: "tuya-d1",
				name: "Unplaced",
				deviceType: "sensor",
				siteId: "default",
				mapXPct: null,
				mapYPct: null,
			},
			room: null,
		};

		const mockDb = {
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([unplacedRow]),
								}),
							}),
						}),
					}),
				})
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "default", name: "Default" }]),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "all" });
		expect(result.unassigned[0]?.mapXPct).toBeNull();
		expect(result.unassigned[0]?.mapYPct).toBeNull();
	});
});

// ─── device.temperatureHistory ───────────────────────────────────────────────

describe("device.temperatureHistory", () => {
	it("returns bucketed data for '7d' range", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						groupBy: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([
								{
									bucket: 1700000000,
									temperatureC: "21.5",
									setpointC: "20.0",
								},
							]),
						}),
					}),
				}),
			}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.temperatureHistory({
			tuyaDeviceId: "d1",
			range: "7d",
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.recordedAt).toBeInstanceOf(Date);
		expect(result[0]?.temperatureC).toBe(21.5);
		expect(result[0]?.setpointC).toBe(20);
	});

	it("returns empty array when no readings exist", async () => {
		const mockDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						groupBy: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.temperatureHistory({
			tuyaDeviceId: "d1",
			range: "7d",
		});

		expect(result).toHaveLength(0);
	});
});

// ─── device.overview — scoping ───────────────────────────────────────────────

describe("device.overview — scoping", () => {
	afterEach(() => deviceStateStore.clear());

	it("siteId='site-a': returns only devices belonging to site-a", async () => {
		const rowSiteA = {
			device: {
				id: "d1",
				tuyaDeviceId: "tuya-d1",
				name: "Sensor A",
				deviceType: "sensor",
				siteId: "site-a",
			},
			room: null,
		};

		const mockDb = {
			select: vi
				.fn()
				// First: devices+rooms with WHERE on siteId (conditional branch)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([rowSiteA]),
								}),
							}),
						}),
					}),
				})
				// Second: roomHeatState
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Third: roomAlertState
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Fourth: roomThresholds
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Fifth: sites
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([{ id: "site-a", name: "Site A" }]),
				})
				// Sixth: defaultThresholds
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "site-a" });
		expect(result.unassigned).toHaveLength(1);
		expect(result.unassigned[0]?.siteId).toBe("site-a");
	});

	it("siteId='all': returns devices from all sites", async () => {
		const rows = [
			{
				device: {
					id: "d1",
					tuyaDeviceId: "t1",
					name: "A",
					deviceType: "sensor",
					siteId: "site-a",
				},
				room: null,
			},
			{
				device: {
					id: "d2",
					tuyaDeviceId: "t2",
					name: "B",
					deviceType: "sensor",
					siteId: "site-b",
				},
				room: null,
			},
		];

		const mockDb = {
			select: vi
				.fn()
				// First: full scan (no WHERE)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue(rows),
								}),
							}),
						}),
					}),
				})
				// Second: roomHeatState
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Third: roomAlertState
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Fourth: roomThresholds
				.mockReturnValueOnce({ from: vi.fn().mockResolvedValue([]) })
				// Fifth: sites
				.mockReturnValueOnce({
					from: vi.fn().mockResolvedValue([
						{ id: "site-a", name: "Site A" },
						{ id: "site-b", name: "Site B" },
					]),
				})
				// Sixth: defaultThresholds
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		};

		const caller = createCaller({
			db: mockDb as never,
			session: { user: { id: "u1", email: "test@test.com" } } as never,
			headers: new Headers(),
		});

		const result = await caller.device.overview({ siteId: "all" });
		expect(result.unassigned).toHaveLength(2);
	});
});
