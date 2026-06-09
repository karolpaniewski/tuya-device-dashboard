CREATE TABLE `.bootstrap-scaffold_device_room_assignment` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`device_id` text(255) NOT NULL,
	`room_id` text(255) NOT NULL,
	`assignedAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `.bootstrap-scaffold_device`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `.bootstrap-scaffold_room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_device_room_assignment_device_id_unique` ON `.bootstrap-scaffold_device_room_assignment` (`device_id`);--> statement-breakpoint
CREATE INDEX `assignment_room_idx` ON `.bootstrap-scaffold_device_room_assignment` (`room_id`);--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_device` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`tuya_device_id` text(255) NOT NULL,
	`gateway_id` text(255),
	`name` text(255) NOT NULL,
	`device_type` text(10) NOT NULL,
	`ip_address` text(45),
	`local_key` text(255),
	`product_key` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`gateway_id`) REFERENCES `.bootstrap-scaffold_gateway`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "device_type_check" CHECK(".bootstrap-scaffold_device"."device_type" IN ('sensor', 'valve', 'plug'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_device_tuya_device_id_unique` ON `.bootstrap-scaffold_device` (`tuya_device_id`);--> statement-breakpoint
CREATE INDEX `device_gateway_idx` ON `.bootstrap-scaffold_device` (`gateway_id`);--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_gateway` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`tuya_gateway_id` text(255) NOT NULL,
	`name` text(255) NOT NULL,
	`ip_address` text(45),
	`local_key` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_gateway_tuya_gateway_id_unique` ON `.bootstrap-scaffold_gateway` (`tuya_gateway_id`);--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_room_threshold` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`room_id` text(255) NOT NULL,
	`min_temp_c` real,
	`max_temp_c` real,
	`anomaly_gap_c` real,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`room_id`) REFERENCES `.bootstrap-scaffold_room`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "threshold_order_check" CHECK(".bootstrap-scaffold_room_threshold"."min_temp_c" IS NULL OR ".bootstrap-scaffold_room_threshold"."max_temp_c" IS NULL OR ".bootstrap-scaffold_room_threshold"."min_temp_c" < ".bootstrap-scaffold_room_threshold"."max_temp_c")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_room_threshold_room_id_unique` ON `.bootstrap-scaffold_room_threshold` (`room_id`);--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_room` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_user` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`email` text(255) NOT NULL,
	`passwordHash` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_user_email_unique` ON `.bootstrap-scaffold_user` (`email`);--> statement-breakpoint
CREATE INDEX `user_email_idx` ON `.bootstrap-scaffold_user` (`email`);