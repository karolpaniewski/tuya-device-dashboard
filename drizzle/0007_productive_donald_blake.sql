PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_.bootstrap-scaffold_device` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`tuya_device_id` text(255) NOT NULL,
	`gateway_id` text(255),
	`name` text(255) NOT NULL,
	`device_type` text(10) NOT NULL,
	`ip_address` text(45),
	`local_key` text(255),
	`product_key` text(255),
	`node_id` text(20),
	`sort_order` integer DEFAULT 0 NOT NULL,
	`site_id` text(255) DEFAULT 'default' NOT NULL,
	`source` text(10) DEFAULT 'real' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`gateway_id`) REFERENCES `.bootstrap-scaffold_gateway`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`site_id`) REFERENCES `.bootstrap-scaffold_site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "device_type_check" CHECK("__new_.bootstrap-scaffold_device"."device_type" IN ('sensor', 'valve', 'plug')),
	CONSTRAINT "device_source_check" CHECK("__new_.bootstrap-scaffold_device"."source" IN ('real', 'demo'))
);
--> statement-breakpoint
INSERT INTO `__new_.bootstrap-scaffold_device`("id", "tuya_device_id", "gateway_id", "name", "device_type", "ip_address", "local_key", "product_key", "node_id", "sort_order", "site_id", "createdAt", "updatedAt") SELECT "id", "tuya_device_id", "gateway_id", "name", "device_type", "ip_address", "local_key", "product_key", "node_id", "sort_order", "site_id", "createdAt", "updatedAt" FROM `.bootstrap-scaffold_device`;--> statement-breakpoint
DROP TABLE `.bootstrap-scaffold_device`;--> statement-breakpoint
ALTER TABLE `__new_.bootstrap-scaffold_device` RENAME TO `.bootstrap-scaffold_device`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_device_tuya_device_id_unique` ON `.bootstrap-scaffold_device` (`tuya_device_id`);--> statement-breakpoint
CREATE INDEX `device_gateway_idx` ON `.bootstrap-scaffold_device` (`gateway_id`);--> statement-breakpoint
CREATE INDEX `device_site_idx` ON `.bootstrap-scaffold_device` (`site_id`);--> statement-breakpoint
CREATE TABLE `__new_.bootstrap-scaffold_gateway` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`tuya_gateway_id` text(255) NOT NULL,
	`name` text(255) NOT NULL,
	`ip_address` text(45),
	`local_key` text(255),
	`site_id` text(255) DEFAULT 'default' NOT NULL,
	`source` text(10) DEFAULT 'real' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`site_id`) REFERENCES `.bootstrap-scaffold_site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "gateway_source_check" CHECK("__new_.bootstrap-scaffold_gateway"."source" IN ('real', 'demo'))
);
--> statement-breakpoint
INSERT INTO `__new_.bootstrap-scaffold_gateway`("id", "tuya_gateway_id", "name", "ip_address", "local_key", "site_id", "createdAt", "updatedAt") SELECT "id", "tuya_gateway_id", "name", "ip_address", "local_key", "site_id", "createdAt", "updatedAt" FROM `.bootstrap-scaffold_gateway`;--> statement-breakpoint
DROP TABLE `.bootstrap-scaffold_gateway`;--> statement-breakpoint
ALTER TABLE `__new_.bootstrap-scaffold_gateway` RENAME TO `.bootstrap-scaffold_gateway`;--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_gateway_tuya_gateway_id_unique` ON `.bootstrap-scaffold_gateway` (`tuya_gateway_id`);--> statement-breakpoint
CREATE INDEX `gateway_site_idx` ON `.bootstrap-scaffold_gateway` (`site_id`);--> statement-breakpoint
CREATE TABLE `__new_.bootstrap-scaffold_room` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`site_id` text(255) DEFAULT 'default' NOT NULL,
	`source` text(10) DEFAULT 'real' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`site_id`) REFERENCES `.bootstrap-scaffold_site`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "room_source_check" CHECK("__new_.bootstrap-scaffold_room"."source" IN ('real', 'demo'))
);
--> statement-breakpoint
INSERT INTO `__new_.bootstrap-scaffold_room`("id", "name", "site_id", "createdAt", "updatedAt") SELECT "id", "name", "site_id", "createdAt", "updatedAt" FROM `.bootstrap-scaffold_room`;--> statement-breakpoint
DROP TABLE `.bootstrap-scaffold_room`;--> statement-breakpoint
ALTER TABLE `__new_.bootstrap-scaffold_room` RENAME TO `.bootstrap-scaffold_room`;--> statement-breakpoint
CREATE INDEX `room_site_idx` ON `.bootstrap-scaffold_room` (`site_id`);