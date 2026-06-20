import { sql } from "drizzle-orm";
import { check, index, sqliteTableCreator } from "drizzle-orm/sqlite-core";

/**
 * Multi-project schema — all tables share the `.bootstrap-scaffold_` prefix.
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = sqliteTableCreator(
	(name) => `.bootstrap-scaffold_${name}`,
);

export const sites = createTable("site", (d) => ({
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

export const gateways = createTable(
	"gateway",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		tuyaGatewayId: d
			.text("tuya_gateway_id", { length: 255 })
			.notNull()
			.unique(),
		name: d.text({ length: 255 }).notNull(),
		ipAddress: d.text("ip_address", { length: 45 }),
		// AES-256-GCM ciphertext — use encryptLocalKey/decryptLocalKey from ~/server/lib/crypto
		localKey: d.text("local_key", { length: 255 }),
		siteId: d
			.text("site_id", { length: 255 })
			.notNull()
			.default("default")
			.references(() => sites.id, { onDelete: "restrict" }),
		// 'real' = live hardware, 'demo' = fabricated fixtures for demoing without
		// touching real devices. Hardcoded filter for now — see ACTIVE_DEVICE_SOURCE.
		source: d.text({ length: 10 }).notNull().default("real"),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("gateway_site_idx").on(t.siteId),
		check("gateway_source_check", sql`${t.source} IN ('real', 'demo')`),
	],
);

export const rooms = createTable(
	"room",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: d.text({ length: 255 }).notNull(),
		siteId: d
			.text("site_id", { length: 255 })
			.notNull()
			.default("default")
			.references(() => sites.id, { onDelete: "restrict" }),
		// 'real' = live hardware, 'demo' = fabricated fixtures for demoing without
		// touching real devices. Hardcoded filter for now — see ACTIVE_DEVICE_SOURCE.
		source: d.text({ length: 10 }).notNull().default("real"),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("room_site_idx").on(t.siteId),
		check("room_source_check", sql`${t.source} IN ('real', 'demo')`),
	],
);

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
		// Zigbee node ID — used as TuyAPI `cid` for sub-device addressing through gateway
		nodeId: d.text("node_id", { length: 20 }),
		sortOrder: d.integer("sort_order").notNull().default(0),
		siteId: d
			.text("site_id", { length: 255 })
			.notNull()
			.default("default")
			.references(() => sites.id, { onDelete: "restrict" }),
		// 'real' = live hardware, 'demo' = fabricated fixtures for demoing without
		// touching real devices. Hardcoded filter for now — see ACTIVE_DEVICE_SOURCE.
		source: d.text({ length: 10 }).notNull().default("real"),
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
		check("device_source_check", sql`${t.source} IN ('real', 'demo')`),
		index("device_gateway_idx").on(t.gatewayId),
		index("device_site_idx").on(t.siteId),
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

export const deviceTemperatureReadings = createTable(
	"device_temperature_reading",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		// Denormalized — no FK — poller has tuyaDeviceId directly, avoids join on every write
		tuyaDeviceId: d.text("tuya_device_id", { length: 255 }).notNull(),
		temperatureC: d.real("temperature_c"),
		setpointC: d.real("setpoint_c"),
		recordedAt: d
			.integer("recorded_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	}),
	(t) => [
		index("reading_device_time_idx").on(t.tuyaDeviceId, t.recordedAt),
		index("reading_time_idx").on(t.recordedAt),
	],
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

export const automationRules = createTable(
	"automation_rule",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: d.text({ length: 255 }).notNull(),
		deviceId: d
			.text("device_id", { length: 255 })
			.notNull()
			.references(() => devices.id, { onDelete: "cascade" }),
		// JSON array of Date.getDay() values, e.g. "[1,2,3,4,5]" for weekdays
		daysOfWeek: d.text("days_of_week", { length: 20 }).notNull(),
		fireHour: d.integer("fire_hour").notNull(),
		fireMinute: d.integer("fire_minute").notNull(),
		targetSetpointC: d.real("target_setpoint_c").notNull(),
		// nullable — skip firing if room avg temp >= this value
		tempThresholdC: d.real("temp_threshold_c"),
		isEnabled: d
			.integer("is_enabled", { mode: "boolean" })
			.notNull()
			.default(true),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("automation_rule_device_idx").on(t.deviceId),
		check("automation_rule_hour_check", sql`${t.fireHour} BETWEEN 0 AND 23`),
		check(
			"automation_rule_minute_check",
			sql`${t.fireMinute} BETWEEN 0 AND 59`,
		),
	],
);

export const automationExecutionLogs = createTable(
	"automation_execution_log",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		ruleId: d
			.text("rule_id", { length: 255 })
			.notNull()
			.references(() => automationRules.id, { onDelete: "cascade" }),
		firedAt: d.integer("fired_at", { mode: "timestamp" }).notNull(),
		status: d.text({ length: 10 }).notNull(),
		// nullable — populated on status = 'failed'
		error: d.text({ length: 500 }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	}),
	(t) => [
		index("exec_log_rule_idx").on(t.ruleId),
		index("exec_log_fired_at_idx").on(t.firedAt),
		check(
			"exec_log_status_check",
			sql`${t.status} IN ('success', 'failed', 'skipped')`,
		),
	],
);

export const dashboardLayout = createTable("dashboard_layout", (d) => ({
	// Always the literal string "default" — singleton row, no per-user scoping
	// (see context/changes/dashboard-personalization/frame.md).
	id: d.text({ length: 255 }).primaryKey(),
	// JSON array of widget id strings, e.g. '["kpi-total","kpi-online",...]'
	widgetOrder: d.text("widget_order").notNull(),
	// JSON array of hidden widget id strings
	hiddenWidgets: d.text("hidden_widgets").notNull().default("[]"),
	// JSON array of room id strings, global order applied within whichever grouping is rendered
	roomOrder: d.text("room_order").notNull().default("[]"),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));
