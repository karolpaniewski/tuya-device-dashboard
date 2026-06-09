import { sql } from "drizzle-orm";
import { check, index, sqliteTableCreator } from "drizzle-orm/sqlite-core";

/**
 * Multi-project schema — all tables share the `.bootstrap-scaffold_` prefix.
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = sqliteTableCreator(
	(name) => `.bootstrap-scaffold_${name}`,
);

export const users = createTable(
	"user",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		email: d.text({ length: 255 }).notNull().unique(),
		passwordHash: d.text({ length: 255 }).notNull(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [index("user_email_idx").on(t.email)],
);

export const gateways = createTable("gateway", (d) => ({
	id: d
		.text({ length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	tuyaGatewayId: d.text("tuya_gateway_id", { length: 255 }).notNull().unique(),
	name: d.text({ length: 255 }).notNull(),
	ipAddress: d.text("ip_address", { length: 45 }),
	// AES-256-GCM ciphertext — use encryptLocalKey/decryptLocalKey from ~/server/lib/crypto
	localKey: d.text("local_key", { length: 255 }),
	createdAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

export const rooms = createTable("room", (d) => ({
	id: d
		.text({ length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: d.text({ length: 255 }).notNull(),
	createdAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

export const devices = createTable(
	"device",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		tuyaDeviceId: d.text("tuya_device_id", { length: 255 }).notNull().unique(),
		// nullable: device may exist before gateway pairing; S-01 must handle null joins
		gatewayId: d
			.text("gateway_id", { length: 255 })
			.references(() => gateways.id, { onDelete: "set null" }),
		name: d.text({ length: 255 }).notNull(),
		deviceType: d.text("device_type", { length: 10 }).notNull(),
		ipAddress: d.text("ip_address", { length: 45 }),
		// AES-256-GCM ciphertext — use encryptLocalKey/decryptLocalKey from ~/server/lib/crypto
		localKey: d.text("local_key", { length: 255 }),
		productKey: d.text("product_key", { length: 255 }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		check(
			"device_type_check",
			sql`${t.deviceType} IN ('sensor', 'valve', 'plug')`,
		),
		index("device_gateway_idx").on(t.gatewayId),
	],
);

export const deviceRoomAssignments = createTable(
	"device_room_assignment",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		deviceId: d
			.text("device_id", { length: 255 })
			.notNull()
			.unique()
			.references(() => devices.id, { onDelete: "cascade" }),
		roomId: d
			.text("room_id", { length: 255 })
			.notNull()
			.references(() => rooms.id, { onDelete: "cascade" }),
		assignedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	}),
	(t) => [index("assignment_room_idx").on(t.roomId)],
);

export const roomThresholds = createTable(
	"room_threshold",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		roomId: d
			.text("room_id", { length: 255 })
			.notNull()
			.unique()
			.references(() => rooms.id, { onDelete: "cascade" }),
		minTempC: d.real("min_temp_c"),
		maxTempC: d.real("max_temp_c"),
		anomalyGapC: d.real("anomaly_gap_c"),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		check(
			"threshold_order_check",
			sql`${t.minTempC} IS NULL OR ${t.maxTempC} IS NULL OR ${t.minTempC} < ${t.maxTempC}`,
		),
	],
);
