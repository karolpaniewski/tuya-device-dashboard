CREATE TABLE `.bootstrap-scaffold_site` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
INSERT OR IGNORE INTO `.bootstrap-scaffold_site` (`id`, `name`, `createdAt`) VALUES ('default', 'Default', unixepoch());
--> statement-breakpoint
ALTER TABLE `.bootstrap-scaffold_device` ADD `site_id` text(255) DEFAULT 'default' NOT NULL REFERENCES `.bootstrap-scaffold_site`(`id`);--> statement-breakpoint
CREATE INDEX `device_site_idx` ON `.bootstrap-scaffold_device` (`site_id`);--> statement-breakpoint
ALTER TABLE `.bootstrap-scaffold_gateway` ADD `site_id` text(255) DEFAULT 'default' NOT NULL REFERENCES `.bootstrap-scaffold_site`(`id`);--> statement-breakpoint
CREATE INDEX `gateway_site_idx` ON `.bootstrap-scaffold_gateway` (`site_id`);--> statement-breakpoint
ALTER TABLE `.bootstrap-scaffold_room` ADD `site_id` text(255) DEFAULT 'default' NOT NULL REFERENCES `.bootstrap-scaffold_site`(`id`);--> statement-breakpoint
CREATE INDEX `room_site_idx` ON `.bootstrap-scaffold_room` (`site_id`);