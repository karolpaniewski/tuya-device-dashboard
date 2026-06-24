import { sql } from "drizzle-orm";
import {
	check,
	index,
	sqliteTableCreator,
	unique,
} from "drizzle-orm/sqlite-core";

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
	// Path to the site's uploaded floor-plan image under public/uploads/floor-plans/.
	// Null means no floor plan has been uploaded yet.
	floorPlanImagePath: d.text("floor_plan_image_path", { length: 255 }),
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
		// Map View placement, as a percentage pair within the site's floor-plan image.
		// Both null means the device is in the unplaced roster.
		mapXPct: d.real("map_x_pct"),
		mapYPct: d.real("map_y_pct"),
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

export const roomHeatState = createTable("room_heat_state", (d) => ({
	id: d
		.text({ length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	roomId: d
		.text("room_id", { length: 255 })
		.notNull()
		.unique()
		.references(() => rooms.id, { onDelete: "cascade" }),
	pinnedOff: d
		.integer("pinned_off", { mode: "boolean" })
		.notNull()
		.default(false),
	pinnedAt: d.integer("pinned_at", { mode: "timestamp" }),
	releasedAt: d.integer("released_at", { mode: "timestamp" }),
	createdAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

export const notificationContacts = createTable(
	"notification_contact",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		email: d.text({ length: 255 }).notNull().unique(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	}),
);

export const roomAlertState = createTable(
	"room_alert_state",
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
		lastBadge: d.text("last_badge", { length: 10 }).notNull().default("OK"),
		enteredAt: d.integer("entered_at", { mode: "timestamp" }),
		notifiedAt: d.integer("notified_at", { mode: "timestamp" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		check(
			"room_alert_state_last_badge_check",
			sql`${t.lastBadge} IN ('OK', 'Too Cold', 'Too Hot')`,
		),
	],
);

export const automationModes = createTable("automation_mode", (d) => ({
	id: d
		.text({ length: 255 })
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: d.text({ length: 255 }).notNull(),
	// JSON array of Date.getDay() values.
	// null means manual-trigger-only — no schedule attached.
	daysOfWeek: d.text("days_of_week", { length: 20 }),
	fireHour: d.integer("fire_hour"),
	fireMinute: d.integer("fire_minute"),
	createdAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

export const automationModeTargets = createTable(
	"automation_mode_target",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		modeId: d
			.text("mode_id", { length: 255 })
			.notNull()
			.references(() => automationModes.id, { onDelete: "cascade" }),
		roomId: d
			.text("room_id", { length: 255 })
			.notNull()
			.references(() => rooms.id, { onDelete: "cascade" }),
		// true = open valve, false = close valve
		targetOn: d.integer("target_on", { mode: "boolean" }).notNull(),
	}),
	(t) => [
		unique("mode_target_mode_room_unique").on(t.modeId, t.roomId),
		index("mode_target_room_idx").on(t.roomId),
	],
);

export const automationModeActivationLogs = createTable(
	"automation_mode_activation_log",
	(d) => ({
		id: d
			.text({ length: 255 })
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		modeId: d
			.text("mode_id", { length: 255 })
			.notNull()
			.references(() => automationModes.id, { onDelete: "cascade" }),
		roomId: d
			.text("room_id", { length: 255 })
			.notNull()
			.references(() => rooms.id, { onDelete: "cascade" }),
		triggeredBy: d.text("triggered_by", { length: 10 }).notNull(),
		// Denormalized snapshot of what was attempted, so the log stays meaningful
		// after a mode is later edited.
		targetOn: d.integer("target_on", { mode: "boolean" }).notNull(),
		status: d.text({ length: 10 }).notNull(),
		// nullable — populated on status = 'failed'
		error: d.text({ length: 500 }),
		firedAt: d.integer("fired_at", { mode: "timestamp" }).notNull(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	}),
	(t) => [
		index("mode_log_mode_idx").on(t.modeId),
		index("mode_log_room_idx").on(t.roomId),
		index("mode_log_fired_at_idx").on(t.firedAt),
		check(
			"mode_log_triggered_by_check",
			sql`${t.triggeredBy} IN ('schedule', 'manual')`,
		),
		check(
			"mode_log_status_check",
			sql`${t.status} IN ('applied', 'skipped-pinned', 'failed')`,
		),
	],
);

export const defaultThresholds = createTable(
	"default_threshold",
	(d) => ({
		// Always the literal string "default" — singleton row, app-wide fallback
		// used when a room has no per-room override (see roomThresholds).
		id: d.text({ length: 255 }).primaryKey(),
		minTempC: d.real("min_temp_c").notNull(),
		maxTempC: d.real("max_temp_c").notNull(),
		anomalyGapC: d.real("anomaly_gap_c").notNull(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		check("default_threshold_order_check", sql`${t.minTempC} < ${t.maxTempC}`),
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
